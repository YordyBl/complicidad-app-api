/**
 * Express controller for sale endpoints.
 *
 * Translates between HTTP request/responses and the application use cases.
 * No domain logic here — just request parsing, validation, and response shaping.
 */
import type { Request, Response } from 'express';
import type { UnitOfWork } from '../../../../shared/application/UnitOfWork.js';
import type { CreateSaleUseCase } from '../../application/use-cases/CreateSaleUseCase.js';
import type { CancelSaleUseCase } from '../../application/use-cases/CancelSaleUseCase.js';
import type { ReturnFullSaleUseCase } from '../../application/use-cases/ReturnFullSaleUseCase.js';
import type { SettleSaleBalanceUseCase } from '../../application/use-cases/SettleSaleBalanceUseCase.js';
import type { ListSalesUseCase } from '../../application/use-cases/ListSalesUseCase.js';
import type { GetSaleDetailUseCase } from '../../application/use-cases/GetSaleDetailUseCase.js';
import type { SaleFilters } from '../../domain/SaleRepository.js';
import type { SaleListQuery } from '../../application/ports/SaleListReadRepository.js';
import { SALE_CHANNELS } from '../../domain/Sale.js';
import type { SaleChannel } from '../../domain/Sale.js';
import { PAYMENT_STATUSES } from '../../domain/Sale.js';
import { NotFoundError } from '../../../../shared/domain/errors.js';

// Valid filter values defined in the domain spec
const VALID_SALE_STATUSES = new Set(['ACTIVE', 'CANCELLED', 'RETURNED']);
const VALID_PAYMENT_STATUSES = new Set(PAYMENT_STATUSES);
const VALID_SORT_BY = new Set(['createdAt', 'totalRevenueCents', 'totalCostCents', 'grossProfitCents']);

// Simple UUID v4 regex for path param validation
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class SaleController {
  constructor(
    private readonly createSaleUseCase: CreateSaleUseCase,
    private readonly cancelSaleUseCase: CancelSaleUseCase,
    private readonly returnFullSaleUseCase: ReturnFullSaleUseCase,
    private readonly settleSaleBalanceUseCase: SettleSaleBalanceUseCase,
    private readonly uow: UnitOfWork,
    private readonly listSalesUseCase?: ListSalesUseCase,
    private readonly getSaleDetailUseCase?: GetSaleDetailUseCase,
  ) {}

  /**
   * POST /sales — create a multi-item sale.
   * Items specify priceType (regular|presale); the backend resolves
   * the authoritative unit price from the Product.
   */
  async create(req: Request, res: Response): Promise<void> {
    const { customerId, channel, channelReference, items, amountPaidNowCents } = req.body as Record<string, unknown>;

    if (typeof customerId !== 'string') {
      res.status(400).json({ error: 'ValidationError', message: 'customerId es obligatorio y debe ser un string' });
      return;
    }
    if (typeof channel !== 'string' || !SALE_CHANNELS.includes(channel as SaleChannel)) {
      res.status(400).json({
        error: 'ValidationError',
        message: `channel inválido "${String(channel)}". Debe ser uno de: ${SALE_CHANNELS.join(', ')}`,
      });
      return;
    }
    if (!Array.isArray(items) || items.length === 0) {
      res.status(400).json({ error: 'ValidationError', message: 'items debe ser un array no vacío' });
      return;
    }

    // Validate amountPaidNowCents if provided (early rejection for negative/non-integer)
    if (amountPaidNowCents !== undefined) {
      if (typeof amountPaidNowCents !== 'number' || !Number.isInteger(amountPaidNowCents)) {
        res.status(400).json({
          error: 'ValidationError',
          message: 'amountPaidNowCents debe ser un número entero (centavos)',
        });
        return;
      }
      if (amountPaidNowCents < 0) {
        res.status(400).json({
          error: 'ValidationError',
          message: 'El monto pagado no puede ser negativo',
        });
        return;
      }
    }

    // Validate each item — priceType replaces unitPriceCents
    const validPriceTypes = new Set(['regular', 'presale']);
    const parsedItems: { variantId: string; quantity: number; priceType: string }[] = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i] as Record<string, unknown> | undefined;
      if (!item || typeof item.variantId !== 'string' || typeof item.quantity !== 'number' || typeof item.priceType !== 'string') {
        res.status(400).json({
          error: 'ValidationError',
          message: `items[${String(i)}] debe tener variantId (string), quantity (number) y priceType (string: "regular" | "presale")`,
        });
        return;
      }
      if (!validPriceTypes.has(item.priceType)) {
        res.status(400).json({
          error: 'ValidationError',
          message: `items[${String(i)}].priceType debe ser "regular" o "presale", se recibió "${item.priceType}"`,
        });
        return;
      }
      parsedItems.push({ variantId: item.variantId, quantity: item.quantity, priceType: item.priceType });
    }

    const command: Record<string, unknown> = {
      customerId,
      channel,
      ...(typeof channelReference === 'string' ? { channelReference } : {}),
      items: parsedItems,
    };

    if (amountPaidNowCents !== undefined) {
      command.amountPaidNowCents = amountPaidNowCents;
    }

    const result = await this.createSaleUseCase.execute(
      command as unknown as Parameters<typeof this.createSaleUseCase.execute>[0],
      this.uow,
    );

    if (!result.ok) {
      const status = result.error.name === 'NotFoundError' ? 404 : 400;
      res.status(status).json({ error: result.error.name, message: result.error.message });
      return;
    }

    res.status(201).json(result.value);
  }

  /**
   * POST /sales/:id/cancel — cancel an active sale.
   */
  async cancel(req: Request, res: Response): Promise<void> {
    const id = req.params.id as string | undefined;
    if (!id) {
      res.status(400).json({ error: 'ValidationError', message: 'El ID de venta es obligatorio' });
      return;
    }

    const result = await this.cancelSaleUseCase.execute({ saleId: id }, this.uow);

    if (!result.ok) {
      const status = result.error.name === 'NotFoundError' ? 404 : 400;
      res.status(status).json({ error: result.error.name, message: result.error.message });
      return;
    }

    res.status(200).json(result.value);
  }

  /**
   * POST /sales/:id/return — return a full sale.
   */
  async returnSale(req: Request, res: Response): Promise<void> {
    const id = req.params.id as string | undefined;
    if (!id) {
      res.status(400).json({ error: 'ValidationError', message: 'El ID de venta es obligatorio' });
      return;
    }

    const result = await this.returnFullSaleUseCase.execute({ saleId: id }, this.uow);

    if (!result.ok) {
      const status = result.error.name === 'NotFoundError' ? 404 : 400;
      res.status(status).json({ error: result.error.name, message: result.error.message });
      return;
    }

    res.status(200).json(result.value);
  }

  /**
   * POST /sales/:id/settle-balance — settle the pending balance of a sale.
   */
  async settleBalance(req: Request, res: Response): Promise<void> {
    const id = req.params.id as string | undefined;
    if (!id) {
      res.status(400).json({ error: 'ValidationError', message: 'El ID de venta es obligatorio' });
      return;
    }

    const result = await this.settleSaleBalanceUseCase.execute({ saleId: id }, this.uow);

    if (!result.ok) {
      const status = result.error.name === 'NotFoundError' ? 404 : 400;
      res.status(status).json({ error: result.error.name, message: result.error.message });
      return;
    }

    res.status(200).json(result.value);
  }

  /**
   * GET /sales — list sales with pagination, filters, sort, and search.
   *
   * Query parameters:
   * - page, pageSize: pagination (defaults: 1, 20)
   * - search: free-text search on customer name
   * - status: ACTIVE | CANCELLED | RETURNED
   * - paymentStatus: pending | partial | paid
   * - dateFrom, dateTo: ISO date range
   * - sortBy: createdAt | totalRevenueCents | totalCostCents | grossProfitCents
   * - sortOrder: asc | desc (default desc)
   */
  async list(req: Request, res: Response): Promise<void> {
    if (!this.listSalesUseCase) {
      res.status(503).json({
        error: 'ServiceUnavailable',
        message: 'El listado de ventas no está disponible',
      });
      return;
    }

    const query = req.query as Record<string, string | undefined>;

    // Validate status filter
    if (query.status && !VALID_SALE_STATUSES.has(query.status)) {
      res.status(400).json({
        error: 'ValidationError',
        message: `Estado inválido "${query.status}". Debe ser uno de: ACTIVE, CANCELLED, RETURNED`,
      });
      return;
    }

    // Validate paymentStatus filter
    if (query.paymentStatus && !(VALID_PAYMENT_STATUSES as Set<string>).has(query.paymentStatus)) {
      res.status(400).json({
        error: 'ValidationError',
        message: `paymentStatus inválido "${query.paymentStatus}". Debe ser uno de: ${PAYMENT_STATUSES.join(', ')}`,
      });
      return;
    }

    // Validate sortOrder
    if (query.sortOrder && query.sortOrder !== 'asc' && query.sortOrder !== 'desc') {
      res.status(400).json({
        error: 'ValidationError',
        message: `sortOrder inválido "${query.sortOrder}". Debe ser "asc" o "desc"`,
      });
      return;
    }

    // Validate sortBy
    if (query.sortBy && !VALID_SORT_BY.has(query.sortBy)) {
      res.status(400).json({
        error: 'ValidationError',
        message: `sortBy inválido "${query.sortBy}". Debe ser uno de: createdAt, totalRevenueCents, totalCostCents, grossProfitCents`,
      });
      return;
    }

    // Parse numeric params
    const page = query.page ? parseInt(query.page, 10) : undefined;
    const pageSize = query.pageSize ? parseInt(query.pageSize, 10) : undefined;
    if ((page !== undefined && (isNaN(page) || page < 1)) || (pageSize !== undefined && (isNaN(pageSize) || pageSize < 1))) {
      res.status(400).json({
        error: 'ValidationError',
        message: 'page y pageSize deben ser enteros positivos',
      });
      return;
    }

    const saleListQuery: SaleListQuery = {};
    if (page !== undefined) saleListQuery.page = page;
    if (pageSize !== undefined) saleListQuery.pageSize = pageSize;
    if (query.search) saleListQuery.search = query.search;
    if (query.status) saleListQuery.status = query.status as 'ACTIVE' | 'CANCELLED' | 'RETURNED';

    // paymentStatus: valid values guaranteed by the guard above
    const paymentStatusVal = query.paymentStatus;
    if (paymentStatusVal && (VALID_PAYMENT_STATUSES as Set<string>).has(paymentStatusVal)) {
      (saleListQuery as Record<string, unknown>).paymentStatus = paymentStatusVal;
    }
    if (query.dateFrom) saleListQuery.dateFrom = query.dateFrom;
    if (query.dateTo) saleListQuery.dateTo = query.dateTo;

    // sortBy: valid values guaranteed by the guard above
    const sortByVal = query.sortBy;
    if (sortByVal && VALID_SORT_BY.has(sortByVal)) {
      (saleListQuery as Record<string, unknown>).sortBy = sortByVal;
    }
    if (query.sortOrder) saleListQuery.sortOrder = query.sortOrder as 'asc' | 'desc';

    // Try paginated path first, fall back to legacy array path
    if (typeof this.listSalesUseCase.executePaginated === 'function') {
      const pageResult = await this.listSalesUseCase.executePaginated(saleListQuery);
      res.status(200).json(pageResult);
      return;
    }

    // Legacy fallback
    const filters: SaleFilters = {};
    if (query.customerId) filters.customerId = query.customerId;
    if (query.status) filters.status = query.status as 'ACTIVE' | 'CANCELLED' | 'RETURNED';
    if (query.dateFrom) filters.dateFrom = query.dateFrom;
    if (query.dateTo) filters.dateTo = query.dateTo;
    if (query.sortOrder) filters.sortOrder = query.sortOrder as 'asc' | 'desc';

    const sales = await this.listSalesUseCase.execute(
      Object.keys(filters).length > 0 ? filters : undefined,
    );
    res.status(200).json(sales);
  }

  /**
   * GET /sales/:id — get a single sale with full detail.
   */
  async getById(req: Request, res: Response): Promise<void> {
    if (!this.getSaleDetailUseCase) {
      res.status(503).json({
        error: 'ServiceUnavailable',
        message: 'El detalle de venta no está disponible',
      });
      return;
    }

    const id = req.params.id as string | undefined;
    if (!id) {
      res.status(400).json({ error: 'ValidationError', message: 'El ID de venta es obligatorio' });
      return;
    }

    // Validate UUID format
    if (!UUID_REGEX.test(id)) {
      res.status(400).json({
        error: 'ValidationError',
        message: `Formato de ID de venta inválido: "${id}". Debe ser un UUID válido.`,
      });
      return;
    }

    const result = await this.getSaleDetailUseCase.execute({ saleId: id });

    if (!result.ok) {
      if (result.error instanceof NotFoundError) {
        res.status(404).json({ error: 'NotFoundError', message: result.error.message });
        return;
      }
      res.status(400).json({ error: result.error.name, message: result.error.message });
      return;
    }

    res.status(200).json(result.value);
  }
}

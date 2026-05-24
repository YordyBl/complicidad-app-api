/**
 * Express controller for customer endpoints.
 *
 * Translates between HTTP request/responses and the application use cases.
 * No domain logic here — just request parsing, validation, and response shaping.
 */
import type { Request, Response } from 'express';
import type { CreateCustomerUseCase } from '../../application/use-cases/CreateCustomerUseCase.js';
import type { UpdateCustomerUseCase } from '../../application/use-cases/UpdateCustomerUseCase.js';
import type { GetCustomerUseCase } from '../../application/use-cases/GetCustomerUseCase.js';
import type { ListCustomersUseCase } from '../../application/use-cases/ListCustomersUseCase.js';
import type { GetCustomerHistoryUseCase } from '../../application/use-cases/GetCustomerHistoryUseCase.js';
import type { UnitOfWork } from '../../../../shared/application/UnitOfWork.js';
import { NotFoundError } from '../../../../shared/domain/errors.js';

export class CustomerController {
  constructor(
    private readonly createCustomerUseCase: CreateCustomerUseCase,
    private readonly updateCustomerUseCase: UpdateCustomerUseCase,
    private readonly getCustomerUseCase: GetCustomerUseCase,
    private readonly listCustomersUseCase: ListCustomersUseCase,
    private readonly getCustomerHistoryUseCase: GetCustomerHistoryUseCase,
    private readonly uow: UnitOfWork,
  ) {}

  /**
   * POST /customers — create a new customer.
   */
  async create(req: Request, res: Response): Promise<void> {
    const { name, email, phone, alias, address, googleMapsUrl, notes, district } = req.body as Record<string, unknown>;

    // Basic type validation
    if (typeof name !== 'string') {
      res.status(400).json({ error: 'ValidationError', message: 'name es obligatorio y debe ser un string' });
      return;
    }

    const result = await this.createCustomerUseCase.execute({
      name,
      email: typeof email === 'string' ? email : null,
      phone: typeof phone === 'string' ? phone : null,
      alias: typeof alias === 'string' ? alias : null,
      address: typeof address === 'string' ? address : null,
      googleMapsUrl: typeof googleMapsUrl === 'string' ? googleMapsUrl : null,
      notes: typeof notes === 'string' ? notes : null,
      district: typeof district === 'string' ? district : null,
    });

    if (!result.ok) {
      res.status(400).json({ error: result.error.name, message: result.error.message });
      return;
    }

    res.status(201).json(result.value);
  }

  /**
   * GET /customers — list all customers.
   */
  async list(_req: Request, res: Response): Promise<void> {
    const customers = await this.listCustomersUseCase.execute();
    res.status(200).json(customers);
  }

  /**
   * GET /customers/:id — get a single customer.
   */
  async getById(req: Request, res: Response): Promise<void> {
    const id = req.params.id as string | undefined;
    if (!id) {
      res.status(400).json({ error: 'ValidationError', message: 'El ID de cliente es obligatorio' });
      return;
    }

    const result = await this.getCustomerUseCase.execute({ customerId: id });

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

  /**
   * PUT /customers/:id — update an existing customer.
   */
  async update(req: Request, res: Response): Promise<void> {
    const id = req.params.id as string | undefined;
    if (!id) {
      res.status(400).json({ error: 'ValidationError', message: 'El ID de cliente es obligatorio' });
      return;
    }
    const { name, email, phone, alias, address, googleMapsUrl, notes, district } = req.body as Record<string, unknown>;

    if (typeof name !== 'string') {
      res.status(400).json({ error: 'ValidationError', message: 'name es obligatorio y debe ser un string' });
      return;
    }

    const result = await this.updateCustomerUseCase.execute({
      customerId: id,
      name,
      email: typeof email === 'string' ? email : null,
      phone: typeof phone === 'string' ? phone : null,
      alias: typeof alias === 'string' ? alias : null,
      address: typeof address === 'string' ? address : null,
      googleMapsUrl: typeof googleMapsUrl === 'string' ? googleMapsUrl : null,
      notes: typeof notes === 'string' ? notes : null,
      district: typeof district === 'string' ? district : null,
    });

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

  /**
   * GET /customers/:id/history — get customer purchase history derived from sales.
   */
  async history(req: Request, res: Response): Promise<void> {
    const id = req.params.id as string | undefined;
    if (!id) {
      res.status(400).json({ error: 'ValidationError', message: 'El ID de cliente es obligatorio' });
      return;
    }

    const result = await this.getCustomerHistoryUseCase.execute(
      { customerId: id },
      this.uow,
    );

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

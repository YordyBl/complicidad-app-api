/**
 * tsoa entry point — controller wrappers for OpenAPI spec generation only.
 *
 * These classes exist SOLELY for tsoa to scan and generate swagger.json.
 * The ACTUAL request routing is done by the existing Express Router setup
 * in each module's routes file.
 *
 * Each wrapper extends the tsoa Controller base class and mirrors the
 * real controller's API surface with the same routes, parameters, and
 * response types so the generated spec accurately reflects the API.
 */

import {
  Controller,
  Route,
  Tags,
  Post,
  Get,
  Put,
  Path,
  Query,
  Body,
  Security,
  SuccessResponse,
  Response,
} from '@tsoa/runtime';

// ────────────────────────────────────────────────────────────────────────────
// Shared types used across multiple endpoints
// ────────────────────────────────────────────────────────────────────────────

export interface UserDto {
  id: string;
  email: string;
  name: string;
  role: string;
}

export interface ErrorDto {
  error: string;
  message: string;
}

export interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

// ────────────────────────────────────────────────────────────────────────────
// Auth — POST /login, POST /register  (no auth required)
// ────────────────────────────────────────────────────────────────────────────

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  token: string;
  user: UserDto;
}

export interface RegisterRequest {
  email: string;
  password: string;
  role?: string;
}

export interface RegisterResponse {
  user: UserDto;
}

@Route('/api/v1/auth')
@Tags('Authentication')
export class AuthSwagger extends Controller {
  /**
   * Authenticate with email and password. Returns a JWT token and user profile.
   */
  @Post('/login')
  @SuccessResponse('200', 'Login successful')
  @Response<ErrorDto>('400', 'Validation error')
  @Response<ErrorDto>('401', 'Invalid credentials')
  async login(@Body() _body: LoginRequest): Promise<LoginResponse> {
    return {} as LoginResponse;
  }

  /**
   * Register a new user account.
   */
  @Post('/register')
  @SuccessResponse('201', 'User registered successfully')
  @Response<ErrorDto>('400', 'Validation error')
  @Response<ErrorDto>('409', 'Duplicate email')
  async register(@Body() _body: RegisterRequest): Promise<RegisterResponse> {
    return {} as RegisterResponse;
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Products — POST /products, GET /products, GET /products/:id
// ────────────────────────────────────────────────────────────────────────────

export interface CreateProductRequest {
  name: string;
  description?: string;
  baseSku: string;
  salePrice: number;
  presalePrice?: number;
  sizes: string[];
  aliases?: string[];
}

export interface ProductResponse {
  id: string;
  name: string;
  description: string | null;
  baseSku: string;
  salePrice: number;
  presalePrice: number | null;
  status: string;
  variants: Array<{
    id: string;
    size: string;
    sku: string;
    stock: number;
  }>;
  createdAt: string;
  updatedAt: string;
}

export interface ListProductsResponse {
  data: ProductResponse[];
  meta: PaginationMeta;
}

export interface SearchItemRequest {
  term: string;
}

export interface ItemSearchResult {
  variantId: string;
  sku: string;
  productName: string;
  size: string;
  salePrice: number;
  stock: number;
}

@Route('/api/v1/products')
@Tags('Products')
@Security('bearer')
export class ProductSwagger extends Controller {
  /**
   * Create a new product with auto-generated variants from sizes.
   */
  @Post()
  @SuccessResponse('201', 'Product created')
  @Response<ErrorDto>('400', 'Validation error')
  async create(@Body() _body: CreateProductRequest): Promise<ProductResponse> {
    return {} as ProductResponse;
  }

  /**
   * List products with optional pagination, search, and filters.
   */
  @Get()
  @SuccessResponse('200', 'Product list retrieved')
  @Response<ErrorDto>('400', 'Validation error')
  async list(
    @Query() page?: number,
    @Query() pageSize?: number,
    @Query() search?: string,
    @Query() status?: string,
    @Query() sortBy?: string,
    @Query() sortOrder?: 'asc' | 'desc',
  ): Promise<ListProductsResponse> {
    return {} as ListProductsResponse;
  }

  /**
   * Get a single product by its ID.
   */
  @Get('{id}')
  @SuccessResponse('200', 'Product detail retrieved')
  @Response<ErrorDto>('404', 'Product not found')
  async getById(@Path() id: string): Promise<ProductResponse> {
    return {} as ProductResponse;
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Items — GET /items/search
// ────────────────────────────────────────────────────────────────────────────

@Route('/api/v1/items')
@Tags('Inventory')
@Security('bearer')
export class ItemSwagger extends Controller {
  /**
   * Search for items by SKU or product alias.
   */
  @Get('search')
  @SuccessResponse('200', 'Search results')
  @Response<ErrorDto>('400', 'Missing or invalid search term')
  @Response<ErrorDto>('404', 'No results found')
  async search(@Query() term: string): Promise<ItemSearchResult[]> {
    return [] as ItemSearchResult[];
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Purchases — POST /purchases
// ────────────────────────────────────────────────────────────────────────────

export interface PurchaseItem {
  variantId: string;
  quantity: number;
  unitCost: number;
}

export interface RegisterPurchaseRequest {
  items: PurchaseItem[];
  supplierId?: string;
  notes?: string;
  purchaseDate?: string;
}

export interface PurchaseResponse {
  id: string;
  items: Array<{
    variantId: string;
    quantity: number;
    unitCost: number;
  }>;
  supplierId: string | null;
  notes: string | null;
  purchaseDate: string;
  createdAt: string;
}

@Route('/api/v1/purchases')
@Tags('Inventory')
@Security('bearer')
export class PurchaseSwagger extends Controller {
  /**
   * Register a batch stock purchase.
   */
  @Post()
  @SuccessResponse('201', 'Purchase registered')
  @Response<ErrorDto>('400', 'Validation error')
  async registerPurchase(
    @Body() _body: RegisterPurchaseRequest,
  ): Promise<PurchaseResponse> {
    return {} as PurchaseResponse;
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Sales — CRUD, cancel, return
// ────────────────────────────────────────────────────────────────────────────

export interface SaleItemInput {
  variantId: string;
  quantity: number;
  priceType: 'regular' | 'presale';
}

export interface CreateSaleRequest {
  customerId: string;
  channel: string;
  channelReference?: string;
  items: SaleItemInput[];
}

export interface SaleItemOutput {
  variantId: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
}

export interface SaleResponse {
  id: string;
  customerId: string;
  channel: string;
  channelReference: string | null;
  status: string;
  items: SaleItemOutput[];
  total: number;
  createdAt: string;
}

/**
 * Garment display row included in each sale list entry.
 *
 * The API computes `displayLabel` so that clients never need to
 * infer labels from raw `variantId` values.
 */
export interface SaleListItemResponse {
  lineId: string;
  variantId: string;
  productName: string | null;
  sku: string | null;
  /** Human-readable fallback: productName → SKU → "Variante sin datos". */
  displayLabel: string;
  attributes: Record<string, string>;
  quantity: number;
  unitPriceCents: number;
  priceType: 'regular' | 'presale';
}

/** One sale entry returned by GET /sales (list view with garment display items). */
export interface SaleListEntryResponse {
  saleId: string;
  customerId: string;
  channelReference: string | null;
  channel: string;
  status: string;
  totalRevenueCents: number;
  totalCostCents: number;
  grossProfitCents: number;
  lineCount: number;
  createdAt: string;
  updatedAt: string;
  items: SaleListItemResponse[];
}

export type SaleListResponse = SaleListEntryResponse[];

export interface SaleFilters {
  customerId?: string;
  status?: 'ACTIVE' | 'CANCELLED' | 'RETURNED';
  dateFrom?: string;
  dateTo?: string;
  sortOrder?: 'asc' | 'desc';
}

@Route('/api/v1/sales')
@Tags('Sales')
@Security('bearer')
export class SaleSwagger extends Controller {
  /**
   * Create a multi-item sale.
   */
  @Post()
  @SuccessResponse('201', 'Sale created')
  @Response<ErrorDto>('400', 'Validation error')
  async create(@Body() _body: CreateSaleRequest): Promise<SaleResponse> {
    return {} as SaleResponse;
  }

  /**
   * Cancel an active sale.
   */
  @Post('{id}/cancel')
  @SuccessResponse('200', 'Sale cancelled')
  @Response<ErrorDto>('400', 'Validation error')
  @Response<ErrorDto>('404', 'Sale not found')
  async cancel(@Path() id: string): Promise<SaleResponse> {
    return {} as SaleResponse;
  }

  /**
   * Return (reverse) a full sale.
   */
  @Post('{id}/return')
  @SuccessResponse('200', 'Sale returned')
  @Response<ErrorDto>('400', 'Validation error')
  @Response<ErrorDto>('404', 'Sale not found')
  async returnSale(@Path() id: string): Promise<SaleResponse> {
    return {} as SaleResponse;
  }

  /**
   * List sales with optional filters.
   */
  @Get()
  @SuccessResponse('200', 'Sale list')
  @Response<ErrorDto>('400', 'Validation error')
  async list(
    @Query() customerId?: string,
    @Query() status?: 'ACTIVE' | 'CANCELLED' | 'RETURNED',
    @Query() dateFrom?: string,
    @Query() dateTo?: string,
    @Query() sortOrder?: 'asc' | 'desc',
  ): Promise<SaleListResponse> {
    return [] as SaleListResponse;
  }

  /**
   * Get a single sale with full detail.
   */
  @Get('{id}')
  @SuccessResponse('200', 'Sale detail')
  @Response<ErrorDto>('400', 'Invalid UUID format')
  @Response<ErrorDto>('404', 'Sale not found')
  async getById(@Path() id: string): Promise<SaleResponse> {
    return {} as SaleResponse;
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Customers — CRUD + history
// ────────────────────────────────────────────────────────────────────────────

export interface CreateCustomerRequest {
  name: string;
  email?: string | null;
  phone?: string | null;
  alias?: string | null;
  address?: string | null;
  googleMapsUrl?: string | null;
  notes?: string | null;
}

export interface UpdateCustomerRequest {
  name: string;
  email?: string | null;
  phone?: string | null;
  alias?: string | null;
  address?: string | null;
  googleMapsUrl?: string | null;
  notes?: string | null;
}

export interface CustomerResponse {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  alias: string | null;
  address: string | null;
  googleMapsUrl: string | null;
  notes: string | null;
  totalPurchases: number;
  createdAt: string;
  updatedAt: string;
}

export type CustomerListResponse = CustomerResponse[];

export interface CustomerHistoryResponse {
  customer: {
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
  };
  sales: Array<{
    id: string;
    total: number;
    status: string;
    createdAt: string;
  }>;
  summary: {
    totalSales: number;
    totalSpent: number;
    lastPurchaseDate: string | null;
  };
}

@Route('/api/v1/customers')
@Tags('Customers')
@Security('bearer')
export class CustomerSwagger extends Controller {
  /**
   * Create a new customer.
   */
  @Post()
  @SuccessResponse('201', 'Customer created')
  @Response<ErrorDto>('400', 'Validation error')
  async create(
    @Body() _body: CreateCustomerRequest,
  ): Promise<CustomerResponse> {
    return {} as CustomerResponse;
  }

  /**
   * List all customers.
   */
  @Get()
  @SuccessResponse('200', 'Customer list')
  async list(): Promise<CustomerListResponse> {
    return [] as CustomerListResponse;
  }

  /**
   * Get a single customer by ID.
   */
  @Get('{id}')
  @SuccessResponse('200', 'Customer found')
  @Response<ErrorDto>('404', 'Customer not found')
  async getById(@Path() id: string): Promise<CustomerResponse> {
    return {} as CustomerResponse;
  }

  /**
   * Update an existing customer.
   */
  @Put('{id}')
  @SuccessResponse('200', 'Customer updated')
  @Response<ErrorDto>('400', 'Validation error')
  @Response<ErrorDto>('404', 'Customer not found')
  async update(
    @Path() id: string,
    @Body() _body: UpdateCustomerRequest,
  ): Promise<CustomerResponse> {
    return {} as CustomerResponse;
  }

  /**
   * Get customer purchase history derived from sales.
   */
  @Get('{id}/history')
  @SuccessResponse('200', 'Customer history retrieved')
  @Response<ErrorDto>('404', 'Customer not found')
  async history(
    @Path() id: string,
  ): Promise<CustomerHistoryResponse> {
    return {} as CustomerHistoryResponse;
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Reports — read-only metrics
// ────────────────────────────────────────────────────────────────────────────

export interface LiquidityResponse {
  effectiveCash: number;
  cashInDrawer: number;
  totalSalesToday: number;
  totalPurchasesToday: number;
}

export interface StockInvestmentResponse {
  totalInvestment: number;
  totalItems: number;
  averageCost: number;
}

export interface SalesTotalResponse {
  period: { from: string; to: string };
  regularSales: number;
  presaleSales: number;
  totalSales: number;
  totalTransactions: number;
}

export interface FifoCostsResponse {
  totalCogs: number;
  period: { from: string; to: string };
}

export interface GrossProfitResponse {
  totalSales: number;
  totalCogs: number;
  grossProfit: number;
  grossMargin: number;
  period: { from: string; to: string };
}

export interface ReinvestmentResponse {
  reinvestmentRate: number;
  netProfit: number;
  purchasesTotal: number;
  period: { from: string; to: string };
}

export interface OperatingCapitalResponse {
  cash: number;
  inventoryValue: number;
  totalCapital: number;
  liquidityRatio: number;
}

export interface StockByProductEntry {
  productId: string;
  productName: string;
  totalStock: number;
  totalInvestment: number;
}

export type StockByProductResponse = StockByProductEntry[];

export interface LotEntry {
  id: string;
  variantId: string;
  sku: string;
  quantity: number;
  unitCost: number;
  receivedAt: string;
}

export type LotsResponse = LotEntry[];

export interface CashCloseRequest {
  notes?: string | null;
}

export interface CashCloseResponse {
  id: string;
  closedAt: string;
  cashInDrawer: number;
  notes: string | null;
}

@Route('/api/v1/reports')
@Tags('Reports')
@Security('bearer')
export class ReportSwagger extends Controller {
  /** Get current liquidity (cash + sales today). */
  @Get('liquidity')
  @SuccessResponse('200', 'Liquidity data')
  async liquidity(): Promise<LiquidityResponse> {
    return {} as LiquidityResponse;
  }

  /** Get total stock investment value. */
  @Get('stock-investment')
  @SuccessResponse('200', 'Stock investment data')
  async stockInvestment(): Promise<StockInvestmentResponse> {
    return {} as StockInvestmentResponse;
  }

  /** Get sales totals for a date range. */
  @Get('sales-total')
  @SuccessResponse('200', 'Sales total data')
  async salesTotal(): Promise<SalesTotalResponse> {
    return {} as SalesTotalResponse;
  }

  /** Get FIFO cost of goods sold. */
  @Get('fifo-cogs')
  @SuccessResponse('200', 'FIFO COGS data')
  async fifoCosts(): Promise<FifoCostsResponse> {
    return {} as FifoCostsResponse;
  }

  /** Get gross profit calculation. */
  @Get('gross-profit')
  @SuccessResponse('200', 'Gross profit data')
  async grossProfit(): Promise<GrossProfitResponse> {
    return {} as GrossProfitResponse;
  }

  /** Get reinvestment rate. */
  @Get('reinvestment')
  @SuccessResponse('200', 'Reinvestment data')
  async reinvestment(): Promise<ReinvestmentResponse> {
    return {} as ReinvestmentResponse;
  }

  /** Get operating capital calculation. */
  @Get('operating-capital')
  @SuccessResponse('200', 'Operating capital data')
  async operatingCapital(): Promise<OperatingCapitalResponse> {
    return {} as OperatingCapitalResponse;
  }

  /** Get stock grouped by product. */
  @Get('stock-by-product')
  @SuccessResponse('200', 'Stock by product data')
  async stockByProduct(): Promise<StockByProductResponse> {
    return {} as StockByProductResponse;
  }

  /** Get inventory lots. */
  @Get('lots')
  @SuccessResponse('200', 'Lots data')
  async lots(): Promise<LotsResponse> {
    return {} as LotsResponse;
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Cash Closings — POST /cash/closings
// ────────────────────────────────────────────────────────────────────────────

@Route('/api/v1/cash')
@Tags('Cash Management')
@Security('bearer')
export class CashSwagger extends Controller {
  /**
   * Manually close the cash register for the day.
   */
  @Post('closings')
  @SuccessResponse('201', 'Cash closing registered')
  @Response<ErrorDto>('400', 'Validation error')
  async cashClose(
    @Body() _body: CashCloseRequest,
  ): Promise<CashCloseResponse> {
    return {} as CashCloseResponse;
  }
}

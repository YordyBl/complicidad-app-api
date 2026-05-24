/**
 * Create Customer use case — registers a new customer profile.
 *
 * Simple create operation. Does NOT run inside a UnitOfWork because
 * it only affects the Customer aggregate (no cross-aggregate consistency
 * needed at creation time).
 */
import { err, ok } from '../../../../shared/domain/Result.js';
import type { Result } from '../../../../shared/domain/Result.js';
import { BusinessRuleError } from '../../../../shared/domain/errors.js';
import type { CustomerRepository } from '../../domain/CustomerRepository.js';
import { Customer } from '../../domain/Customer.js';
import { CustomerId } from '../../domain/CustomerId.js';

// ── DTOs ─────────────────────────────────────────────────────

export interface CreateCustomerCommand {
  name: string;
  email: string | null;
  phone: string | null;
  alias: string | null;
  address: string | null;
  googleMapsUrl: string | null;
  notes: string | null;
  district: string | null;
}

export interface CreateCustomerResponse {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  alias: string | null;
  address: string | null;
  googleMapsUrl: string | null;
  notes: string | null;
  district: string | null;
  createdAt: string;
}

// ── Errors ───────────────────────────────────────────────────

export class CustomerNameRequiredError extends BusinessRuleError {
  override readonly name = 'CustomerNameRequiredError' as const;

  constructor() {
    super('Customer name is required');
  }
}

// ── Use Case ─────────────────────────────────────────────────

export class CreateCustomerUseCase {
  constructor(private readonly customerRepository: CustomerRepository) {}

  async execute(command: CreateCustomerCommand): Promise<Result<CreateCustomerResponse>> {
    // ── Validate ─────────────────────────────────────────────
    if (!command.name || command.name.trim().length === 0) {
      return err(new CustomerNameRequiredError());
    }

    const now = new Date();
    const customer = new Customer(
      CustomerId.generate(),
      command.name.trim(),
      command.email ?? null,
      command.phone ?? null,
      command.alias ?? null,
      command.address ?? null,
      command.googleMapsUrl ?? null,
      command.notes ?? null,
      command.district ?? null,
      now,
      now,
    );

    await this.customerRepository.save(customer);

    return ok({
      id: customer.id.toString(),
      name: customer.name,
      email: customer.email,
      phone: customer.phone,
      alias: customer.alias,
      address: customer.address,
      googleMapsUrl: customer.googleMapsUrl,
      notes: customer.notes,
      district: customer.district,
      createdAt: customer.createdAt.toISOString(),
    });
  }
}

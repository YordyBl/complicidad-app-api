/**
 * Update Customer use case — updates an existing customer's profile fields.
 *
 * Simple update operation. Does NOT run inside a UnitOfWork because
 * it only affects the Customer aggregate.
 */
import { err, ok } from '../../../../shared/domain/Result.js';
import type { Result } from '../../../../shared/domain/Result.js';
import { NotFoundError } from '../../../../shared/domain/errors.js';
import type { CustomerRepository } from '../../domain/CustomerRepository.js';
import { CustomerId } from '../../domain/CustomerId.js';
import { CustomerNameRequiredError } from './CreateCustomerUseCase.js';

// ── DTOs ─────────────────────────────────────────────────────

export interface UpdateCustomerCommand {
  customerId: string;
  name: string;
  email: string | null;
  phone: string | null;
  alias: string | null;
  address: string | null;
  googleMapsUrl: string | null;
  notes: string | null;
  district: string | null;
}

export interface UpdateCustomerResponse {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  alias: string | null;
  address: string | null;
  googleMapsUrl: string | null;
  notes: string | null;
  district: string | null;
  updatedAt: string;
}

// ── Use Case ─────────────────────────────────────────────────

export class UpdateCustomerUseCase {
  constructor(private readonly customerRepository: CustomerRepository) {}

  async execute(command: UpdateCustomerCommand): Promise<Result<UpdateCustomerResponse>> {
    // ── Validate ─────────────────────────────────────────────
    if (!command.name || command.name.trim().length === 0) {
      return err(new CustomerNameRequiredError());
    }

    // ── Load ─────────────────────────────────────────────────
    const customerId = CustomerId.from(command.customerId);
    const customer = await this.customerRepository.findById(customerId);
    if (!customer) {
      return err(new NotFoundError('Customer', command.customerId));
    }

    // ── Mutate ───────────────────────────────────────────────
    const now = new Date();
    customer.updateProfile(
      command.name.trim(),
      command.email ?? null,
      command.phone ?? null,
      command.alias ?? null,
      command.address ?? null,
      command.googleMapsUrl ?? null,
      command.notes ?? null,
      command.district ?? null,
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
      updatedAt: customer.updatedAt.toISOString(),
    });
  }
}

/**
 * Get Customer use case — retrieves a single customer by ID.
 */
import { err, ok } from '../../../../shared/domain/Result.js';
import type { Result } from '../../../../shared/domain/Result.js';
import { NotFoundError } from '../../../../shared/domain/errors.js';
import type { CustomerRepository } from '../../domain/CustomerRepository.js';
import { CustomerId } from '../../domain/CustomerId.js';

// ── DTOs ─────────────────────────────────────────────────────

export interface GetCustomerCommand {
  customerId: string;
}

export interface GetCustomerResponse {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  alias: string | null;
  address: string | null;
  googleMapsUrl: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

// ── Use Case ─────────────────────────────────────────────────

export class GetCustomerUseCase {
  constructor(private readonly customerRepository: CustomerRepository) {}

  async execute(command: GetCustomerCommand): Promise<Result<GetCustomerResponse>> {
    const customerId = CustomerId.from(command.customerId);
    const customer = await this.customerRepository.findById(customerId);

    if (!customer) {
      return err(new NotFoundError('Customer', command.customerId));
    }

    return ok({
      id: customer.id.toString(),
      name: customer.name,
      email: customer.email,
      phone: customer.phone,
      alias: customer.alias,
      address: customer.address,
      googleMapsUrl: customer.googleMapsUrl,
      notes: customer.notes,
      createdAt: customer.createdAt.toISOString(),
      updatedAt: customer.updatedAt.toISOString(),
    });
  }
}

/**
 * List Customers use case — retrieves all customer profiles.
 */
import type { CustomerRepository } from '../../domain/CustomerRepository.js';

// ── DTOs ─────────────────────────────────────────────────────

export interface ListCustomerItem {
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

export class ListCustomersUseCase {
  constructor(private readonly customerRepository: CustomerRepository) {}

  async execute(): Promise<ListCustomerItem[]> {
    const customers = await this.customerRepository.findAll();

    return customers.map((c) => ({
      id: c.id.toString(),
      name: c.name,
      email: c.email,
      phone: c.phone,
      alias: c.alias,
      address: c.address,
      googleMapsUrl: c.googleMapsUrl,
      notes: c.notes,
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
    }));
  }
}

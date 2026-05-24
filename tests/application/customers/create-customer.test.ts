/**
 * Application tests for CreateCustomerUseCase and UpdateCustomerUseCase.
 *
 * Verifies:
 * - Customer creation with required and optional fields
 * - Customer creation rejects empty name
 * - Customer update modifies fields
 * - Customer update rejects empty name
 * - Unknown customer update rejection
 * - Customer list returns all customers
 * - Customer get returns single customer
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { CreateCustomerUseCase } from '../../../src/modules/customers/application/use-cases/CreateCustomerUseCase.js';
import { UpdateCustomerUseCase } from '../../../src/modules/customers/application/use-cases/UpdateCustomerUseCase.js';
import { GetCustomerUseCase } from '../../../src/modules/customers/application/use-cases/GetCustomerUseCase.js';
import { ListCustomersUseCase } from '../../../src/modules/customers/application/use-cases/ListCustomersUseCase.js';
import type { CreateCustomerCommand } from '../../../src/modules/customers/application/use-cases/CreateCustomerUseCase.js';
import type { UpdateCustomerCommand } from '../../../src/modules/customers/application/use-cases/UpdateCustomerUseCase.js';
import type { CustomerRepository } from '../../../src/modules/customers/domain/CustomerRepository.js';
import { Customer } from '../../../src/modules/customers/domain/Customer.js';
import { CustomerId } from '../../../src/modules/customers/domain/CustomerId.js';
import { NotFoundError } from '../../../src/shared/domain/errors.js';

// ── Fakes ────────────────────────────────────────────────────

class FakeCustomerRepository implements CustomerRepository {
  private customers = new Map<string, Customer>();

  async findById(id: CustomerId): Promise<Customer | null> {
    return this.customers.get(id.toString()) ?? null;
  }

  async save(customer: Customer): Promise<void> {
    this.customers.set(customer.id.toString(), customer);
  }

  async findAll(): Promise<Customer[]> {
    return Array.from(this.customers.values());
  }
}

// ── Tests ────────────────────────────────────────────────────

describe('CreateCustomerUseCase', () => {
  let repo: FakeCustomerRepository;
  let useCase: CreateCustomerUseCase;

  beforeEach(() => {
    repo = new FakeCustomerRepository();
    useCase = new CreateCustomerUseCase(repo);
  });

  describe('valid creation', () => {
    it('creates a customer with all fields', async () => {
      const command: CreateCustomerCommand = {
        name: 'Juan Pérez',
        email: 'juan@example.com',
        phone: '+5491123456789',
        alias: 'juanp',
        address: 'Av. Corrientes 1234',
        googleMapsUrl: 'https://maps.google.com/?q=Av.+Corrientes+1234',
        notes: 'Cliente frecuente',
        district: 'CABA',
      };

      const result = await useCase.execute(command);

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.value.id).toBeDefined();
      expect(result.value.name).toBe('Juan Pérez');
      expect(result.value.email).toBe('juan@example.com');
      expect(result.value.phone).toBe('+5491123456789');
      expect(result.value.alias).toBe('juanp');
      expect(result.value.address).toBe('Av. Corrientes 1234');
      expect(result.value.googleMapsUrl).toBe('https://maps.google.com/?q=Av.+Corrientes+1234');
      expect(result.value.notes).toBe('Cliente frecuente');
      expect(result.value.district).toBe('CABA');

      // Verify persisted
      const saved = await repo.findById(CustomerId.from(result.value.id));
      expect(saved).not.toBeNull();
      expect(saved!.name).toBe('Juan Pérez');
    });

    it('creates a customer with only required fields', async () => {
      const command: CreateCustomerCommand = {
        name: 'María López',
        email: null,
        phone: null,
        alias: null,
        address: null,
        googleMapsUrl: null,
        notes: null,
        district: null,
      };

      const result = await useCase.execute(command);

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.value.name).toBe('María López');
      expect(result.value.email).toBeNull();
      expect(result.value.phone).toBeNull();
    });
  });

  describe('validation', () => {
    it('rejects empty name', async () => {
      const command: CreateCustomerCommand = {
        name: '',
        email: null, phone: null, alias: null,
        address: null, googleMapsUrl: null, notes: null,
        district: null,
      };

      const result = await useCase.execute(command);

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.message).toContain('name is required');
    });

    it('rejects whitespace-only name', async () => {
      const command: CreateCustomerCommand = {
        name: '   ',
        email: null, phone: null, alias: null,
        address: null, googleMapsUrl: null, notes: null,
        district: null,
      };

      const result = await useCase.execute(command);

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.message).toContain('name is required');
    });
  });
});

describe('UpdateCustomerUseCase', () => {
  let repo: FakeCustomerRepository;
  let useCase: UpdateCustomerUseCase;
  let existingCustomer: Customer;
  const now = new Date('2026-01-01');

  beforeEach(async () => {
    repo = new FakeCustomerRepository();
    useCase = new UpdateCustomerUseCase(repo);

    existingCustomer = new Customer(
      CustomerId.from('cust-1'),
      'Original Name',
      'original@example.com',
      '+5491100000000',
      'orig',
      'Original Address',
      'https://maps.google.com/?q=Original',
      'Original notes',
      null,
      now,
      now,
    );
    await repo.save(existingCustomer);
  });

  describe('valid update', () => {
    it('updates all mutable fields', async () => {
      const command: UpdateCustomerCommand = {
        customerId: 'cust-1',
        name: 'Updated Name',
        email: 'updated@example.com',
        phone: '+5491199999999',
        alias: 'upd',
        address: 'Updated Address',
        district: 'Palermo',
        googleMapsUrl: 'https://maps.google.com/?q=Updated',
        notes: 'Updated notes',
      };

      const result = await useCase.execute(command);

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.value.name).toBe('Updated Name');
      expect(result.value.email).toBe('updated@example.com');
      expect(result.value.phone).toBe('+5491199999999');
      expect(result.value.alias).toBe('upd');

      // Verify persisted
      const saved = await repo.findById(CustomerId.from('cust-1'));
      expect(saved!.name).toBe('Updated Name');
      expect(saved!.updatedAt.getTime()).toBeGreaterThan(now.getTime());
    });

    it('sets optional fields to null when not provided', async () => {
      const command: UpdateCustomerCommand = {
        customerId: 'cust-1',
        name: 'Just Name',
        email: null,
        phone: null,
        alias: null,
        address: null,
        district: null,
        googleMapsUrl: null,
        notes: null,
      };

      const result = await useCase.execute(command);

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.value.email).toBeNull();
      expect(result.value.phone).toBeNull();
      expect(result.value.alias).toBeNull();
    });
  });

  describe('validation', () => {
    it('rejects empty name on update', async () => {
      const command: UpdateCustomerCommand = {
        customerId: 'cust-1',
        name: '',
        email: null, phone: null, alias: null,
        address: null, district: null, googleMapsUrl: null, notes: null,
      };

      const result = await useCase.execute(command);

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.message).toContain('name is required');
    });

    it('rejects update for non-existent customer', async () => {
      const command: UpdateCustomerCommand = {
        customerId: 'non-existent',
        name: 'Name',
        email: null, phone: null, alias: null,
        address: null, district: null, googleMapsUrl: null, notes: null,
      };

      const result = await useCase.execute(command);

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toBeInstanceOf(NotFoundError);
    });
  });
});

describe('GetCustomerUseCase', () => {
  let repo: FakeCustomerRepository;
  let useCase: GetCustomerUseCase;

  beforeEach(async () => {
    repo = new FakeCustomerRepository();
    useCase = new GetCustomerUseCase(repo);

    const customer = new Customer(
      CustomerId.from('cust-1'),
      'Test User',
      'test@example.com', null, null, null, null, null, null,
      new Date(), new Date(),
    );
    await repo.save(customer);
  });

  it('returns customer when found', async () => {
    const result = await useCase.execute({ customerId: 'cust-1' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.name).toBe('Test User');
  });

  it('returns NotFoundError when customer not found', async () => {
    const result = await useCase.execute({ customerId: 'non-existent' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBeInstanceOf(NotFoundError);
  });
});

describe('ListCustomersUseCase', () => {
  let repo: FakeCustomerRepository;
  let useCase: ListCustomersUseCase;

  beforeEach(async () => {
    repo = new FakeCustomerRepository();
    useCase = new ListCustomersUseCase(repo);

    const now = new Date();
    await repo.save(new Customer(CustomerId.from('c-1'), 'Alice', null, null, null, null, null, null, null, now, now));
    await repo.save(new Customer(CustomerId.from('c-2'), 'Bob', null, null, null, null, null, null, null, now, now));
  });

  it('returns all customers', async () => {
    const result = await useCase.execute();
    expect(result).toHaveLength(2);
    expect(result.map((c) => c.name).sort()).toEqual(['Alice', 'Bob']);
  });

  it('returns empty list when no customers', async () => {
    repo = new FakeCustomerRepository();
    useCase = new ListCustomersUseCase(repo);
    const result = await useCase.execute();
    expect(result).toHaveLength(0);
  });
});

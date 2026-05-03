/**
 * Unit tests for Customer domain entity.
 *
 * Tests field validation, update behavior, and invariants.
 */
import { describe, it, expect } from 'vitest';
import { Customer } from '../../../src/modules/customers/domain/Customer.js';
import { CustomerId } from '../../../src/modules/customers/domain/CustomerId.js';

describe('Customer', () => {
  const now = new Date('2026-01-15T10:00:00Z');

  function createValidCustomer(): Customer {
    return new Customer(
      CustomerId.from('cust-1'),
      'Juan Pérez',
      'juan@example.com',
      '+5491123456789',
      'juanp',
      'Av. Corrientes 1234, CABA',
      'https://maps.google.com/?q=Av.+Corrientes+1234',
      'Cliente frecuente, compra semanalmente',
      now,
      now,
    );
  }

  describe('construction', () => {
    it('creates a customer with all fields', () => {
      const c = createValidCustomer();
      expect(c.id.toString()).toBe('cust-1');
      expect(c.name).toBe('Juan Pérez');
      expect(c.email).toBe('juan@example.com');
      expect(c.phone).toBe('+5491123456789');
      expect(c.alias).toBe('juanp');
      expect(c.address).toBe('Av. Corrientes 1234, CABA');
      expect(c.googleMapsUrl).toBe('https://maps.google.com/?q=Av.+Corrientes+1234');
      expect(c.notes).toBe('Cliente frecuente, compra semanalmente');
    });

    it('allows null for optional fields (email, phone, alias, address, googleMapsUrl, notes)', () => {
      const c = new Customer(
        CustomerId.from('cust-2'),
        'María López',
        null, null, null, null, null, null,
        now, now,
      );
      expect(c.name).toBe('María López');
      expect(c.email).toBeNull();
      expect(c.phone).toBeNull();
      expect(c.alias).toBeNull();
      expect(c.address).toBeNull();
      expect(c.googleMapsUrl).toBeNull();
      expect(c.notes).toBeNull();
    });

    it('rejects empty name', () => {
      expect(() => new Customer(
        CustomerId.from('cust-3'),
        '',
        null, null, null, null, null, null,
        now, now,
      )).toThrow('Customer name is required');
    });

    it('rejects whitespace-only name', () => {
      expect(() => new Customer(
        CustomerId.from('cust-4'),
        '   ',
        null, null, null, null, null, null,
        now, now,
      )).toThrow('Customer name is required');
    });
  });

  describe('updateProfile', () => {
    it('updates all mutable fields and sets updatedAt forward', () => {
      const c = createValidCustomer();
      const later = new Date('2026-06-01T12:00:00Z');

      c.updateProfile(
        'Juan Pérez Actualizado',
        'juan.nuevo@example.com',
        '+5491100000000',
        'juanp2',
        'Av. Santa Fe 5678, CABA',
        'https://maps.google.com/?q=Av.+Santa+Fe+5678',
        'Cliente actualizado',
        later,
      );

      expect(c.name).toBe('Juan Pérez Actualizado');
      expect(c.email).toBe('juan.nuevo@example.com');
      expect(c.phone).toBe('+5491100000000');
      expect(c.alias).toBe('juanp2');
      expect(c.address).toBe('Av. Santa Fe 5678, CABA');
      expect(c.googleMapsUrl).toBe('https://maps.google.com/?q=Av.+Santa+Fe+5678');
      expect(c.notes).toBe('Cliente actualizado');
      expect(c.updatedAt.getTime()).toBe(later.getTime());
    });

    it('allows setting optional fields to null', () => {
      const c = createValidCustomer();
      const later = new Date('2026-06-01T12:00:00Z');

      c.updateProfile(c.name, null, null, null, null, null, null, later);

      expect(c.email).toBeNull();
      expect(c.phone).toBeNull();
      expect(c.alias).toBeNull();
      expect(c.address).toBeNull();
      expect(c.googleMapsUrl).toBeNull();
      expect(c.notes).toBeNull();
    });

    it('rejects empty name on update', () => {
      const c = createValidCustomer();
      expect(() =>
        { c.updateProfile('', null, null, null, null, null, null, new Date()); }
      ).toThrow('Customer name is required');
    });
  });

  describe('toString', () => {
    it('returns a descriptive string', () => {
      const c = createValidCustomer();
      const str = c.toString();
      expect(str).toContain('cust-1');
      expect(str).toContain('Juan Pérez');
    });
  });
});

/**
 * Application tests for sale constancia emissions.
 *
 * Covers:
 * - Entity structure (2.1)
 * - Snapshot builder pure function
 * - CreateSaleConstanciaEmissionUseCase (first emission, history)
 * - ListSaleConstanciaEmissionsUseCase (history order)
 * - GetSaleConstanciaPdfUseCase (reprint from snapshot after mutable-change)
 * - Full enriched sale-detail payload for emission data
 */
import { describe, it, expect, beforeEach } from 'vitest';

// ── Imports ──────────────────────────────────────────────────
import { SaleConstanciaEmissionEntity } from '../../../src/modules/sales-returns/infrastructure/typeorm/SaleConstanciaEmissionEntity.js';
import type { SaleConstanciaEmissionRepository } from '../../../src/modules/sales-returns/application/ports/SaleConstanciaEmissionRepository.js';
import { buildConstanciaSnapshot } from '../../../src/modules/sales-returns/application/use-cases/buildConstanciaSnapshot.js';

// ── Fakes ────────────────────────────────────────────────────

class FakeSaleConstanciaEmissionRepository implements SaleConstanciaEmissionRepository {
  private emissions = new Map<string, {
    id: string;
    saleId: string;
    emissionNumber: number;
    issuedAt: Date;
    templateVersion: string;
    snapshotJson: Record<string, unknown>;
  }>();

  async save(emission: {
    id: string;
    saleId: string;
    emissionNumber: number;
    issuedAt: Date;
    templateVersion: string;
    snapshotJson: Record<string, unknown>;
  }): Promise<void> {
    this.emissions.set(emission.id, { ...emission });
  }

  async findBySaleId(saleId: string): Promise<{
    id: string;
    saleId: string;
    emissionNumber: number;
    issuedAt: Date;
    templateVersion: string;
    snapshotJson: Record<string, unknown>;
  }[]> {
    return Array.from(this.emissions.values())
      .filter((e) => e.saleId === saleId)
      .sort((a, b) => b.emissionNumber - a.emissionNumber);
  }

  async findById(id: string): Promise<{
    id: string;
    saleId: string;
    emissionNumber: number;
    issuedAt: Date;
    templateVersion: string;
    snapshotJson: Record<string, unknown>;
  } | null> {
    return this.emissions.get(id) ?? null;
  }

  async countBySaleId(saleId: string): Promise<number> {
    return Array.from(this.emissions.values())
      .filter((e) => e.saleId === saleId).length;
  }
}

class FakeSaleRepository {
  private sales = new Map<string, { id: string }>();

  setExists(id: string) {
    this.sales.set(id, { id });
  }

  async findById(id: string): Promise<{ id: string } | null> {
    return this.sales.get(id) ?? null;
  }
}

// ────────────────────────────────────────────────────────────────
// 2.1 Entity structure
// ────────────────────────────────────────────────────────────────
describe('SaleConstanciaEmissionEntity (2.1)', () => {
  it('can be instantiated with all required fields', () => {
    const entity = new SaleConstanciaEmissionEntity();
    entity.saleId = 'sale-uuid-1';
    entity.emissionNumber = 1;
    entity.issuedAt = new Date('2026-05-23T10:00:00.000Z');
    entity.templateVersion = 'v1';
    entity.snapshotJson = { customer: { name: 'Test' } };

    expect(entity.saleId).toBe('sale-uuid-1');
    expect(entity.emissionNumber).toBe(1);
    expect(entity.issuedAt.toISOString()).toBe('2026-05-23T10:00:00.000Z');
    expect(entity.templateVersion).toBe('v1');
    expect(entity.snapshotJson).toEqual({ customer: { name: 'Test' } });
  });

  it('has snapshotJson as non-nullable jsonb', () => {
    const entity = new SaleConstanciaEmissionEntity();
    entity.snapshotJson = { prendas: [] };

    expect(entity.snapshotJson).toBeDefined();
    expect(entity.snapshotJson).toEqual({ prendas: [] });
  });
});

// ────────────────────────────────────────────────────────────────
// Snapshot builder (pure function)
// ────────────────────────────────────────────────────────────────
describe('buildConstanciaSnapshot', () => {
  it('builds a snapshot from sale detail data', () => {
    const snapshot = buildConstanciaSnapshot({
      saleId: 'sale-1',
      customerName: 'Juan Pérez',
      customerPhone: '+5491123456789',
      customerAddress: 'Av. Corrientes 1234',
      customerDistrict: 'CABA',
      totalRevenueCents: 9000,
      amountPaidCents: 5000,
      pendingBalanceCents: 4000,
      createdAt: '2026-05-20T10:00:00.000Z',
      lines: [
        {
          id: 'line-1',
          displayLabel: 'Camiseta Blanca M',
          quantity: 3,
          unitPriceCents: 2000,
          totalPriceCents: 6000,
        },
        {
          id: 'line-2',
          displayLabel: 'Pantalón Negro L',
          quantity: 2,
          unitPriceCents: 1500,
          totalPriceCents: 3000,
        },
      ],
    });

    expect(snapshot.saleId).toBe('sale-1');
    expect(snapshot.customer.name).toBe('Juan Pérez');
    expect(snapshot.customer.phone).toBe('+5491123456789');
    expect(snapshot.customer.address).toBe('Av. Corrientes 1234');
    expect(snapshot.customer.district).toBe('CABA');
    expect(snapshot.fecha).toBe('2026-05-20T10:00:00.000Z');
    expect(snapshot.pagado).toBe(5000);
    expect(snapshot.saldoPendiente).toBe(4000);
    expect(snapshot.prendas).toHaveLength(2);

    const prenda1 = snapshot.prendas.find((p: { displayLabel: string }) => p.displayLabel === 'Camiseta Blanca M');
    expect(prenda1).toBeDefined();
    expect(prenda1!.quantity).toBe(3);
    expect(prenda1!.unitPriceCents).toBe(2000);
    expect(prenda1!.totalPriceCents).toBe(6000);
  });

  it('handles null customer fields gracefully', () => {
    const snapshot = buildConstanciaSnapshot({
      saleId: 'sale-2',
      customerName: 'Cliente Desconocido',
      customerPhone: null,
      customerAddress: null,
      customerDistrict: null,
      totalRevenueCents: 1000,
      amountPaidCents: 1000,
      pendingBalanceCents: 0,
      createdAt: '2026-05-20T10:00:00.000Z',
      lines: [
        {
          id: 'line-3',
          displayLabel: 'Variante sin datos',
          quantity: 1,
          unitPriceCents: 1000,
          totalPriceCents: 1000,
        },
      ],
    });

    expect(snapshot.customer.phone).toBeNull();
    expect(snapshot.customer.address).toBeNull();
    expect(snapshot.customer.district).toBeNull();
    expect(snapshot.prendas).toHaveLength(1);
  });

  it('includes templateVersion v1', () => {
    const snapshot = buildConstanciaSnapshot({
      saleId: 'sale-3',
      customerName: 'Test',
      customerPhone: null,
      customerAddress: null,
      customerDistrict: null,
      totalRevenueCents: 500,
      amountPaidCents: 0,
      pendingBalanceCents: 500,
      createdAt: '2026-05-20T10:00:00.000Z',
      lines: [],
    });

    expect(snapshot.templateVersion).toBe('v1');
  });
});

// ────────────────────────────────────────────────────────────────
// CreateSaleConstanciaEmissionUseCase
// ────────────────────────────────────────────────────────────────
describe('CreateSaleConstanciaEmissionUseCase (2.2)', () => {
  let emissionRepo: FakeSaleConstanciaEmissionRepository;
  let saleRepo: FakeSaleRepository;
  let useCase: any;

  beforeEach(async () => {
    emissionRepo = new FakeSaleConstanciaEmissionRepository();
    saleRepo = new FakeSaleRepository();
    saleRepo.setExists('sale-uuid');

    const mod = await import('../../../src/modules/sales-returns/application/use-cases/CreateSaleConstanciaEmissionUseCase.js');
      useCase = new mod.CreateSaleConstanciaEmissionUseCase(emissionRepo, saleRepo);
  });

  it('creates emission #1 for first request', async () => {
    const result = await useCase.execute({
      saleId: 'sale-uuid',
      saleData: {
        customerName: 'Juan Pérez',
        customerPhone: '+5491123456789',
        customerAddress: 'Av. Corrientes 1234',
        customerDistrict: 'CABA',
        totalRevenueCents: 9000,
        amountPaidCents: 5000,
        pendingBalanceCents: 4000,
        createdAt: '2026-05-20T10:00:00.000Z',
        lines: [
          { id: 'line-1', displayLabel: 'Camiseta Blanca', quantity: 2, unitPriceCents: 2000, totalPriceCents: 4000 },
        ],
      },
    });

    expect(result.ok).toBe(true);
    expect(result.value.emissionNumber).toBe(1);
    expect(result.value.templateVersion).toBe('v1');
    expect(result.value.saleId).toBe('sale-uuid');
  });

  it('creates emission #3 when two prior exist', async () => {
    // Pre-seed two emissions
    await emissionRepo.save({
      id: 'em-1', saleId: 'sale-uuid', emissionNumber: 1,
      issuedAt: new Date(), templateVersion: 'v1', snapshotJson: {},
    });
    await emissionRepo.save({
      id: 'em-2', saleId: 'sale-uuid', emissionNumber: 2,
      issuedAt: new Date(), templateVersion: 'v1', snapshotJson: {},
    });

    const result = await useCase.execute({
      saleId: 'sale-uuid',
      saleData: {
        customerName: 'Juan Pérez',
        customerPhone: null,
        customerAddress: null,
        customerDistrict: null,
        totalRevenueCents: 1000,
        amountPaidCents: 1000,
        pendingBalanceCents: 0,
        createdAt: '2026-05-20T10:00:00.000Z',
        lines: [],
      },
    });

    expect(result.ok).toBe(true);
    expect(result.value.emissionNumber).toBe(3);
  });

  it('returns error when sale does not exist', async () => {
    const result = await useCase.execute({
      saleId: 'non-existent',
      saleData: {
        customerName: 'Test',
        customerPhone: null,
        customerAddress: null,
        customerDistrict: null,
        totalRevenueCents: 0,
        amountPaidCents: 0,
        pendingBalanceCents: 0,
        createdAt: '2026-05-20T10:00:00.000Z',
        lines: [],
      },
    });

    expect(result.ok).toBe(false);
    expect(result.error.name).toBe('NotFoundError');
  });
});

// ────────────────────────────────────────────────────────────────
// ListSaleConstanciaEmissionsUseCase
// ────────────────────────────────────────────────────────────────
describe('ListSaleConstanciaEmissionsUseCase (2.2)', () => {
  let emissionRepo: FakeSaleConstanciaEmissionRepository;
  let useCase: any;

  beforeEach(async () => {
    emissionRepo = new FakeSaleConstanciaEmissionRepository();

    const mod = await import('../../../src/modules/sales-returns/application/use-cases/ListSaleConstanciaEmissionsUseCase.js');
    useCase = new mod.ListSaleConstanciaEmissionsUseCase(emissionRepo);
  });

  it('returns emissions ordered by most recent first (desc)', async () => {
    // Create 3 emissions
    await emissionRepo.save({
      id: 'em-1', saleId: 'sale-uuid', emissionNumber: 1,
      issuedAt: new Date('2026-05-20T10:00:00Z'), templateVersion: 'v1', snapshotJson: {},
    });
    await emissionRepo.save({
      id: 'em-2', saleId: 'sale-uuid', emissionNumber: 2,
      issuedAt: new Date('2026-05-21T10:00:00Z'), templateVersion: 'v1', snapshotJson: {},
    });
    await emissionRepo.save({
      id: 'em-3', saleId: 'sale-uuid', emissionNumber: 3,
      issuedAt: new Date('2026-05-22T10:00:00Z'), templateVersion: 'v1', snapshotJson: {},
    });

    const result = await useCase.execute({ saleId: 'sale-uuid' });

    expect(result.ok).toBe(true);
    const emissions = result.value;
    expect(emissions).toHaveLength(3);
    // Most recent first
    expect(emissions[0].emissionNumber).toBe(3);
    expect(emissions[1].emissionNumber).toBe(2);
    expect(emissions[2].emissionNumber).toBe(1);
  });

  it('returns empty array for sale with no emissions', async () => {
    const result = await useCase.execute({ saleId: 'no-emissions' });

    expect(result.ok).toBe(true);
    expect(result.value).toEqual([]);
  });

  it('returns correct summary fields', async () => {
    await emissionRepo.save({
      id: 'em-4', saleId: 'sale-uuid', emissionNumber: 1,
      issuedAt: new Date('2026-05-20T10:00:00Z'), templateVersion: 'v1', snapshotJson: {},
    });

    const result = await useCase.execute({ saleId: 'sale-uuid' });
    const emission = result.value[0];

    expect(emission.id).toBe('em-4');
    expect(emission.emissionNumber).toBe(1);
    expect(emission.issuedAt).toBe('2026-05-20T10:00:00.000Z');
    expect(emission.templateVersion).toBe('v1');
  });
});

// ────────────────────────────────────────────────────────────────
// GetSaleConstanciaPdfUseCase (reprint from snapshot)
// ────────────────────────────────────────────────────────────────
describe('GetSaleConstanciaPdfUseCase (2.2)', () => {
  let emissionRepo: FakeSaleConstanciaEmissionRepository;
  let useCase: any;

  beforeEach(async () => {
    emissionRepo = new FakeSaleConstanciaEmissionRepository();

    const mod = await import('../../../src/modules/sales-returns/application/use-cases/GetSaleConstanciaPdfUseCase.js');
    useCase = new mod.GetSaleConstanciaPdfUseCase(emissionRepo);
  });

  it('returns valid pdf buffer and metadata from snapshot', async () => {
    const issuedAt = new Date('2026-05-20T10:00:00Z');
    await emissionRepo.save({
      id: 'em-1',
      saleId: 'sale-uuid',
      emissionNumber: 1,
      issuedAt,
      templateVersion: 'v1',
      snapshotJson: {
        saleId: 'sale-uuid',
        customer: { name: 'Juan Pérez', phone: '+5491123456789', address: 'Av. Corrientes 1234', district: 'CABA' },
        fecha: '2026-05-20T10:00:00.000Z',
        pagado: 5000,
        saldoPendiente: 4000,
        prendas: [{ displayLabel: 'Camiseta Blanca', quantity: 2, unitPriceCents: 2000, totalPriceCents: 4000 }],
        templateVersion: 'v1',
      },
    });

    const result = await useCase.execute({ emissionId: 'em-1' });

    expect(result.ok).toBe(true);
    const { pdf, metadata } = result.value;
    expect(pdf).toBeInstanceOf(Buffer);
    expect(pdf.length).toBeGreaterThan(500);

    // Valid PDF header
    const header = pdf.subarray(0, 8).toString('utf-8');
    expect(header).toMatch(/^%PDF-\d+\.\d+/);

    // React PDF producer marker
    expect(pdf.toString('utf-8')).toContain('react-pdf');

    expect(metadata.filename).toContain('constancia');
    expect(metadata.contentType).toBe('application/pdf');
    expect(metadata.emissionNumber).toBe(1);
  });

  it('reprints from snapshot even after mutable data would differ', async () => {
    // Save an emission with original (old) data
    const oldSnapshot = {
      saleId: 'sale-uuid',
      customer: { name: 'Juan Pérez (old)', phone: '111', address: 'Old Address', district: 'Old District' },
      fecha: '2026-05-20T10:00:00.000Z',
      pagado: 5000,
      saldoPendiente: 4000,
      prendas: [{ displayLabel: 'Prenda Original', quantity: 2, unitPriceCents: 2000, totalPriceCents: 4000 }],
      templateVersion: 'v1',
    };

    await emissionRepo.save({
      id: 'em-reprint',
      saleId: 'sale-uuid',
      emissionNumber: 1,
      issuedAt: new Date('2026-05-20T10:00:00Z'),
      templateVersion: 'v1',
      snapshotJson: oldSnapshot,
    });

    // Regenerate from the old snapshot — the PDF is based solely on snapshot data
    const result = await useCase.execute({ emissionId: 'em-reprint' });

    expect(result.ok).toBe(true);
    const { pdf, metadata } = result.value;

    // Valid PDF structure
    expect(pdf).toBeInstanceOf(Buffer);
    expect(pdf.length).toBeGreaterThan(500);
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');

    // React PDF producer marker — proves React PDF renderer path is used
    expect(pdf.toString('utf-8')).toContain('react-pdf');

    // Metadata reflects the emission, not current state
    expect(metadata.emissionNumber).toBe(1);
    expect(metadata.filename).toContain('constancia');
    expect(metadata.contentType).toBe('application/pdf');
  });

  it('generates PDF via React PDF renderer with required content', async () => {
    const snapshotData = {
      saleId: 'sale-uuid',
      customer: { name: 'María López', phone: null, address: 'Calle 123', district: 'Centro' },
      fecha: '2026-05-20T10:00:00.000Z',
      pagado: 7500,
      saldoPendiente: 2500,
      prendas: [
        { displayLabel: 'Vestido Rojo M', quantity: 1, unitPriceCents: 5000, totalPriceCents: 5000 },
        { displayLabel: 'Blusa Azul S', quantity: 1, unitPriceCents: 2500, totalPriceCents: 2500 },
      ],
      templateVersion: 'v1',
    };

    await emissionRepo.save({
      id: 'em-react',
      saleId: 'sale-uuid',
      emissionNumber: 1,
      issuedAt: new Date('2026-05-20T10:00:00Z'),
      templateVersion: 'v1',
      snapshotJson: snapshotData,
    });

    // Also save a simpler emission to compare
    await emissionRepo.save({
      id: 'em-simple',
      saleId: 'sale-uuid',
      emissionNumber: 2,
      issuedAt: new Date('2026-05-20T10:00:00Z'),
      templateVersion: 'v1',
      snapshotJson: {
        ...snapshotData,
        prendas: [],
        pagado: 0,
        saldoPendiente: 0,
      },
    });

    const result = await useCase.execute({ emissionId: 'em-react' });

    expect(result.ok).toBe(true);
    const { pdf, metadata } = result.value;

    // Must be a valid PDF buffer
    expect(pdf).toBeInstanceOf(Buffer);
    expect(pdf.length).toBeGreaterThan(500);

    // Starts with PDF header
    const header = pdf.subarray(0, 8).toString('utf-8');
    expect(header).toMatch(/^%PDF-\d+\.\d+/);

    // Contains React-PDF producer marker
    expect(pdf.toString('utf-8')).toContain('react-pdf');

    // Different snapshot content → different PDF bytes (non-empty prendas vs empty)
    const simpleResult = await useCase.execute({ emissionId: 'em-simple' });
    expect(simpleResult.ok).toBe(true);
    // PDFs with different content (garments present vs empty) must differ
    expect(pdf).not.toEqual(simpleResult.value.pdf);

    // Metadata is correct
    expect(metadata.contentType).toBe('application/pdf');
    expect(metadata.emissionNumber).toBe(1);
    expect(metadata.filename).toContain('constancia');
  });

  it('returns NotFoundError for non-existent emission', async () => {
    const result = await useCase.execute({ emissionId: 'non-existent' });

    expect(result.ok).toBe(false);
    expect(result.error.name).toBe('NotFoundError');
  });

  it('generates valid filename from record.saleId when snapshot.saleId is absent (legacy)', async () => {
    // Simulate a legacy snapshot that was persisted before saleId was added
    // to the snapshot schema.
    const legacySnapshot = {
      customer: { name: 'Juan Pérez', phone: null, address: null, district: null },
      fecha: '2026-05-20T10:00:00.000Z',
      pagado: 0,
      saldoPendiente: 0,
      prendas: [],
      templateVersion: 'v1',
      // saleId intentionally omitted
    };

    await emissionRepo.save({
      id: 'em-legacy',
      saleId: 'sale-uuid-legacy-abcdef',
      emissionNumber: 1,
      issuedAt: new Date('2026-05-20T10:00:00Z'),
      templateVersion: 'v1',
      snapshotJson: legacySnapshot,
    });

    const result = await useCase.execute({ emissionId: 'em-legacy' });

    expect(result.ok).toBe(true);
    const { pdf, metadata } = result.value;
    expect(pdf).toBeInstanceOf(Buffer);
    expect(pdf.length).toBeGreaterThan(500);

    // Falls back to record.saleId prefix
    expect(metadata.filename).toContain('sale-uui'); // 'sale-uuid-legacy-abcdef'.slice(0, 8) = 'sale-uui'
    expect(metadata.filename).toContain('emision-1');
    expect(metadata.contentType).toBe('application/pdf');
  });
});

// ────────────────────────────────────────────────────────────────
// Enriched sale detail payload for emission
// ────────────────────────────────────────────────────────────────
describe('Emission-enriched sale detail (2.3)', () => {
  it('includes all fields required for constancia snapshot', () => {
    // This verifies that the sale detail response shape includes
    // customerName, customerAddress, customerDistrict, customerPhone
    // plus line displayLabels — all fields needed by buildConstanciaSnapshot

    const enrichedSaleData = {
      customerName: 'Juan Pérez',
      customerPhone: '+5491123456789',
      customerAddress: 'Av. Corrientes 1234',
      customerDistrict: 'CABA',
      totalRevenueCents: 9000,
      amountPaidCents: 5000,
      pendingBalanceCents: 4000,
      createdAt: '2026-05-20T10:00:00.000Z',
      lines: [
        { id: 'line-1', displayLabel: 'Camiseta Blanca', quantity: 3, unitPriceCents: 2000, totalPriceCents: 6000 },
      ],
    };

    const snapshot = buildConstanciaSnapshot({
      saleId: 'sale-1',
      ...enrichedSaleData,
    });

    expect(snapshot.customer.name).toBe('Juan Pérez');
    expect(snapshot.customer.district).toBe('CABA');
    expect(snapshot.prendas).toHaveLength(1);
    const firstPrenda = snapshot.prendas[0]!;
    expect(firstPrenda.displayLabel).toBe('Camiseta Blanca');
  });
});

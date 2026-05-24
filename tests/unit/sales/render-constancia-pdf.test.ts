/**
 * Unit tests for renderConstanciaPdf — React PDF template with background image.
 *
 * Covers:
 * - Valid PDF output with embedded background PNG
 * - Buffer size reflects embedded image (> 50 KB vs ~2 KB baseline)
 * - Image XObject stream present in PDF structure
 * - Snapshot variants produce valid PDFs
 * - Different snapshots produce different PDFs
 *
 * NOTE: React PDF uses FlateDecode compression for page content streams,
 * so raw text assertions (customer names, amounts) are NOT reliable here.
 * Those checks belong at the use-case integration level
 * (sale-constancia-emissions.test.ts), which verifies the full round-trip
 * with HTTP response headers + filename + valid PDF.
 */
import { describe, it, expect } from 'vitest';
import { renderConstanciaPdf } from '../../../src/modules/sales-returns/application/use-cases/renderConstanciaPdf.js';
import type { ConstanciaSnapshot } from '../../../src/modules/sales-returns/application/use-cases/buildConstanciaSnapshot.js';

// ── Helpers ──────────────────────────────────────────────────

function makeSnapshot(overrides?: Partial<ConstanciaSnapshot>): ConstanciaSnapshot {
  return {
    saleId: 'sale-uuid-test',
    customer: {
      name: 'Juan Pérez',
      phone: '+5491123456789',
      address: 'Av. Corrientes 1234',
      district: 'CABA',
    },
    fecha: '2026-05-20T10:00:00.000Z',
    pagado: 5000,
    saldoPendiente: 4000,
    prendas: [
      {
        displayLabel: 'Camiseta Blanca M',
        quantity: 2,
        unitPriceCents: 2000,
        totalPriceCents: 4000,
      },
    ],
    templateVersion: 'v1',
    ...overrides,
  };
}

// ──────────────────────────────────────────────────────────────

describe('renderConstanciaPdf', () => {
  it('generates a valid PDF buffer with expected structural markers', async () => {
    const snapshot = makeSnapshot();
    const pdf = await renderConstanciaPdf(snapshot);

    expect(pdf).toBeInstanceOf(Buffer);

    // Valid PDF header
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    // Version marker
    const header = pdf.subarray(0, 8).toString('utf-8');
    expect(header).toMatch(/^%PDF-\d+\.\d+/);

    // React PDF producer marker — proves the React PDF renderer path is used
    expect(pdf.toString('utf-8')).toContain('react-pdf');
  });

  it('embeds the background image producing a significantly larger buffer', async () => {
    const snapshot = makeSnapshot({ prendas: [] });
    const pdf = await renderConstanciaPdf(snapshot);

    // Pre-image baseline was ~2-3 KB. The ~337 KB PNG embedded produces
    // a PDF > 50 KB. This proves the background image is included.
    expect(pdf.length).toBeGreaterThan(50_000);
  });

  it('contains an Image XObject stream — proves background is embedded', async () => {
    const snapshot = makeSnapshot();
    const pdf = await renderConstanciaPdf(snapshot);

    const pdfText = pdf.toString('utf-8');

    // PDF image embedding uses /Subtype /Image in the stream dictionary.
    // React PDF embeds the PNG as a FlateDecode image XObject.
    expect(pdfText).toMatch(/\/Subtype\s+\/Image/);
    expect(pdfText).toMatch(/\/Filter\s+\/FlateDecode/);
  });

  it('handles snapshot with empty prendas array', async () => {
    const snapshot = makeSnapshot({ prendas: [] });
    const pdf = await renderConstanciaPdf(snapshot);

    expect(pdf).toBeInstanceOf(Buffer);
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pdf.toString('utf-8')).toContain('react-pdf');
    // Background image still present
    expect(pdf.length).toBeGreaterThan(50_000);
  });

  it('handles snapshot with null customer fields', async () => {
    const snapshot = makeSnapshot({
      customer: {
        name: 'Sin datos',
        phone: null,
        address: null,
        district: null,
      },
    });
    const pdf = await renderConstanciaPdf(snapshot);

    expect(pdf).toBeInstanceOf(Buffer);
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pdf.toString('utf-8')).toContain('react-pdf');
    // Background image still present
    expect(pdf.length).toBeGreaterThan(50_000);
  });

  it('produces different PDFs for different snapshot data', async () => {
    const pdf1 = await renderConstanciaPdf(makeSnapshot({ pagado: 1000 }));
    const pdf2 = await renderConstanciaPdf(makeSnapshot({ pagado: 9000 }));

    // Different financial data should produce different PDF content
    // (even though the background image is the same, the text streams differ)
    expect(pdf1.equals(pdf2)).toBe(false);
  });
});

/**
 * Pure-function snapshot builder for constancia emissions.
 *
 * Takes enriched sale detail data and produces an immutable frozen
 * snapshot JSON. The snapshot is stored in `sale_constancia_emissions`
 * and used to regenerate identical PDFs later, regardless of
 * subsequent changes to customer or product data.
 */

// ── Input ──────────────────────────────────────────────────────

export interface ConstanciaSnapshotInput {
  saleId: string;
  customerName: string;
  customerPhone: string | null;
  customerAddress: string | null;
  customerDistrict: string | null;
  totalRevenueCents: number;
  amountPaidCents: number;
  pendingBalanceCents: number;
  createdAt: string;
  lines: {
    id: string;
    displayLabel: string;
    quantity: number;
    unitPriceCents: number;
    totalPriceCents: number;
  }[];
}

// ── Output ─────────────────────────────────────────────────────

export interface ConstanciaSnapshot {
  saleId: string;
  customer: {
    name: string;
    phone: string | null;
    address: string | null;
    district: string | null;
  };
  fecha: string;
  pagado: number;
  saldoPendiente: number;
  prendas: {
    displayLabel: string;
    quantity: number;
    unitPriceCents: number;
    totalPriceCents: number;
  }[];
  templateVersion: string;
}

// ── Builder ────────────────────────────────────────────────────

export function buildConstanciaSnapshot(
  input: ConstanciaSnapshotInput,
): ConstanciaSnapshot {
  return {
    saleId: input.saleId,
    customer: {
      name: input.customerName,
      phone: input.customerPhone,
      address: input.customerAddress,
      district: input.customerDistrict,
    },
    fecha: input.createdAt,
    pagado: input.amountPaidCents,
    saldoPendiente: input.pendingBalanceCents,
    prendas: input.lines.map((line) => ({
      displayLabel: line.displayLabel,
      quantity: line.quantity,
      unitPriceCents: line.unitPriceCents,
      totalPriceCents: line.totalPriceCents,
    })),
    templateVersion: 'v1',
  };
}

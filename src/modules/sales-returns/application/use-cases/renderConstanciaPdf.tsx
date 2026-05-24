/**
 * PDF renderer for constancia documents — React PDF implementation.
 *
 * Generates a valid PDF byte buffer from a constancia snapshot
 * using @react-pdf/renderer. The template supports proper layout
 * that can evolve toward the visual mockup.
 */
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readFileSync } from 'node:fs';
import { pdf, Document, Page, Text, View, Image, StyleSheet } from '@react-pdf/renderer';
import type { ConstanciaSnapshot } from './buildConstanciaSnapshot.js';

// ── Background image ─────────────────────────────────────────────
// Embedded as base64 data URI at module load time — Docker-safe,
// no URL or relative-path resolution at render time.

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const BACKGROUND_PNG_PATH = join(__dirname, '../../../../files/comprobante_background.png');
const BACKGROUND_IMAGE_DATA_URI = `data:image/png;base64,${readFileSync(BACKGROUND_PNG_PATH).toString('base64')}`;

// ── Styles ──────────────────────────────────────────────────────

// A4 dimensions in points (used for absolute-positioned background sizing)
const A4_WIDTH = 595;
const A4_HEIGHT = 842;

const styles = StyleSheet.create({
  page: {
    position: 'relative',
    padding: 50,
    fontSize: 13,
    fontFamily: 'Helvetica',
  },
  backgroundImage: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: A4_WIDTH,
    height: A4_HEIGHT,
    objectFit: 'cover',
  },
  title: {
    fontSize: 16,
    fontFamily: 'Helvetica-Bold',
    textAlign: 'center',
    marginBottom: 20,
  },
  section: {
    marginBottom: 16,
  },
  field: {
    marginBottom: 8,
    fontSize: 13,
    lineHeight: 1.5,
  },
  label: {
    fontFamily: 'Helvetica-Bold',
  },
  subtitle: {
    fontSize: 15,
    fontFamily: 'Helvetica-Bold',
    marginTop: 10,
    marginBottom: 8,
  },
  garmentLine: {
    marginBottom: 6,
    marginLeft: 12,
    fontSize: 12,
    lineHeight: 1.5,
  },
});

// ── Format helpers ───────────────────────────────────────────────

function formatCents(cents: number): string {
  return (cents / 100).toFixed(2);
}

function formatFechaLima(fecha: string): string {
  const date = new Date(fecha);
  if (Number.isNaN(date.getTime())) return fecha;

  return new Intl.DateTimeFormat('es-PE', {
    timeZone: 'America/Lima',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date);
}

// ── Document ────────────────────────────────────────────────────

interface ConstanciaDocumentProps {
  snapshot: ConstanciaSnapshot;
}

function ConstanciaDocument({ snapshot }: ConstanciaDocumentProps) {
  return (
    <Document
      title={`Constancia de venta — ${snapshot.customer.name}`}
      producer="react-pdf"
      creator="complicidad-backend"
    >
      <Page size="A4" style={styles.page}>
        {/* ── Background image — fixed positioning renders behind content ── */}
        <Image
          fixed
          src={BACKGROUND_IMAGE_DATA_URI}
          style={styles.backgroundImage}
        />

        {/* ── Content layer ── */}
        <View>
          {/* ── Header ────────────────────────────────────────── */}
          <Text style={styles.title}>CONSTANCIA DE VENTA</Text>

          {/* ── Customer info ─────────────────────────────────── */}
          <View style={styles.section}>
            <Text style={styles.field}>
              <Text style={styles.label}>Cliente: </Text>
              {snapshot.customer.name}
            </Text>
            {snapshot.customer.phone ? (
              <Text style={styles.field}>
                <Text style={styles.label}>Teléfono: </Text>
                {snapshot.customer.phone}
              </Text>
            ) : null}
            {snapshot.customer.address ? (
              <Text style={styles.field}>
                <Text style={styles.label}>Dirección: </Text>
                {snapshot.customer.address}
              </Text>
            ) : null}
            {snapshot.customer.district ? (
              <Text style={styles.field}>
                <Text style={styles.label}>Distrito: </Text>
                {snapshot.customer.district}
              </Text>
            ) : null}
          </View>

          {/* ── Sale data ─────────────────────────────────────── */}
          <View style={styles.section}>
            <Text style={styles.field}>
              <Text style={styles.label}>Fecha: </Text>
              {formatFechaLima(snapshot.fecha)}
            </Text>
            <Text style={styles.field}>
              <Text style={styles.label}>Pagado: </Text>
              S/.{formatCents(snapshot.pagado)}
            </Text>
            <Text style={styles.field}>
              <Text style={styles.label}>Saldo pendiente: </Text>
              S/.{formatCents(snapshot.saldoPendiente)}
            </Text>
          </View>

          {/* ── Garments list ──────────────────────────────────── */}
          {snapshot.prendas.length > 0 ? (
            <View style={styles.section}>
              <Text style={styles.subtitle}>Prendas:</Text>
              {snapshot.prendas.map((prenda, index) => (
                <Text key={index} style={styles.garmentLine}>
                  {prenda.quantity}x {prenda.displayLabel} — S/.
                  {formatCents(prenda.totalPriceCents)} (S/.
                  {formatCents(prenda.unitPriceCents)} c/u)
                </Text>
              ))}
            </View>
          ) : null}
        </View>
      </Page>
    </Document>
  );
}

// ── Renderer ────────────────────────────────────────────────────

/**
 * Render a constancia snapshot into a valid PDF Buffer
 * using @react-pdf/renderer.
 *
 * This replaces the previous raw PDF generation with a proper
 * React PDF template that supports the visual layout mockup.
 */
export async function renderConstanciaPdf(
  snapshot: ConstanciaSnapshot,
): Promise<Buffer> {
  const doc = <ConstanciaDocument snapshot={snapshot} />;
  const instance = pdf(doc);
  const blob = await instance.toBlob();
  const arrayBuffer = await blob.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

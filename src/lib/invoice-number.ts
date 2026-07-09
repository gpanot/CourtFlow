import { prisma } from "./db";

type InvoiceType = "BK" | "OP" | "CL" | "OB";

/**
 * Atomically increments the sequence counter for (venueId, type, year)
 * and returns a formatted invoice number: {SLUG}-{TYPE}-{YYYY}-{0000SEQ}
 *
 * The function uses a raw SQL UPDATE…RETURNING to guarantee no two concurrent
 * calls produce the same number even on a multi-process deployment.
 */
export async function allocateInvoiceNumber(
  venueId: string,
  type: InvoiceType
): Promise<string> {
  const year = new Date().getFullYear();

  // Upsert row and atomically increment — one round-trip, race-safe
  const rows = await prisma.$queryRaw<{ last_seq: number }[]>`
    INSERT INTO invoice_sequences (venue_id, type, year, last_seq)
    VALUES (${venueId}, ${type}, ${year}, 1)
    ON CONFLICT (venue_id, type, year)
    DO UPDATE SET last_seq = invoice_sequences.last_seq + 1
    RETURNING last_seq
  `;

  const seq = rows[0].last_seq;

  // Resolve venue slug for the prefix (fallback to first 4 chars of id)
  const venue = await prisma.venue.findUnique({
    where: { id: venueId },
    select: { slug: true },
  });
  const prefix = (venue?.slug ?? venueId.slice(0, 4)).toUpperCase();

  return `${prefix}-${type}-${year}-${String(seq).padStart(4, "0")}`;
}

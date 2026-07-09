/**
 * Open Bill B2B — core business logic
 *
 * All financial calculations follow the order defined in the plan:
 *   1. Compute subtotal from line items (cancelled lines = 0)
 *   2. Apply fixed discount
 *   3. Clamp taxable base to >= 0
 *   4. Apply VAT:
 *      - excluded: add VAT on top   → total = taxableBase + vatAmount
 *      - included: derive net + VAT split from gross (taxableBase already includes VAT)
 */

import { prisma } from "./db";
import { allocateInvoiceNumber } from "./invoice-number";
import { generatePaymentRef } from "../modules/courtpay/lib/payment-reference";

// ─── Types ───────────────────────────────────────────────────────────────────

export type OpenBillStatus = "open" | "issued" | "paid" | "overdue" | "void";

export interface OpenBillTotals {
  subtotal: number;
  discountAmount: number;
  taxableBase: number;
  vatAmount: number;
  totalAmount: number;
}

export interface BillLineItem {
  bookingId: string;
  date: Date;
  courtLabel: string;
  startTime: Date;
  endTime: Date;
  priceValue: number;
  isCancelled: boolean;
  /** Booker player id for multi-member reconciliation */
  bookerPlayerId: string;
  /** Snapshot of the booker's display name */
  bookerName: string;
}

// ─── Venue settings helper ────────────────────────────────────────────────────

export interface OpenBillVenueSettings {
  autoIssueOnFirst: boolean;
  defaultDueDays: number;
  blockOnOverdue: boolean;
  blockAfterDays: number;
}

export function getOpenBillVenueSettings(
  venueSettings: Record<string, unknown>
): OpenBillVenueSettings {
  const ob = (venueSettings?.openBill ?? {}) as Record<string, unknown>;
  return {
    autoIssueOnFirst: ob.autoIssueOnFirst !== false, // default true
    defaultDueDays: typeof ob.defaultDueDays === "number" ? ob.defaultDueDays : 7,
    blockOnOverdue: ob.blockOnOverdue === true, // default false
    blockAfterDays: typeof ob.blockAfterDays === "number" ? ob.blockAfterDays : 14,
  };
}

// ─── Financial calculations ───────────────────────────────────────────────────

export function computeOpenBillTotals(
  lineItems: BillLineItem[],
  fixedDiscountPercent: number,
  vatPercent: number,
  priceVatMode: "excluded" | "included"
): OpenBillTotals {
  // Step 1: subtotal — cancelled bookings contribute 0
  const subtotal = lineItems.reduce(
    (sum, li) => sum + (li.isCancelled ? 0 : li.priceValue),
    0
  );

  // Step 2: fixed discount percent (0-100)
  const clampedDiscountPercent = Math.max(0, Math.min(100, fixedDiscountPercent));
  const discountAmount = Math.min(
    Math.round(subtotal * (clampedDiscountPercent / 100)),
    subtotal
  );

  // Step 3: taxable base (clamped to >= 0)
  const taxableBase = Math.max(subtotal - discountAmount, 0);

  // Step 4: VAT
  let vatAmount = 0;
  let totalAmount = 0;

  if (vatPercent > 0) {
    if (priceVatMode === "excluded") {
      vatAmount = Math.round(taxableBase * (vatPercent / 100));
      totalAmount = taxableBase + vatAmount;
    } else {
      // included: gross = taxableBase; derive VAT split
      vatAmount = Math.round(taxableBase - taxableBase / (1 + vatPercent / 100));
      totalAmount = taxableBase;
    }
  } else {
    totalAmount = taxableBase;
  }

  return { subtotal, discountAmount, taxableBase, vatAmount, totalAmount };
}

// ─── Bill projection (line items from DB) ────────────────────────────────────

export async function getOpenBillLineItems(
  billId: string
): Promise<BillLineItem[]> {
  const bookings = await prisma.booking.findMany({
    where: { companyOpenBillId: billId },
    include: {
      court: { select: { label: true } },
      player: { select: { name: true } },
    },
    orderBy: [{ date: "asc" }, { startTime: "asc" }],
  });

  return bookings.map((b) => ({
    bookingId: b.id,
    date: b.date,
    courtLabel: b.court.label,
    startTime: b.startTime,
    endTime: b.endTime,
    priceValue: b.priceValue,
    isCancelled: b.status === "cancelled" || b.status === "expired_hold",
    bookerPlayerId: b.playerId,
    bookerName: b.player.name,
  }));
}

// ─── Bill recalculation (called when bookings change) ────────────────────────

export async function recalcOpenBill(billId: string): Promise<void> {
  const bill = await prisma.companyOpenBill.findUniqueOrThrow({
    where: { id: billId },
    include: { companyAccount: true },
  });

  if (bill.status !== "open") return; // don't recalc issued/paid/voided bills

  const lineItems = await getOpenBillLineItems(billId);
  const totals = computeOpenBillTotals(
    lineItems,
    bill.companyAccount.fixedDiscountPercent,
    bill.companyAccount.vatPercent,
    bill.companyAccount.priceVatMode as "excluded" | "included"
  );

  await prisma.companyOpenBill.update({
    where: { id: billId },
    data: {
      ...totals,
      vatPercent: bill.companyAccount.vatPercent,
      priceVatMode: bill.companyAccount.priceVatMode,
      updatedAt: new Date(),
    },
  });
}

// ─── Get or create the open bill for the current period ──────────────────────

/**
 * Returns the active 'open' bill for a company account + venue.
 * Creates one if none exists.
 *
 * Period start = today's local date (always).
 *  - Avoids UNIQUE conflicts if a prior bill was issued mid-month and a new
 *    booking comes in on a different calendar day.
 *  - The cron job finds bills via period_start range (>= 1st of month AND < 1st of
 *    next month), so today's date is always found correctly.
 *
 * Handles concurrent insert races via P2002 retry.
 */
export async function getOrCreateOpenBill(
  companyAccountId: string,
  venueId: string
): Promise<{ id: string }> {
  // Check for an existing open bill first
  const existing = await prisma.companyOpenBill.findFirst({
    where: { companyAccountId, venueId, status: "open" },
    orderBy: { periodStart: "desc" },
  });
  if (existing) return { id: existing.id };

  // Always use today as period_start for new bills.
  // Using noon local time avoids Prisma @db.Date off-by-one (UTC midnight = prev day).
  const today = new Date();
  const periodStartForPrisma = new Date(
    `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}T12:00:00+07:00`
  );

  try {
    const newBill = await prisma.companyOpenBill.create({
      data: {
        id: generateSimpleId("ob"),
        venueId,
        companyAccountId,
        periodStart: periodStartForPrisma,
        status: "open",
        subtotal: 0,
        discountAmount: 0,
        taxableBase: 0,
        vatAmount: 0,
        totalAmount: 0,
        vatPercent: 0,
        priceVatMode: "excluded",
        updatedAt: new Date(),
      },
    });

    await appendBillEvent(newBill.id, "created", "system", null, {
      note: "Open billing period started.",
    });

    return { id: newBill.id };
  } catch (e) {
    // P2002 = unique constraint violation — concurrent request just created the bill
    if ((e as { code?: string }).code === "P2002") {
      const raceWinner = await prisma.companyOpenBill.findFirst({
        where: { companyAccountId, venueId, status: "open" },
        orderBy: { periodStart: "desc" },
      });
      if (raceWinner) return { id: raceWinner.id };
    }
    throw e;
  }
}

// ─── Append audit event ───────────────────────────────────────────────────────

export async function appendBillEvent(
  billId: string,
  event: string,
  actorType: "staff" | "system" | "sepay",
  actorId: string | null,
  options?: { note?: string; meta?: Record<string, unknown> }
): Promise<void> {
  await prisma.companyOpenBillEvent.create({
    data: {
      id: generateSimpleId("be"),
      billId,
      event,
      actorType,
      actorId,
      note: options?.note ?? null,
      ...(options?.meta !== undefined && {
        meta: options.meta as import("@prisma/client").Prisma.InputJsonValue,
      }),
    },
  });
}

// ─── Issue a bill ─────────────────────────────────────────────────────────────

export interface IssueBillOptions {
  actorId: string;
  actorType: "staff" | "system";
  closeOpenBill?: boolean; // true when triggered by disable-open-bill
  /** Override due days. Falls back to account.paymentTermsDays → venue default → 7 */
  dueDaysOverride?: number;
}

export async function issueBill(
  billId: string,
  opts: IssueBillOptions
): Promise<{ paymentRef: string; invoiceNumber: string; dueDate: Date }> {
  const bill = await prisma.companyOpenBill.findUniqueOrThrow({
    where: { id: billId },
    include: { companyAccount: true },
  });

  if (bill.status !== "open") {
    throw new Error(`Bill ${billId} is not in 'open' status (current: ${bill.status})`);
  }

  const lineItems = await getOpenBillLineItems(billId);
  const totals = computeOpenBillTotals(
    lineItems,
    bill.companyAccount.fixedDiscountPercent,
    bill.companyAccount.vatPercent,
    bill.companyAccount.priceVatMode as "excluded" | "included"
  );

  const paymentRef = await generatePaymentRef("open-bill");
  const invoiceNumber = await allocateInvoiceNumber(bill.venueId, "OB");

  const now = new Date();
  // Priority: caller override → account payment terms → fallback 7 days
  const dueDays = opts.dueDaysOverride ?? bill.companyAccount.paymentTermsDays ?? 7;

  const dueDate = new Date(now);
  dueDate.setDate(dueDate.getDate() + dueDays);
  // Noon local to avoid Prisma DATE off-by-one
  const dueDateForPrisma = new Date(
    `${dueDate.getFullYear()}-${String(dueDate.getMonth() + 1).padStart(2, "0")}-${String(dueDate.getDate()).padStart(2, "0")}T12:00:00+07:00`
  );

  // Close the period end at today
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  const periodEndForPrisma = new Date(
    `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}T12:00:00+07:00`
  );

  await prisma.companyOpenBill.update({
    where: { id: billId },
    data: {
      ...totals,
      vatPercent: bill.companyAccount.vatPercent,
      priceVatMode: bill.companyAccount.priceVatMode,
      status: "issued",
      paymentRef,
      invoiceNumber,
      periodEnd: periodEndForPrisma,
      dueDate: dueDateForPrisma,
      issuedAt: now,
      issuedBy: opts.actorId,
      updatedAt: now,
    },
  });

  await appendBillEvent(billId, "issued", opts.actorType, opts.actorId, {
    note: opts.closeOpenBill ? "Issued on account closure." : "Statement issued.",
    meta: { invoiceNumber, totalAmount: totals.totalAmount },
  });

  return { paymentRef, invoiceNumber, dueDate };
}

// ─── Mark a bill paid ─────────────────────────────────────────────────────────

export async function markBillPaid(
  billId: string,
  actorId: string,
  actorType: "staff" | "sepay",
  method: string,
  options?: { note?: string }
): Promise<void> {
  const bill = await prisma.companyOpenBill.findUniqueOrThrow({
    where: { id: billId },
  });

  if (bill.status === "paid") return; // idempotent

  if (bill.status !== "issued" && bill.status !== "overdue") {
    throw new Error(
      `Bill ${billId} must be in 'issued' or 'overdue' status to mark paid (current: ${bill.status})`
    );
  }

  const now = new Date();

  await prisma.$transaction([
    prisma.companyOpenBill.update({
      where: { id: billId },
      data: { status: "paid", paidAt: now, paidBy: actorId, paidMethod: method, updatedAt: now },
    }),
    prisma.booking.updateMany({
      where: { companyOpenBillId: billId },
      data: { paymentStatus: "paid" },
    }),
  ]);

  await appendBillEvent(billId, "paid", actorType, actorId, {
    note: options?.note ?? `Marked paid via ${method}.`,
    meta: { method },
  });
}

// ─── Void a bill ──────────────────────────────────────────────────────────────

export async function voidBill(
  billId: string,
  actorId: string,
  reason: string
): Promise<void> {
  const bill = await prisma.companyOpenBill.findUniqueOrThrow({
    where: { id: billId },
  });

  if (bill.status === "void") return; // idempotent
  if (bill.status === "paid") {
    throw new Error("Cannot void a paid bill.");
  }

  const now = new Date();

  await prisma.$transaction([
    prisma.companyOpenBill.update({
      where: { id: billId },
      data: { status: "void", voidedAt: now, voidedBy: actorId, voidReason: reason, updatedAt: now },
    }),
    // Revert bookings on this bill back to pending (for re-issue or manual payment)
    prisma.booking.updateMany({
      where: { companyOpenBillId: billId, paymentStatus: "open_bill" },
      data: { paymentStatus: "pending" },
    }),
  ]);

  await appendBillEvent(billId, "void", "staff", actorId, {
    note: reason,
  });
}

// ─── Check if a player is an active open-bill member ─────────────────────────

export interface PlayerOpenBillAccount {
  companyAccountId: string;
  venueId: string;
  isOverdueBlocked: boolean;
}

export async function getPlayerOpenBillAccount(
  playerId: string,
  venueId: string
): Promise<PlayerOpenBillAccount | null> {
  const membership = await prisma.companyAccountPlayer.findFirst({
    where: {
      playerId,
      companyAccount: { venueId, isActive: true },
    },
    include: {
      companyAccount: {
        select: {
          id: true,
          venueId: true,
          creditLimitMode: true,
          openBillCreditLimit: true,
          paymentTermsDays: true,
        },
      },
    },
  });

  if (!membership) return null;

  return {
    companyAccountId: membership.companyAccount.id,
    venueId: membership.companyAccount.venueId,
    isOverdueBlocked: false, // detailed check done in the caller
  };
}

// ─── Attach a booking to its open bill ───────────────────────────────────────

export async function attachBookingToOpenBill(
  bookingId: string,
  companyAccountId: string,
  venueId: string
): Promise<void> {
  const { id: billId } = await getOrCreateOpenBill(companyAccountId, venueId);

  await prisma.booking.update({
    where: { id: bookingId },
    data: {
      companyOpenBillId: billId,
      paymentStatus: "open_bill",
      holdExpiresAt: null,
    },
  });

  await recalcOpenBill(billId);
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function generateSimpleId(prefix: string): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  let id = prefix + "_";
  for (let i = 0; i < 20; i++) {
    id += chars[Math.floor(Math.random() * chars.length)];
  }
  return id;
}

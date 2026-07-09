import React from "react";
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Image,
} from "@react-pdf/renderer";

const BRAND_GREEN = "#22c55e";
const DARK_BG = "#111827";
const BORDER = "#e5e7eb";
const MUTED = "#6b7280";
const BODY_TEXT = "#1f2937";
const CANCELLED_MUTED = "#9ca3af";

const styles = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 9,
    color: BODY_TEXT,
    backgroundColor: "#ffffff",
    paddingTop: 40,
    paddingBottom: 50,
    paddingHorizontal: 48,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 28,
    paddingBottom: 20,
    borderBottomWidth: 2,
    borderBottomColor: BRAND_GREEN,
  },
  headerLeft: { flex: 1 },
  logo: { width: 48, height: 48, marginBottom: 6, objectFit: "contain" },
  venueName: { fontSize: 14, fontFamily: "Helvetica-Bold", color: DARK_BG, marginBottom: 2 },
  venueDetail: { fontSize: 8, color: MUTED, lineHeight: 1.5 },
  headerRight: { alignItems: "flex-end", minWidth: 160 },
  statementLabel: {
    fontSize: 20,
    fontFamily: "Helvetica-Bold",
    color: BRAND_GREEN,
    letterSpacing: 1,
    marginBottom: 4,
  },
  invoiceNumber: { fontSize: 10, fontFamily: "Helvetica-Bold", color: DARK_BG, marginBottom: 2 },
  invoiceDate: { fontSize: 8, color: MUTED },
  statusBadge: {
    marginTop: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    backgroundColor: BRAND_GREEN,
  },
  statusText: { fontSize: 8, fontFamily: "Helvetica-Bold", color: "#ffffff", textTransform: "uppercase" },
  metaRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 24, gap: 16 },
  metaBox: {
    flex: 1,
    padding: 12,
    backgroundColor: "#f9fafb",
    borderRadius: 4,
    borderWidth: 1,
    borderColor: BORDER,
  },
  metaTitle: {
    fontSize: 7,
    fontFamily: "Helvetica-Bold",
    color: MUTED,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 6,
  },
  metaValue: { fontSize: 9, color: BODY_TEXT, lineHeight: 1.6 },
  metaValueBold: { fontSize: 9, fontFamily: "Helvetica-Bold", color: DARK_BG, lineHeight: 1.6 },
  // Table
  table: { marginBottom: 16 },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: DARK_BG,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 2,
    marginBottom: 2,
  },
  tableRow: {
    flexDirection: "row",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  tableRowAlt: { backgroundColor: "#f9fafb" },
  tableRowCancelled: { opacity: 0.5 },
  colDate: { width: "12%" },
  colCourt: { width: "12%" },
  colTime: { width: "16%" },
  colBooker: { width: "18%" },
  colDesc: { width: "26%" },
  colStatus: { width: "8%" },
  colAmount: { width: "8%", textAlign: "right" },
  thText: { fontSize: 7, fontFamily: "Helvetica-Bold", color: "#ffffff", textTransform: "uppercase" },
  tdText: { fontSize: 8, color: BODY_TEXT },
  tdMuted: { fontSize: 8, color: CANCELLED_MUTED },
  // Totals
  totalsSection: { alignItems: "flex-end", marginTop: 12, marginBottom: 16 },
  totalsBox: { width: 240, borderWidth: 1, borderColor: BORDER, borderRadius: 4, overflow: "hidden" },
  totalsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  totalsRowTotal: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: DARK_BG,
  },
  totalsLabel: { fontSize: 8, color: MUTED },
  totalsValue: { fontSize: 8, color: BODY_TEXT, fontFamily: "Helvetica-Bold" },
  totalLabel: { fontSize: 10, fontFamily: "Helvetica-Bold", color: "#ffffff" },
  totalValue: { fontSize: 10, fontFamily: "Helvetica-Bold", color: BRAND_GREEN },
  // Payment section
  paymentBox: {
    marginTop: 8,
    padding: 14,
    borderWidth: 1,
    borderColor: BRAND_GREEN,
    borderRadius: 4,
    backgroundColor: "#f0fdf4",
  },
  paymentTitle: { fontSize: 9, fontFamily: "Helvetica-Bold", color: DARK_BG, marginBottom: 8 },
  paymentRow: { flexDirection: "row", marginBottom: 4, gap: 8 },
  paymentLabel: { fontSize: 8, color: MUTED, width: 100 },
  paymentValue: { fontSize: 8, color: BODY_TEXT, fontFamily: "Helvetica-Bold" },
  footer: {
    position: "absolute",
    bottom: 28,
    left: 48,
    right: 48,
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: BORDER,
    paddingTop: 8,
  },
  footerText: { fontSize: 7, color: MUTED },
});

export interface OpenBillLineItem {
  bookingId: string;
  date: string;
  courtLabel: string;
  startTime: string;
  endTime: string;
  priceValue: number;
  isCancelled: boolean;
  bookerName: string;
}

export interface OpenBillStatementData {
  invoiceNumber: string;
  issuedAt: string;
  dueDate?: string | null;
  periodStart: string;
  periodEnd?: string | null;
  status: string;
  // Company
  companyName: string;
  billingEmail?: string | null;
  taxId?: string | null;
  billingAddress?: string | null;
  contactPhone?: string | null;
  isSolo: boolean;
  // Financials
  subtotal: number;
  discountAmount: number;
  taxableBase: number;
  vatAmount: number;
  vatPercent: number;
  priceVatMode: string;
  totalAmount: number;
  paymentRef?: string | null;
  paidMethod?: string | null;
  // Line items
  lineItems: OpenBillLineItem[];
  // Venue
  venueName: string;
  venueLocation?: string | null;
  venueLogoUrl?: string | null;
  venueBankName?: string | null;
  venueBankAccount?: string | null;
  venueBankOwnerName?: string | null;
  venuePhone?: string | null;
  // Org
  legalCompanyName?: string | null;
  registrationNumber?: string | null;
  orgTaxId?: string | null;
  registeredAddress?: string | null;
}

function fmt(n: number): string {
  return n.toLocaleString("vi-VN") + " ₫";
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function fmtTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false });
}

export function OpenBillStatementPDF({ data }: { data: OpenBillStatementData }) {
  const showBookerColumn = !data.isSolo && data.lineItems.some((li) => li.bookerName);

  const periodLabel =
    data.periodEnd
      ? `${fmtDate(data.periodStart)} – ${fmtDate(data.periodEnd)}`
      : `From ${fmtDate(data.periodStart)}`;

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* ─── Header ─── */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            {data.venueLogoUrl && <Image src={data.venueLogoUrl} style={styles.logo} />}
            <Text style={styles.venueName}>{data.venueName}</Text>
            {data.venueLocation && <Text style={styles.venueDetail}>{data.venueLocation}</Text>}
            {(data.legalCompanyName) && (
              <Text style={styles.venueDetail}>{data.legalCompanyName}</Text>
            )}
            {data.orgTaxId && <Text style={styles.venueDetail}>Tax ID: {data.orgTaxId}</Text>}
            {data.registeredAddress && (
              <Text style={styles.venueDetail}>{data.registeredAddress}</Text>
            )}
          </View>
          <View style={styles.headerRight}>
            <Text style={styles.statementLabel}>STATEMENT</Text>
            <Text style={styles.invoiceNumber}>{data.invoiceNumber}</Text>
            <Text style={styles.invoiceDate}>Issued: {fmtDate(data.issuedAt)}</Text>
            {data.dueDate && (
              <Text style={styles.invoiceDate}>Due: {fmtDate(data.dueDate)}</Text>
            )}
            <View style={styles.statusBadge}>
              <Text style={styles.statusText}>{data.status.toUpperCase()}</Text>
            </View>
          </View>
        </View>

        {/* ─── Meta Row ─── */}
        <View style={styles.metaRow}>
          {/* Bill To */}
          <View style={styles.metaBox}>
            <Text style={styles.metaTitle}>Bill To</Text>
            <Text style={styles.metaValueBold}>{data.companyName}</Text>
            {!data.isSolo && data.taxId && (
              <Text style={styles.metaValue}>Tax ID: {data.taxId}</Text>
            )}
            {!data.isSolo && data.billingAddress && (
              <Text style={styles.metaValue}>{data.billingAddress}</Text>
            )}
            {data.billingEmail && (
              <Text style={styles.metaValue}>{data.billingEmail}</Text>
            )}
            {data.contactPhone && (
              <Text style={styles.metaValue}>{data.contactPhone}</Text>
            )}
          </View>

          {/* Period */}
          <View style={styles.metaBox}>
            <Text style={styles.metaTitle}>Billing Period</Text>
            <Text style={styles.metaValueBold}>{periodLabel}</Text>
            <Text style={styles.metaValue}>{data.lineItems.length} line item(s)</Text>
          </View>

          {/* Payment */}
          <View style={styles.metaBox}>
            <Text style={styles.metaTitle}>Payment</Text>
            {data.paymentRef ? (
              <>
                <Text style={styles.metaValueBold}>{data.paymentRef}</Text>
                <Text style={styles.metaValue}>Use this reference for transfer</Text>
              </>
            ) : (
              <Text style={styles.metaValue}>To be issued</Text>
            )}
            {data.paidMethod && (
              <Text style={styles.metaValue}>Paid via {data.paidMethod}</Text>
            )}
          </View>
        </View>

        {/* ─── Table ─── */}
        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={[styles.thText, styles.colDate]}>Date</Text>
            <Text style={[styles.thText, styles.colCourt]}>Court</Text>
            <Text style={[styles.thText, styles.colTime]}>Time</Text>
            {showBookerColumn && (
              <Text style={[styles.thText, styles.colBooker]}>Booker</Text>
            )}
            <Text style={[styles.thText, styles.colDesc]}>Description</Text>
            <Text style={[styles.thText, styles.colStatus]}>Status</Text>
            <Text style={[styles.thText, styles.colAmount]}>Amount</Text>
          </View>

          {data.lineItems.map((li, i) => {
            const tdStyle = li.isCancelled ? styles.tdMuted : styles.tdText;
            const rowStyle = [
              styles.tableRow,
              ...(i % 2 === 1 ? [styles.tableRowAlt] : []),
              ...(li.isCancelled ? [styles.tableRowCancelled] : []),
            ];

            const timeSlot = `${fmtTime(li.startTime)} – ${fmtTime(li.endTime)}`;
            const desc = `Court ${li.courtLabel} – ${timeSlot}`;

            return (
              <View key={li.bookingId} style={rowStyle}>
                <Text style={[tdStyle, styles.colDate]}>{fmtDate(li.date)}</Text>
                <Text style={[tdStyle, styles.colCourt]}>{li.courtLabel}</Text>
                <Text style={[tdStyle, styles.colTime]}>{timeSlot}</Text>
                {showBookerColumn && (
                  <Text style={[tdStyle, styles.colBooker]}>{li.bookerName}</Text>
                )}
                <Text style={[tdStyle, styles.colDesc]}>{desc}</Text>
                <Text style={[tdStyle, styles.colStatus]}>
                  {li.isCancelled ? "Cancelled" : "Active"}
                </Text>
                <Text style={[tdStyle, styles.colAmount]}>
                  {li.isCancelled ? "—" : fmt(li.priceValue)}
                </Text>
              </View>
            );
          })}
        </View>

        {/* ─── Totals ─── */}
        <View style={styles.totalsSection}>
          <View style={styles.totalsBox}>
            <View style={styles.totalsRow}>
              <Text style={styles.totalsLabel}>Subtotal</Text>
              <Text style={styles.totalsValue}>{fmt(data.subtotal)}</Text>
            </View>
            {data.discountAmount > 0 && (
              <View style={styles.totalsRow}>
                <Text style={styles.totalsLabel}>Fixed Discount</Text>
                <Text style={styles.totalsValue}>– {fmt(data.discountAmount)}</Text>
              </View>
            )}
            {!data.isSolo && data.vatPercent > 0 && (
              <>
                <View style={styles.totalsRow}>
                  <Text style={styles.totalsLabel}>
                    Taxable Base {data.priceVatMode === "included" ? "(incl. VAT)" : ""}
                  </Text>
                  <Text style={styles.totalsValue}>{fmt(data.taxableBase)}</Text>
                </View>
                <View style={styles.totalsRow}>
                  <Text style={styles.totalsLabel}>VAT {data.vatPercent}%</Text>
                  <Text style={styles.totalsValue}>
                    {data.priceVatMode === "excluded" ? "+ " : ""}{fmt(data.vatAmount)}
                  </Text>
                </View>
              </>
            )}
            <View style={styles.totalsRowTotal}>
              <Text style={styles.totalLabel}>TOTAL DUE</Text>
              <Text style={styles.totalValue}>{fmt(data.totalAmount)}</Text>
            </View>
          </View>
        </View>

        {/* ─── Payment info ─── */}
        {data.paymentRef && data.status !== "paid" && (
          <View style={styles.paymentBox}>
            <Text style={styles.paymentTitle}>Payment Instructions</Text>
            <View style={styles.paymentRow}>
              <Text style={styles.paymentLabel}>Payment Reference</Text>
              <Text style={styles.paymentValue}>{data.paymentRef}</Text>
            </View>
            {data.venueBankAccount && (
              <>
                <View style={styles.paymentRow}>
                  <Text style={styles.paymentLabel}>Bank</Text>
                  <Text style={styles.paymentValue}>{data.venueBankName}</Text>
                </View>
                <View style={styles.paymentRow}>
                  <Text style={styles.paymentLabel}>Account Number</Text>
                  <Text style={styles.paymentValue}>{data.venueBankAccount}</Text>
                </View>
                <View style={styles.paymentRow}>
                  <Text style={styles.paymentLabel}>Account Name</Text>
                  <Text style={styles.paymentValue}>{data.venueBankOwnerName}</Text>
                </View>
              </>
            )}
            <View style={styles.paymentRow}>
              <Text style={styles.paymentLabel}>Amount</Text>
              <Text style={styles.paymentValue}>{fmt(data.totalAmount)}</Text>
            </View>
          </View>
        )}

        {/* ─── Footer ─── */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>{data.venueName}</Text>
          <Text style={styles.footerText}>{data.invoiceNumber}</Text>
          {data.venuePhone && (
            <Text style={styles.footerText}>{data.venuePhone}</Text>
          )}
        </View>
      </Page>
    </Document>
  );
}

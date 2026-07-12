/**
 * Renders a payment-request PNG for staff to share on Zalo / WhatsApp.
 *
 * Layout (600 × 900):
 *   ┌──────────────────────────────────┐
 *   │  Header: venue name + label      │
 *   │  Payment ref (large, green)      │
 *   │  Description line                │
 *   │  Date + time                     │
 *   │  Amount                          │
 *   │  ── divider ──────────────────── │
 *   │  VietQR image (centred)          │
 *   │  Footer note                     │
 *   └──────────────────────────────────┘
 *
 * Uses sharp for PNG generation; VietQR image fetched from img.vietqr.io.
 * If the VietQR fetch fails the card is still returned without the QR section.
 */

import sharp from "sharp";
import { buildVietQRUrl } from "./vietqr";
import type { PaymentRequestData } from "./payment-request";
import { parseDateKey } from "./date";

const CARD_W = 600;

const BRAND_GREEN = "#22c55e";
const DARK_TEXT = "#111827";
const MID_TEXT = "#374151";
const MUTED_TEXT = "#6b7280";
const BG = "#f9fafb";
const CARD_BG = "#ffffff";
const DIVIDER = "#e5e7eb";

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatLocalTime(d: Date): string {
  return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

function formatLocalDate(dateKey: string): string {
  const d = parseDateKey(dateKey);
  return d.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatAmount(vnd: number): string {
  return vnd.toLocaleString("en") + " VND";
}

/**
 * Builds the SVG markup for the entire card (without QR; QR is composited separately).
 */
function buildSvgCard(data: PaymentRequestData, hasQr: boolean): string {
  const { venueName, paymentRef, description, dateKey, startTime, endTime, amountValue, playerName, bankAccount, bankOwnerName } = data;
  const dateStr = formatLocalDate(dateKey);
  const timeStr = `${formatLocalTime(startTime)} – ${formatLocalTime(endTime)}`;
  const amountStr = formatAmount(amountValue);

  // QR area starts after the amount block + divider
  const QR_AREA_Y = 490;
  const QR_SIZE_H = 260;
  // Bank info block below QR (only when QR present and bank details available)
  const hasBankInfo = hasQr && !!(bankAccount && bankOwnerName);
  const bankInfoH = hasBankInfo ? 56 : 0;
  const QR_PLACEHOLDER_H = hasQr ? QR_SIZE_H + 40 + bankInfoH : 0;
  const footerY = QR_AREA_Y + QR_PLACEHOLDER_H + (hasQr ? 24 : 16);
  const svgHeight = footerY + 80;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${CARD_W}" height="${svgHeight}" font-family="system-ui, -apple-system, Helvetica, sans-serif">
  <!-- background -->
  <rect width="${CARD_W}" height="${svgHeight}" fill="${BG}" />
  <!-- card shadow simulation -->
  <rect x="28" y="28" width="${CARD_W - 56}" height="${svgHeight - 56}" rx="16" fill="#000000" fill-opacity="0.06" />
  <!-- card -->
  <rect x="24" y="24" width="${CARD_W - 48}" height="${svgHeight - 48}" rx="16" fill="${CARD_BG}" />
  <!-- top accent bar -->
  <rect x="24" y="24" width="${CARD_W - 48}" height="6" rx="3" fill="${BRAND_GREEN}" />

  <!-- header: venue name -->
  <text x="48" y="82" font-size="13" fill="${MUTED_TEXT}" letter-spacing="0.5">PAYMENT REQUEST</text>
  <text x="48" y="108" font-size="20" font-weight="700" fill="${DARK_TEXT}">${escapeXml(venueName)}</text>

  <!-- divider 1 -->
  <line x1="48" y1="128" x2="${CARD_W - 48}" y2="128" stroke="${DIVIDER}" stroke-width="1" />

  <!-- payment ref -->
  <text x="48" y="162" font-size="11" fill="${MUTED_TEXT}">BOOKING REFERENCE</text>
  <text x="48" y="192" font-size="28" font-weight="700" fill="${BRAND_GREEN}" letter-spacing="1">${escapeXml(paymentRef)}</text>

  <!-- player -->
  <text x="48" y="232" font-size="13" fill="${MUTED_TEXT}">PLAYER</text>
  <text x="48" y="256" font-size="16" font-weight="600" fill="${MID_TEXT}">${escapeXml(playerName)}</text>

  <!-- description -->
  <text x="48" y="292" font-size="13" fill="${MUTED_TEXT}">BOOKING</text>
  <text x="48" y="316" font-size="16" font-weight="600" fill="${MID_TEXT}">${escapeXml(description)}</text>

  <!-- date + time -->
  <text x="48" y="356" font-size="13" fill="${MUTED_TEXT}">DATE &amp; TIME</text>
  <text x="48" y="378" font-size="15" fill="${MID_TEXT}">${escapeXml(dateStr)}</text>
  <text x="48" y="400" font-size="15" fill="${MID_TEXT}">${escapeXml(timeStr)}</text>

  <!-- divider 2 -->
  <line x1="48" y1="424" x2="${CARD_W - 48}" y2="424" stroke="${DIVIDER}" stroke-width="1" />

  <!-- amount: left-aligned, below divider -->
  <text x="48" y="452" font-size="11" fill="${MUTED_TEXT}" letter-spacing="0.5">TOTAL AMOUNT</text>
  <text x="48" y="480" font-size="28" font-weight="700" fill="${BRAND_GREEN}">${escapeXml(amountStr)}</text>

  ${hasQr ? `
  <!-- QR label -->
  <text x="${CARD_W / 2}" y="${QR_AREA_Y + 24}" font-size="13" fill="${MUTED_TEXT}" text-anchor="middle">Scan to pay via VietQR</text>
  <!-- QR placeholder rect (composited over by sharp) -->
  <rect id="qr-area" x="${(CARD_W - 260) / 2}" y="${QR_AREA_Y + 40}" width="260" height="260" rx="12" fill="#f3f4f6" />
  ${hasBankInfo ? `
  <!-- bank account info below QR -->
  <text x="${CARD_W / 2}" y="${QR_AREA_Y + 40 + QR_SIZE_H + 32}" font-size="14" font-weight="600" fill="${DARK_TEXT}" text-anchor="middle">${escapeXml(bankOwnerName!)}</text>
  <text x="${CARD_W / 2}" y="${QR_AREA_Y + 40 + QR_SIZE_H + 54}" font-size="15" font-weight="700" fill="${MID_TEXT}" text-anchor="middle" letter-spacing="1">${escapeXml(bankAccount!)}</text>
  ` : ""}
  ` : `
  <!-- no bank config notice -->
  <text x="${CARD_W / 2}" y="${QR_AREA_Y + 20}" font-size="13" fill="${MUTED_TEXT}" text-anchor="middle">Bank transfer details not configured.</text>
  <text x="${CARD_W / 2}" y="${QR_AREA_Y + 42}" font-size="13" fill="${MUTED_TEXT}" text-anchor="middle">Contact venue for payment instructions.</text>
  `}

  <!-- footer -->
  <text x="${CARD_W / 2}" y="${footerY + 20}" font-size="12" fill="${MUTED_TEXT}" text-anchor="middle">Pay via bank transfer and send the receipt screenshot to the venue.</text>
  <text x="${CARD_W / 2}" y="${footerY + 40}" font-size="12" fill="${MUTED_TEXT}" text-anchor="middle">Powered by CourtFlow</text>
</svg>`;
}

/**
 * Fetches the VietQR image from the CDN and returns a Buffer, or null on failure.
 */
async function fetchVietQRBuffer(
  bankBin: string,
  bankAccount: string,
  bankOwnerName: string,
  amount: number,
  paymentRef: string,
): Promise<Buffer | null> {
  const url = buildVietQRUrl({
    bankBin,
    accountNumber: bankAccount,
    accountName: bankOwnerName,
    amount,
    description: paymentRef,
    template: "compact",
  });
  if (!url) return null;

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch {
    return null;
  }
}

/**
 * Renders the payment-request card as a PNG Buffer.
 * Never throws — if VietQR fails, the card is rendered without the QR.
 */
export async function renderPaymentRequestPng(
  data: PaymentRequestData,
): Promise<Buffer> {
  const hasBank = !!(data.bankBin && data.bankAccount);

  let qrBuffer: Buffer | null = null;
  if (hasBank) {
    qrBuffer = await fetchVietQRBuffer(
      data.bankBin!,
      data.bankAccount!,
      data.bankOwnerName ?? "",
      data.amountValue,
      data.paymentRef,
    );
  }

  const hasQr = qrBuffer !== null;
  const svgMarkup = buildSvgCard(data, hasQr);
  const svgBuffer = Buffer.from(svgMarkup);

  if (!hasQr) {
    return sharp(svgBuffer)
      .png({ compressionLevel: 6 })
      .toBuffer();
  }

  // Composite: render SVG first, then overlay the QR image
  const QR_X = (CARD_W - 260) / 2;
  const QR_Y = 530; // 490 (area start) + 40 (label height)
  const QR_SIZE = 260;

  // Resize QR to target size (qrBuffer is guaranteed non-null because hasQr is true)
  const resizedQr = await sharp(qrBuffer!)
    .resize(QR_SIZE, QR_SIZE, { fit: "contain", background: "#ffffff" })
    .png()
    .toBuffer();

  // Render SVG to PNG at the full height
  const basePng = await sharp(svgBuffer)
    .png()
    .toBuffer();

  return sharp(basePng)
    .composite([
      {
        input: resizedQr,
        left: Math.round(QR_X),
        top: QR_Y,
      },
    ])
    .png({ compressionLevel: 6 })
    .toBuffer();
}

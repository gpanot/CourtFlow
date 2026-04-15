/**
 * VietQR quick-transfer URL builder.
 * Spec: https://www.vietqr.io/en/specification
 *
 * The URL encodes bank + amount + description into a QR scannable by any Vietnamese banking app.
 */

const VIETQR_BASE = "https://img.vietqr.io/image";

export interface VietQRParams {
  bankBin: string;
  accountNumber: string;
  accountName: string;
  amount: number;
  description: string;
}

/**
 * Returns a URL that renders a VietQR image when loaded in an <img> tag.
 * Falls back to null if bank details are incomplete.
 */
export function buildVietQRUrl(params: VietQRParams): string | null {
  if (!params.bankBin || !params.accountNumber) return null;

  const desc = encodeURIComponent(params.description.slice(0, 50));
  const name = encodeURIComponent(params.accountName || "");
  return `${VIETQR_BASE}/${params.bankBin}-${params.accountNumber}-compact2.png?amount=${params.amount}&addInfo=${desc}&accountName=${name}`;
}

export interface BankOption {
  bin: string;
  name: string;
}

/**
 * Vietnamese banks supported by VietQR, sorted alphabetically.
 * `bin` is the NAPAS BIN used in QR generation.
 * `Venue.bankName` stores the BIN value directly.
 */
export const VIETQR_BANKS: BankOption[] = [
  { bin: "970416", name: "ACB" },
  { bin: "970405", name: "Agribank" },
  { bin: "970409", name: "Bac A Bank" },
  { bin: "970418", name: "BIDV" },
  { bin: "970431", name: "Eximbank" },
  { bin: "970437", name: "HDBank" },
  { bin: "970449", name: "LienVietPostBank" },
  { bin: "970422", name: "MB Bank" },
  { bin: "970426", name: "MSB" },
  { bin: "970428", name: "Nam A Bank" },
  { bin: "970448", name: "OCB" },
  { bin: "970403", name: "Sacombank" },
  { bin: "970440", name: "SeABank" },
  { bin: "970443", name: "SHB" },
  { bin: "970407", name: "Techcombank" },
  { bin: "970423", name: "TPBank" },
  { bin: "970441", name: "VIB" },
  { bin: "970436", name: "Vietcombank" },
  { bin: "970415", name: "VietinBank" },
  { bin: "970432", name: "VPBank" },
];

/** Look up display name from BIN. Returns the BIN itself if not found. */
export function bankNameFromBin(bin: string): string {
  return VIETQR_BANKS.find((b) => b.bin === bin)?.name ?? bin;
}

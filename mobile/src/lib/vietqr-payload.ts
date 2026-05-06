/**
 * Pure EMVCo VietQR payload builder — zero dependencies.
 *
 * Generates the raw EMVCo QR string for react-native-qrcode-svg so QR codes
 * appear instantly without fetching from the VietQR CDN.
 *
 * Spec: EMVCo QR Code Specification for Payment Systems (Merchant-Presented)
 *       + NAPAS VietQR addendum.
 */

const NAPAS_GUID = "A000000727";

export interface VietQRPayloadParams {
  bankBin: string;
  accountNumber: string;
  amount: number;
  /** Payment reference / addInfo — max 50 chars (truncated automatically). */
  paymentRef: string;
}

function tlv(id: string, value: string): string {
  const len = value.length.toString().padStart(2, "0");
  return `${id}${len}${value}`;
}

function crc16(input: string): string {
  let crc = 0xffff;
  for (let i = 0; i < input.length; i++) {
    crc ^= input.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      crc = crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1;
      crc &= 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

/**
 * Returns the raw EMVCo VietQR string to pass to a QR code renderer,
 * or `null` when bank details are missing.
 */
export function buildVietQRPayload(
  params: VietQRPayloadParams,
): string | null {
  if (!params.bankBin || !params.accountNumber) return null;

  const serviceCode = "QRIBFTTA";
  const message = params.paymentRef.slice(0, 50);

  // NAPAS IBFT v1.5.2: field 38.01 wraps BIN (00) + account (01) as nested TLVs.
  const beneficiaryOrg =
    tlv("00", params.bankBin) +
    tlv("01", params.accountNumber);

  const consumerAccountInfo =
    tlv("00", NAPAS_GUID) +
    tlv("01", beneficiaryOrg) +
    tlv("02", serviceCode);

  let payload = "";
  payload += tlv("00", "01"); // Payload Format Indicator
  payload += tlv("01", "12"); // Dynamic QR
  payload += tlv("38", consumerAccountInfo); // Merchant Account Info (NAPAS)
  payload += tlv("52", "0000"); // MCC
  payload += tlv("53", "704"); // Currency (VND)
  if (params.amount > 0) {
    payload += tlv("54", String(params.amount)); // Transaction Amount
  }
  payload += tlv("58", "VN"); // Country
  if (message) {
    payload += tlv("62", tlv("08", message)); // Additional Data — Purpose of Transaction
  }
  // CRC placeholder: "6304" then the 4-char checksum
  payload += "6304";
  payload += crc16(payload);

  return payload;
}

import { PayOS } from "@payos/node";

if (
  !process.env.PAYOS_CLIENT_ID ||
  !process.env.PAYOS_API_KEY ||
  !process.env.PAYOS_CHECKSUM_KEY
) {
  console.warn(
    "[PayOS] Missing PAYOS_CLIENT_ID / PAYOS_API_KEY / PAYOS_CHECKSUM_KEY — payment creation will fail."
  );
}

export const payos = new PayOS({
  clientId: process.env.PAYOS_CLIENT_ID ?? "",
  apiKey: process.env.PAYOS_API_KEY ?? "",
  checksumKey: process.env.PAYOS_CHECKSUM_KEY ?? "",
});

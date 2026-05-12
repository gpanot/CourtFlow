# SePay Integration Report — CourtFlow Sticker Kiosk

**Project:** CourtFlow Sticker Kiosk  
**Date:** May 12, 2026  
**Webhook URL:** `https://courtflow-production-0441.up.railway.app/api/webhooks/sepay`  
**Contact:** Guillaume Panot

---

## Summary

This document describes the SePay webhook integration for the CourtFlow Sticker Kiosk and the two configuration attempts made during setup, along with the final working configuration.

The integration purpose is to automatically confirm sticker pack purchases in real time: when a player transfers money via a Vietnamese banking app using the SePay QR code shown on the kiosk, SePay fires a webhook to our server, which marks the payment as confirmed and the kiosk flips to the download confirmation screen within 3 seconds.

---

## Bank Account Configuration

| Field | Value |
|---|---|
| Bank | BIDV |
| Bank BIN | 970418 |
| Account Number | 8848834790 |
| Account Owner | Nhu |
| Transaction sync | Incoming only |

The bank account was configured in SePay to synchronize incoming transactions. During the first test attempt, a keyword filter **"STICKER"** was added to the sync configuration (Bank → General configuration → Synchronize transactions by keyword). This filter was later **removed** to allow all incoming transactions to sync freely.

---

## Payment Code Format

Each payment session generates a unique payment code using the prefix `STICKER` followed by a 10-character token slice:

```
Example: STICKERCMP2KAEXY0
```

This code is:
- Embedded in the SePay QR code as the transfer memo (`des` parameter)
- Displayed on the kiosk screen below the QR under "Transfer memo"
- Used by our webhook to match the incoming transaction to the correct player's sticker pack

The `STICKER` prefix must be configured in SePay under **Company → General settings → Payment code structure** so that SePay extracts the code into the `code` field of the webhook payload.

---

## Webhook Configuration

**Webhook name:** Stickers Kiosk CourtPay  
**URL:** `https://courtflow-production-0441.up.railway.app/api/webhooks/sepay`  
**Transaction type:** Money coming in  
**Data format:** JSON (`application/json`)  
**Accounts:** All accounts  
**Auto-resend on error:** Disabled  

---

## Test Attempt 1 — HMAC-SHA256 + STICKER keyword filter (Failed)

### Configuration
- **Security:** HMAC-SHA256 enabled on the webhook
- **Secret key:** Stored in Railway environment as `SEPAY_WEBHOOK_SECRET`
- **Bank sync keyword filter:** "STICKER" active on the BIDV account

### What happened
1. A real payment was made with the correct memo (`STICKERCMP2KAEXY0`)
2. **The transaction arrived at BIDV** (confirmed by bank statement)
3. **The transaction did NOT appear in SePay** — the keyword filter blocked it or the sync was delayed
4. **No webhook was fired** — SePay never received the transaction from the bank
5. Even the SePay test webhook (which sends `id=0`) was being silently rejected by our server because the HMAC secret stored in Railway did not match the one configured in SePay

### Root causes identified
1. **HMAC secret mismatch** — The `SEPAY_WEBHOOK_SECRET` value in Railway (`whsec_hgcW3N...`) did not match the secret key configured in the SePay webhook Security tab, causing every incoming webhook to fail signature verification and be silently ignored.
2. **Bank sync keyword filter** — The "STICKER" keyword filter on the BIDV account may have blocked or delayed transaction synchronization from the bank to SePay.

---

## Test Attempt 2 — No authentication + No keyword filter (Working)

### Configuration
- **Security:** Not verified (no authentication)
- **Bank sync keyword filter:** Removed (all incoming transactions sync)
- **Railway env:** `SEPAY_WEBHOOK_SECRET` deleted

### What happened
1. SePay test webhook fired successfully → received by our server
2. Server logs confirmed:
   ```
   [sepay-webhook] Received POST — body length: 303 | HMAC: OFF (no secret)
   [sepay-webhook] X-SePay-Signature: null
   [sepay-webhook] Parsed body: {"id":0, "transferType":"in", "code":"SEPAYTEST", ...}
   [sepay-webhook] Test payload (id=0) — skipped
   ```
3. Webhook endpoint is reachable, payload is parsed correctly, prefix matching works

### Current status
- Webhook is live and receiving test events correctly
- Real payment confirmation is pending a live transfer test with the keyword filter removed
- BIDV transactions confirmed arriving at the bank — waiting for SePay to sync and fire the webhook

---

## Server-side Webhook Logic

Our endpoint at `POST /api/webhooks/sepay` implements the following:

1. **Deduplication** — rejects any `sepayId` already in `StickerPaymentLog` (safe for replays)
2. **Test payload detection** — `id=0` is SePay's test payload, it is logged and skipped
3. **Transfer direction filter** — only `transferType: "in"` is processed
4. **Payment code matching** — extracts the `code` field from the payload (SePay-parsed), falls back to regex scan of the `content` field if `code` is null. Only codes starting with `STICKER` are processed.
5. **Atomic transaction** — creates a `StickerPaymentLog` record and updates the `PlayerStickerPack.isPaid = true` in a single DB transaction
6. **Always returns HTTP 200** with `{"success": true}` — even on errors — to prevent SePay from retrying on our bugs

### Expected webhook payload (real payment)
```json
{
  "id": 92704,
  "gateway": "BIDV",
  "transactionDate": "2026-05-12 19:30:00",
  "accountNumber": "8848834790",
  "code": "STICKERCMP2KAEXY0",
  "content": "STICKERCMP2KAEXY0 chuyen tien",
  "transferType": "in",
  "transferAmount": 30000
}
```

---

## Recommendations for SePay Support

1. **Confirm BIDV sync delay** — transactions are confirmed arriving at BIDV but are not appearing in SePay's transaction list. Please confirm the expected sync interval for BIDV accounts and whether the "Synchronize transactions by keyword" filter affects sync timing or only webhook routing.

2. **Confirm `code` field extraction** — our payment codes follow the format `STICKER<10chars>` (e.g. `STICKERCMP2KAEXY0`). Please confirm that with the prefix `STICKER` configured under Company → General settings → Payment code structure, SePay will extract this code into the `code` field of the webhook payload even when the full memo is `STICKERCMP2KAEXY0 chuyen tien`.

3. **Future HMAC setup** — once the basic flow is confirmed working, we intend to re-enable HMAC-SHA256. When we do, please confirm the exact signing algorithm: our implementation uses `HMAC-SHA256("{timestamp}.{raw_body}")` with the signature sent as `X-SePay-Signature: sha256={hex_hash}` and timestamp in `X-SePay-Timestamp`, per the developer documentation.

---

## Environment

| Component | Detail |
|---|---|
| Server | Railway (Node.js / Next.js 16) |
| Region | Asia (Vietnam) |
| Production URL | `courtflow-production-0441.up.railway.app` |
| Webhook path | `/api/webhooks/sepay` |
| Payment prefix | `STICKER` |
| Polling interval (kiosk) | 3 seconds |

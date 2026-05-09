# CourtFlow — Sticker System Context Summary

## 1. Kiosk Frontend

**Public TV/CourtPay kiosk:**
- Route: `/tv-queue/[venueId]` → `src/app/(tv)/tv-queue/[venueId]/page.tsx`
- Renders `CourtPayKiosk` (full payment/check-in state machine) or `TvQueueScanner`
- Main kiosk component: `src/modules/courtpay/components/CourtPayKiosk.tsx`
- Supporting components in the same folder: `SubscriptionOffer`, `SuccessScreen`, `RegistrationForm`, `PhoneLookup`, `PaymentScreen`, `PackageCard`, `PackageForm`
- Kiosk mode gate (PIN, mode picker): `src/components/kiosk-mode-gate.tsx`

**Staff face-kiosk (tablet, not public):**
- `src/components/face-kiosk-tab.tsx` — face check-in flow, used from the staff dashboard
- `src/components/kiosk-confirmation-screen.tsx` — shared confirmation UI

**Backend kiosk API:** `src/app/api/kiosk/` — `cancel-payment`, `cash-payment`, `check-existing-face`, `checkin-payment`, `manual-resolve`, `phone-check-in`, `process-face`, `recent-checkins`, `register`, `session`, `staff-identify-face`

---

## 2. Player-Facing App

- **`/my-balance`** → `src/app/my-balance/page.tsx` — screens: `identify` → optional `pick-venue` → `balance`. Files: `IdentifyState.tsx`, `VenuePicker.tsx`, `BalanceScreen.tsx`, `BalanceTopBar.tsx`, `ThemeContext.tsx`, `types.ts`, `layout.tsx`
- **`/player`** → `src/app/(player)/player/` — queue/session experience (`home.tsx`, `queue-screen.tsx`, `in-game.tsx`, `profile.tsx`, `onboarding.tsx`)
- **`/shop`** → does **not exist** in this codebase

---

## 3. Generated Sticker Result Files

- **Disk path:** `{projectRoot}/uploads/players/sticker-results/{playerId}_result.png`
- **URL pattern:** `/uploads/players/sticker-results/{playerId}_result.png?t={timestamp}`
- **Served by:** `server.ts` mounts `express.static(..., "uploads")` on the `/uploads` prefix. In dev mode, if a file doesn't exist locally it proxies to `APP_URL` (production) as a fallback.

---

## 4. Split Sticker Pack Files

- **Disk path:** `{projectRoot}/uploads/players/sticker-packs/{playerId}/sticker_1.webp` … `sticker_4.webp`
- **URL pattern:** `/uploads/players/sticker-packs/{playerId}/sticker_N.webp?t={timestamp}`
- **Served by:** same `express.static` in `server.ts`
- **ZIP download:** `GET /api/admin/players/[playerId]/sticker-photos/download-pack` — streams a ZIP of the 4 files (auth via `Authorization: Bearer` or `?token=`, requires `superadmin` role)

---

## 5. Prisma Schema

```prisma
model PlayerStickerPhoto {
  id        String   @id @default(cuid())
  playerId  String   @map("player_id")
  imageUrl  String   @map("image_url")
  slotIndex Int      @map("slot_index")
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  player Player @relation(fields: [playerId], references: [id], onDelete: Cascade)

  @@map("player_sticker_photos")
}

model PlayerStickerResult {
  id                    String   @id @default(cuid())
  playerId              String   @unique @map("player_id")
  imageUrl              String   @map("image_url")
  prompt                String
  model                 String   @default("gpt-image-1")
  size                  String   @default("1024x1024")
  costUsd               Decimal  @default(0.04) @map("cost_usd") @db.Decimal(6, 4)
  generationTimeSeconds Decimal? @map("generation_time_seconds") @db.Decimal(6, 2)
  createdAt             DateTime @default(now()) @map("created_at")
  updatedAt             DateTime @updatedAt @map("updated_at")

  player      Player             @relation(fields: [playerId], references: [id], onDelete: Cascade)
  stickerPack PlayerStickerPack?

  @@map("player_sticker_results")
}

model PlayerStickerPack {
  id          String   @id @default(cuid())
  playerId    String   @unique @map("player_id")
  resultId    String   @unique @map("result_id")
  sticker1Url String?  @map("sticker_1_url")
  sticker2Url String?  @map("sticker_2_url")
  sticker3Url String?  @map("sticker_3_url")
  sticker4Url String?  @map("sticker_4_url")
  createdAt   DateTime @default(now()) @map("created_at")
  updatedAt   DateTime @updatedAt @map("updated_at")

  player Player              @relation(fields: [playerId], references: [id], onDelete: Cascade)
  result PlayerStickerResult @relation(fields: [resultId], references: [id], onDelete: Cascade)

  @@map("player_sticker_packs")
}
```

---

## 6. Sticker API Routes

All under `/api/admin/players/[playerId]/sticker-photos/`. All require a `superadmin` auth header, except `download-pack` which accepts a JWT Bearer token or `?token=` query param.

| Endpoint | Method | Input | Output |
|---|---|---|---|
| `.../sticker-photos` | POST | Multipart: `photo` file + `slotIndex` (2/3/4) | `{ id, imageUrl, slotIndex }` |
| `.../sticker-photos` | GET | — | Array of `{ id, imageUrl, slotIndex }` |
| `.../sticker-photos/[photoId]` | DELETE | — | `{ success: true }` |
| `.../sticker-photos/generate` | POST | JSON: `photo_id` (`"checkin"` or UUID), `prompt` (required), `model` (optional, default `gpt-image-1.5`) | `{ imageUrl, model, size, costUsd, generationTimeSeconds, createdAt }` |
| `.../sticker-photos/process` | POST | — (uses existing DB result) | `{ id, sticker1Url, sticker2Url, sticker3Url, sticker4Url }` |
| `.../sticker-photos/result` | GET | — | `{ id, imageUrl, prompt, model, size, costUsd, generationTimeSeconds, createdAt, pack? }` |
| `.../sticker-photos/result` | DELETE | — | Deletes result file + pack dir + DB rows → `{ success: true }` |
| `.../sticker-photos/download-pack` | GET | Auth via `?token=` or `Authorization: Bearer` | Binary ZIP (`application/zip`) of `sticker_1–4.webp` |

---

## 7. Generation Service

Sticker generation uses **WaveSpeed** (not OpenAI directly).

- **API key env var:** `WAVESPEED_API_KEY`
- **App public URL env var:** `APP_URL` (e.g. `https://courtflow-production-0441.up.railway.app`) — required so WaveSpeed can fetch the player's photo via HTTP
- **Model routing:** `openai/{selectedModel}/edit` (e.g. `openai/gpt-image-1.5/edit`)
- **Cost map (USD per image):**
  - `gpt-image-2`: $0.020
  - `gpt-image-1.5`: $0.008
  - `gpt-image-1-mini`: $0.004
  - `gpt-image-1`: $0.008

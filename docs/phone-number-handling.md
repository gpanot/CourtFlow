# Phone Number Handling in CourtFlow

How phone numbers are captured, stored, and looked up across **CourtPass (Web book)**, **CourtPay**, and the **database**.

> **TL;DR:** There is no single canonical phone format. Whitespace is stripped in some flows, but country code, `+`, and leading `0` are stored as entered. Lookup behavior is inconsistent between exact-match flows (CourtPass, CourtPay) and digits-only flows (staff lookup).

---

## Database tables

| Table | Column | Constraint | Purpose |
|---|---|---|---|
| `players` | `phone` | globally `@unique` | CourtPass core player registry |
| `check_in_players` | `phone` | `@@unique([phone, venueId])` | CourtPay per-venue check-in roster |
| `otp_codes` | `phone` | — | OTP |
| `face_attempts` | `phone_number` | — | Kiosk phone fallback audit |
| `staff` | `phone` | `@unique` | Staff login |

Both `players.phone` and `check_in_players.phone` are plain `String` columns — no DB-level format constraint.

---

## CourtPass / Web book

### Input

- Free-text `type="tel"` field on onboarding (`src/app/(book)/book/onboarding/page.tsx`)
- Placeholder hints local VN style: `0912345678` (`src/i18n/locales/player/en.json`)

### Normalization on save

Most CourtPass APIs strip **spaces only**:

```ts
const normalizedPhone = phone.replace(/\s+/g, "");
```

Used in:

- `src/app/api/public/account/onboarding/route.ts`
- `src/app/api/public/account/route.ts` (PATCH)
- `src/lib/player-signup.ts` (`createPhonePlayer`)
- `src/app/api/admin/courtpass-players/[playerId]/edit/route.ts`

### Validation

- Minimum length: **8 characters** (after space removal)
- Uniqueness: **exact string match** after space strip (`src/app/api/public/account/check-phone/route.ts`)

### What is NOT normalized

- No E.164 format
- No country-code prefix enforcement (`+84`, etc.)
- `+`, dashes, parentheses, leading `0` are kept as entered

### Placeholder phones (synthetic)

Used until a real phone is provided, or for non-phone identities:

| Pattern | When |
|---|---|
| `email_{email}` | Email/password signup (`src/lib/player-signup.ts`) |
| `oauth_{provider}_{providerAccountId}` | Google/Apple OAuth (`src/lib/player-oauth.ts`) |
| `deleted_{playerId}` | Account deletion (`src/app/api/public/account/route.ts`) |

These are excluded from “phone taken” checks and onboarding-complete logic (prefix checks for `oauth_`, `email_`, `deleted_`).

---

## CourtPay

### Input

- Numeric keypad (digits `0–9` only) in `PhoneLookup.tsx` and `CourtPayKiosk.tsx`
- Min 8 chars, max 15 chars to search/register

### Normalization on save

```ts
const phoneNorm = typeof phone === "string" ? phone.trim() : "";
const internalPhone = phoneNorm || `__cp_${randomUUID().replace(/-/g, "")}`;
```

(`src/app/api/courtpay/register/route.ts`)

- **`.trim()` only** — no digit stripping on write
- Stored as typed in `check_in_players.phone` and usually mirrored to `players.phone`

### Lookup

**Exact match** on the trimmed string — not digits-only:

```ts
// src/modules/courtpay/lib/check-in.ts → identifyPlayer()
prisma.checkInPlayer.findUnique({
  where: { phone_venueId: { phone, venueId } },
});
```

So `0912345678` and `84912345678` are **different** CourtPay records.

### Synthetic phones (no real number)

| Pattern | When |
|---|---|
| `__cp_{uuid}` | CourtPay registration when phone is omitted |
| `{timestamp}+` | Walk-in via `register-walk-in` (e.g. `1714369145123+`) |
| `walkin:{uuid}` | Legacy queue walk-ins (`staff-add-walk-in`) |

Walk-in detection helpers live in `src/lib/walk-in-phone.ts`.

---

## Partial standardization (lookup only)

Some flows match by **digits-only equality** at query time, without rewriting stored values.

### `findPlayerByPhoneDigits`

`src/lib/find-player-by-phone-digits.ts`:

```ts
const digitsOnly = rawPhone.replace(/\D/g, "");
// SQL: regexp_replace(phone, '\D', '', 'g') = ${digitsOnly}
```

Excludes synthetic walk-in phones (`walkin:`, trailing `+`).

### Staff player lookup

`src/app/api/staff/player-lookup/route.ts` — same digits-only SQL against both `check_in_players` and `players`.

### Walk-in phone check (queue)

`src/app/api/queue/check-walk-in-phone/route.ts` — digits-only match on `players`.

**Important:** This forgiving lookup is **not** used by CourtPass onboarding checks or CourtPay kiosk identify.

---

## Cross-system linking

`ensureCourtPayCheckInPlayerSkillSynced` (`src/modules/courtpay/lib/check-in.ts`) copies skill level from `players` to `check_in_players` when:

```ts
prisma.player.findUnique({ where: { phone: cip.phone } })
```

This is an **exact** phone match. Format mismatch between CourtPass and CourtPay records breaks sync.

---

## Flow comparison

```
User input examples:
  0912345678
  +84912345678
  84912345678

CourtPass save:     stored as entered (spaces stripped)
CourtPay save:      stored as entered (.trim())
CourtPay lookup:    exact match only
Staff lookup:       digits-only — all three would match
CourtPass check-phone: exact match only (spaces stripped)
```

| Aspect | CourtPass / Web book | CourtPay | DB |
|---|---|---|---|
| Format enforced | No | No (digits-only UI) | No |
| Normalization on write | Strip spaces | `.trim()` | Raw string |
| Country code / E.164 | No | No | No |
| Primary lookup | Exact (spaces stripped) | Exact | — |
| Forgiving lookup | Staff/kiosk only | No | `regexp_replace` in some queries |

---

## Practical implications

1. **Duplicate records** — The same person can register as `0912345678` in CourtPay and `+84912345678` in CourtPass; both can exist as separate `players` rows (`phone` is `@unique` on the literal string).
2. **CourtPay kiosk miss** — A player who registered in CourtPass with `+84…` may not be found on the CourtPay keypad if they type `09…`.
3. **CourtPass ↔ CourtPay sync** — Skill/profile sync between `players` and `check_in_players` requires identical phone strings.
4. **VN-local convention implied** — Placeholder `0912345678` suggests Vietnamese local format, but nothing enforces it.

---

## Key source files

| Area | File |
|---|---|
| CourtPass onboarding UI | `src/app/(book)/book/onboarding/page.tsx` |
| CourtPass onboarding API | `src/app/api/public/account/onboarding/route.ts` |
| CourtPass phone uniqueness check | `src/app/api/public/account/check-phone/route.ts` |
| CourtPass signup | `src/lib/player-signup.ts` |
| CourtPay register | `src/app/api/courtpay/register/route.ts` |
| CourtPay identify | `src/app/api/courtpay/identify/route.ts` |
| CourtPay check-in lib | `src/modules/courtpay/lib/check-in.ts` |
| CourtPay kiosk UI | `src/modules/courtpay/components/CourtPayKiosk.tsx` |
| Digits-only lookup helper | `src/lib/find-player-by-phone-digits.ts` |
| Staff lookup | `src/app/api/staff/player-lookup/route.ts` |
| Walk-in synthetic phones | `src/lib/walk-in-phone.ts` |
| Prisma schema | `prisma/schema.prisma` (`Player`, `CheckInPlayer`) |

---

## Possible future improvement

Introduce a shared `normalizePhone()` used on **every write and lookup**:

- Strip all non-digits
- Optionally normalize VN numbers (`0xxxxxxxxx` → `84xxxxxxxxx`)
- Or adopt E.164 (`+84…`) as the canonical stored format

Today this utility does not exist; normalization is ad hoc per endpoint.

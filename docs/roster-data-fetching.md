# Roster Data Fetching

This document describes how CourtFlow fetches, stores, and displays roster data from the Reclub platform.

## Overview

CourtFlow integrates with [Reclub](https://reclub.co) — an external sports club management platform — to pull event rosters (lists of confirmed players) into a live session. This allows staff to see which Reclub-booked players have checked in / paid and which are still expected.

The flow has three phases:

1. **Fetch events** — list today's Reclub events for the staff's configured club
2. **Fetch roster** — scrape the confirmed-player list from a specific event
3. **Persist & display** — save the roster on the session record and render it in the UI

---

## Architecture Diagram

```
┌──────────────────────┐      ┌──────────────────────┐
│   Reclub External    │      │     PostgreSQL        │
│   (reclub.co API +   │◄────►│  session.reclubRoster │
│    HTML scraping)     │      │  player.reclubUserId  │
└──────────┬───────────┘      └──────────▲────────────┘
           │                             │
           │  HTTP                 Prisma│ORM
           ▼                             │
┌──────────────────────┐      ┌──────────┴────────────┐
│  src/lib/reclub.ts   │      │  Next.js API Routes   │
│  (server-side lib)   │─────►│  /api/reclub/*        │
│                      │      │  /api/sessions/[id]/* │
└──────────────────────┘      └──────────▲────────────┘
                                         │
                              HTTP (JSON) │
                     ┌───────────────────┬┘
                     │                   │
              ┌──────┴──────┐     ┌──────┴──────┐
              │  PWA Client │     │  RN Mobile  │
              │ (Next.js)   │     │  (Expo)     │
              └─────────────┘     └─────────────┘
```

---

## Data Sources

### Reclub External API

| Endpoint | Purpose |
|---|---|
| `GET /groups/{groupId}/activities?types=MEETS&...` | List today's events for a club |
| `GET /players/userIds?userIds=...&scopes=BASIC_PROFILE` | Batch-fetch player profiles (name, avatar, gender) |
| `GET /m/{referenceCode}` (HTML) | Scrape event page for the confirmed-participant list |

Base URLs:
- **API**: `https://api.reclub.co`
- **Web**: `https://reclub.co`

### Internal Database (Prisma)

| Model | Key Fields | Purpose |
|---|---|---|
| `Session` | `reclubReferenceCode`, `reclubEventName`, `reclubRoster` (JSON) | Stores the fetched roster on the session |
| `Player` | `reclubUserId` (nullable int) | Links a CourtFlow player to a Reclub user ID |
| `Staff` | `reclubGroupId` (nullable int) | The staff member's default Reclub club |

---

## Server-Side Library: `src/lib/reclub.ts`

This is the core module that talks to Reclub. It has no database dependencies and is purely an HTTP client.

### `fetchReclubEvents(groupId: number): Promise<ReclubEvent[]>`

Fetches today's events for a given Reclub club.

- Computes today's date boundaries in Vietnam timezone (UTC+7)
- Calls `GET /groups/{groupId}/activities?types=MEETS&min_start_datetime=...&max_start_datetime=...`
- Returns an array of `{ referenceCode, name, startDatetime, confirmedCount }`

### `fetchReclubRoster(referenceCode: string): Promise<{ eventName, players[] }>`

Fetches the full participant list for a specific event. This is a two-step process:

1. **HTML Scraping** — fetches `https://reclub.co/m/{referenceCode}` and extracts the `__NUXT_DATA__` script payload. Parses confirmed participants (status === 1), including:
   - Real users (have a `userId`)
   - Synthetic/guest players (added by a friend, have `externalReference` with name)
   - Sort order: `lastStatusUpdatedAt` ASC (first confirmed → first in list)

2. **Profile Enrichment** — batches the real user IDs (50 at a time, 300ms delay between batches) to `GET /players/userIds?userIds=...&scopes=BASIC_PROFILE` to get each player's name, avatar URL, and gender.

Returns a `ReclubPlayer[]`:

```ts
interface ReclubPlayer {
  reclubUserId: number | null;  // null for guests
  name: string;
  avatarUrl: string;
  isDefaultAvatar: boolean;     // true if avatar URL contains default-avatar host
  gender: string;
  isAddedByFriend?: boolean;    // true for +1 guests
}
```

### Rate Limiting

The `reclubApiFetch` helper retries once with a 2-second delay on 429 responses.

---

## API Routes

### 1. `GET /api/reclub/events?groupId={id}`

**File**: `src/app/api/reclub/events/route.ts`

Lists today's Reclub events for a club. Calls `fetchReclubEvents()`.

**Response**:
```json
{
  "events": [
    {
      "referenceCode": "abc123",
      "name": "Morning Pickleball",
      "startDatetime": 1716350400,
      "confirmedCount": 12
    }
  ]
}
```

### 2. `POST /api/reclub/fetch-roster`

**File**: `src/app/api/reclub/fetch-roster/route.ts`

Fetches the roster for a single event. Requires staff auth.

**Request**: `{ "referenceCode": "abc123" }`

**Response**:
```json
{
  "referenceCode": "abc123",
  "eventName": "Morning Pickleball",
  "players": [
    {
      "reclubUserId": 12345,
      "name": "Player Name",
      "avatarUrl": "https://...",
      "isDefaultAvatar": false,
      "gender": "male"
    }
  ]
}
```

### 3. `PATCH /api/sessions/{sessionId}/reclub-roster`

**File**: `src/app/api/sessions/[sessionId]/reclub-roster/route.ts`

Persists fetched roster data onto the session record. Requires staff auth.

**Request**:
```json
{
  "rosters": [
    {
      "referenceCode": "abc123",
      "eventName": "Morning Pickleball",
      "players": [...]
    }
  ]
}
```

Stores the entire `rosters` array as JSON in `session.reclubRoster`. Also sets `session.reclubReferenceCode` and `session.reclubEventName` from the first roster entry (for backward compatibility with the old single-roster format).

### 4. `POST /api/reclub/link-player`

**File**: `src/app/api/reclub/link-player/route.ts`

Links a CourtFlow player to a Reclub user ID by setting `player.reclubUserId`. This allows future roster fetches to automatically match paid players to their Reclub profiles.

**Request**: `{ "courtpayPlayerId": "...", "reclubUserId": 12345 }`

### 5. `DELETE /api/reclub/link-player`

Unlinks a player by setting `player.reclubUserId = null`.

**Request**: `{ "courtpayPlayerId": "..." }`

### 6. `GET /api/auth/staff-me`

Returns the logged-in staff member's profile, including `reclubGroupId` — the default Reclub club they're associated with. This determines which club's events to fetch.

### 7. `GET /api/courts/state?venueId={id}`

Returns the current session state including `reclubRoster`, `reclubReferenceCode`, and `reclubEventName`. This is how clients get the *already-stored* roster on page load.

### 8. `GET /api/sessions/{sessionId}/payments`

Returns all payments for a session, including each payment's `player.reclubUserId`. This data is used client-side to cross-reference roster players with paid players. Also returns `reclubSnapshot` for closed sessions.

### 9. `POST /api/sessions/{sessionId}/close`

**File**: `src/app/api/sessions/[sessionId]/close/route.ts`

Closes the session and builds the `reclubSnapshot` — a frozen record of which roster players were matched to payments and which paid players were walk-ins. See the "Session Close: Roster Snapshot" section below for details.

### 10. `PATCH /api/sessions/{sessionId}/reclub-snapshot`

**File**: `src/app/api/sessions/[sessionId]/reclub-snapshot/route.ts`

Post-close editing: links a walk-in to an unmatched roster member in the snapshot. Only the latest closed session can be edited.

### 11. `GET /api/staff/venue-payment-settings?venueId={id}`

**File**: `src/app/api/staff/venue-payment-settings/route.ts`

Returns venue payment config including `reclubRoster` from the open session. Used by kiosk check-in for name autocomplete.

---

## Client-Side Data Flow

Both the PWA and RN mobile app follow the same logical flow:

### Step 1: Load Existing Roster (on mount)

```
GET /api/courts/state?venueId=...
  → session.reclubRoster (JSON, may be null)
  → session.reclubReferenceCode
  → session.reclubEventName
```

The `reclubRoster` field supports two formats (for backward compat):
- **New format**: `StoredRosterEntry[]` — array of `{ referenceCode, eventName, players[] }`
- **Old format**: `ReclubPlayer[]` — flat array, wrapped using legacy `reclubReferenceCode`/`reclubEventName`

### Step 2: Get Staff's Reclub Club ID

```
GET /api/auth/staff-me
  → reclubGroupId (number | null)
```

This is also re-fetched on visibility change (PWA) or screen focus (RN).

### Step 3: Fetch Events (user taps "Fetch Roster" button)

```
GET /api/reclub/events?groupId={reclubGroupId}
  → events[]
```

- If **0 events**: show "no events today" message
- If **1 event**: auto-fetch its roster (skip event picker)
- If **2+ events**: show a multi-select picker for the user to choose

### Step 4: Fetch & Save Rosters (for each selected event)

```
POST /api/reclub/fetch-roster  (one per selected event, in parallel)
  → { referenceCode, eventName, players[] }

PATCH /api/sessions/{sessionId}/reclub-roster
  → persists all rosters to the session
```

### Step 5: Load Paid Players (for matching)

```
GET /api/sessions/{sessionId}/payments
  → payments[] with player.reclubUserId
```

This data is cross-referenced with roster players to determine who has paid:
- A roster player is "paid" if their `reclubUserId` matches any payment's `player.reclubUserId`
- Payments without a roster match are displayed as "walk-ins"

### Step 6: Refresh a Single Roster

Users can tap the refresh button on any roster section:

```
POST /api/reclub/fetch-roster  (for that roster's referenceCode)
PATCH /api/sessions/{sessionId}/reclub-roster  (save updated roster set)
```

---

## Real-Time Updates

### PWA (`SessionCourtPay.tsx`)

Uses WebSocket events via `useSocket()`:

| Event | Action |
|---|---|
| `session:updated` | Re-fetch session state + history |
| `payment:confirmed` | Re-fetch paid players list |

Also re-fetches `reclubGroupId` on browser `visibilitychange` (tab becomes visible).

### RN Mobile (`SessionTabScreen.tsx` + `ReclubRosterSection.tsx`)

- Uses `useFocusEffect` to re-fetch `reclubGroupId` when the screen gains focus
- Paid players are refreshed via `onPlayerLinked` callback after link/unlink operations

---

## Key File Reference

| Layer | File | Purpose |
|---|---|---|
| **Library** | `src/lib/reclub.ts` | Reclub API client (events, roster scraping) |
| **API** | `src/app/api/reclub/events/route.ts` | List today's events |
| **API** | `src/app/api/reclub/fetch-roster/route.ts` | Fetch roster for one event |
| **API** | `src/app/api/sessions/[sessionId]/reclub-roster/route.ts` | Save roster to session |
| **API** | `src/app/api/reclub/link-player/route.ts` | Link/unlink player ↔ Reclub ID |
| **API** | `src/app/api/sessions/[sessionId]/payments/route.ts` | Session payments (includes `reclubUserId`) |
| **API** | `src/app/api/sessions/[sessionId]/close/route.ts` | Builds `reclubSnapshot` on session close |
| **API** | `src/app/api/sessions/[sessionId]/reclub-snapshot/route.ts` | Post-close walk-in ↔ roster linking |
| **API** | `src/app/api/courts/state/route.ts` | Session state (includes stored roster) |
| **API** | `src/app/api/staff/venue-payment-settings/route.ts` | Kiosk: roster for name autocomplete |
| **API** | `src/app/api/auth/staff-me/route.ts` | Staff profile (includes `reclubGroupId`) |
| **PWA** | `src/components/session/SessionCourtPay.tsx` | Main session page with roster UI |
| **PWA** | `src/components/session/StaffSessionPaymentsDetail.tsx` | Closed session snapshot UI |
| **PWA** | `src/components/checkin/CheckInCourtPay.tsx` | Kiosk: roster autocomplete |
| **RN** | `mobile/src/screens/staff/SessionTabScreen.tsx` | Mobile session tab (passes data to roster component) |
| **RN** | `mobile/src/components/reclub/ReclubRosterSection.tsx` | Mobile roster UI component |
| **RN** | `mobile/src/screens/staff/SessionDetailScreen.tsx` | Mobile closed session snapshot |
| **RN** | `mobile/src/screens/tablet/CourtPayCheckInScreen.tsx` | Tablet kiosk: roster autocomplete |
| **Schema** | `prisma/schema.prisma` | `Session.reclubRoster`, `Player.reclubUserId`, `Staff.reclubGroupId` |

---

## Session Close: Roster Snapshot

When a session is closed (`POST /api/sessions/{sessionId}/close`), the server builds a **frozen snapshot** of the roster state and saves it to `session.reclubSnapshot`. This allows staff to review roster reconciliation after the fact.

### Snapshot Build Process

1. Read the stored `reclubRoster` from the session (handles both new multi-event and legacy formats)
2. Fetch all confirmed payments for the session
3. For each payment, resolve `player.reclubUserId` (directly or via phone-linked player lookup)
4. Match each roster player to a payment by `reclubUserId`
5. Identify walk-ins: paid players whose `reclubUserId` is not on any roster
6. Compute aggregate stats: `totalExpected`, `totalMatched`, `totalUnmatched`, `totalWalkIns`

### Snapshot Data Shape

```ts
interface ReclubSnapshot {
  events: EventSnapshot[];     // per-event breakdown
  eventName: string;           // joined event names
  referenceCode: string;       // first event's code
  fetchedAt: string;           // session date
  closedAt: string;            // close timestamp
  totalExpected: number;       // total roster members
  totalMatched: number;        // roster members who paid
  totalUnmatched: number;      // roster members who didn't pay
  totalWalkIns: number;        // paid people not on roster (sum of partyCount)
  players: SnapshotPlayer[];   // all roster members + walk-ins merged
}

interface SnapshotPlayer {
  reclubUserId: number;
  reclubName: string;          // empty string = walk-in
  avatarUrl: string;
  courtpayPlayerId: string | null;
  courtpayName: string | null;
  paid: boolean;
  amount: number | null;
  partyCount?: number | null;
  checkinTime: string | null;
  facePhotoUrl?: string | null;
}
```

### Post-Close Snapshot Editing

`PATCH /api/sessions/{sessionId}/reclub-snapshot` allows staff to link walk-in payments to unmatched roster members after the session has closed. Only the **latest** closed session for a venue can be edited.

**Request**: `{ "walkInIndex": 0, "reclubUserId": 12345 }`

This moves the walk-in's payment data onto the matching roster player and removes the walk-in entry, then recomputes stats.

---

## Kiosk Autocomplete (Secondary Roster Consumer)

The roster data is also used by the CourtPay check-in kiosk for **name autocomplete** during player registration.

### How It Works

1. The kiosk fetches `GET /api/staff/venue-payment-settings?venueId=...`
2. This route returns `reclubRoster` from the current open session (if any)
3. The client flattens multi-event rosters into a single player list
4. When a user types a name (2+ characters), the kiosk filters roster players by substring match and shows the top results
5. If the user selects a roster player, their `reclubUserId` is attached to the registration request (`POST /api/courtpay/register`)

### Relevant Files

| Surface | File |
|---|---|
| PWA | `src/components/checkin/CheckInCourtPay.tsx` |
| PWA | `src/modules/courtpay/components/CourtPayKiosk.tsx` |
| RN | `mobile/src/screens/tablet/CourtPayCheckInScreen.tsx` |
| API | `src/app/api/staff/venue-payment-settings/route.ts` |

---

## Supported Reclub Clubs

Hardcoded in `src/lib/reclub.ts`:

| Club | Group ID |
|---|---|
| NEXT11 Pickleball Club | 298257 |
| Elite Sport Pickleball @Pacific | 22476 |
| Big Balls Pickle Club | 11186 |
| Aspire Drill Club | 14164 |
| Ace Squad Pickleball | 30158 |
| Top One | 104121 |
| The MM Pickleball Club | 326472 |

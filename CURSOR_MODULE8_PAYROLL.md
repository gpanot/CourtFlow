# CURSOR BRIEFING — CourtFlow MODULE 8: Staff Payroll Management
**Version:** 1.0 | **Date:** March 2026  
**Scope:** New feature — Admin Panel only  
**Depends on:** Existing Session model, existing StaffMember model, existing Admin Panel structure

---

## 0. CONTEXT — READ BEFORE WRITING ANY CODE

CourtFlow is a multi-venue pickleball court management platform. The existing stack is:
- **Frontend:** Next.js 16 (App Router), React 19, Tailwind CSS 4
- **Backend:** Express 5 + Next.js API Routes
- **Database:** PostgreSQL + Prisma ORM
- **Auth:** JWT — helpers `requireAuth()`, `requireStaff()`, `requireSuperAdmin()`
- **Real-time:** Socket.io (not needed for this module)

### Design System tokens (use these exactly — no custom colors):
```
Background:     #0a0a0a  (neutral-950)
Surface 1:      #171717  (neutral-900)
Surface 2:      #262626  (neutral-800)
Border:         #404040  (neutral-700)
Text primary:   #ffffff
Text secondary: #a3a3a3  (neutral-400)
Admin accent:   #a855f7  (purple-500)
Active/Success: #16a34a  (green-600)
Warning:        #f59e0b  (amber-500)
Error:          #b91c1c  (red-700)
```
Icons: Lucide (outline, 16–24px)  
Corner radius: 12px cards, 16px modals  
Touch targets: 48×48px minimum

### Existing DB models relevant to this module:
```
Session       → id, venueId, date, status, openedAt (DateTime), closedAt (DateTime?), maxPlayers, staffId (FK → StaffMember)
StaffMember   → id, name, phone, email, role, passwordHash, venueId
Venue         → id, name, location
AuditLog      → id, venueId, staffId, action, targetId, reason
```

**IMPORTANT:** Verify that `Session.staffId` is populated on session open (the staff member who opened the session). If this field doesn't exist yet, add it to the Prisma schema and update the session-open endpoint to write it. Do NOT proceed with the payroll feature until this FK is confirmed.

---

## 1. BUSINESS LOGIC

### How staff hours are calculated

Staff are paid per session they run. No check-in/check-out system — the session's `openedAt` and `closedAt` timestamps define the work period.

**Rounding rule — always round UP to the nearest 30 minutes:**
```
rawMinutes = closedAt - openedAt  (in minutes)
roundedHours = Math.ceil(rawMinutes / 30) / 2
```

Examples:
- 3h 00m → 3.0h (exact, no change)
- 3h 01m → 3.5h (rounded up)
- 3h 30m → 3.5h (exact)
- 3h 31m → 4.0h (rounded up)
- 1h 10m → 1.5h (rounded up)

**Open sessions** (no `closedAt`) are EXCLUDED from payroll calculations entirely. Show a warning in the UI when an open session exists in the selected period.

**Week definition:** Monday 00:00:00 → Sunday 23:59:59 (ISO week). `weekStart` param is always a Monday date string `YYYY-MM-DD`.

**Multi-venue staff:** A staff member may work across multiple venues in a week. Their hours are aggregated across all venues for the weekly payment record (one payment to the person). In the detail view, break down by venue. In the overview, show all venues they worked.

### Payment tracking

Payment happens **outside the system** (bank transfer, cash, etc). The system only tracks the paid/unpaid status of each weekly settlement. No rates, no amounts — hours only.

A `StaffPayment` record represents one staff member's weekly settlement. It is created lazily (on first admin view of that week for that staff member). Marking as paid records who did it and when, for audit purposes.

---

## 2. DATABASE — PRISMA SCHEMA CHANGES

### 2.1 Verify existing field (may already exist)
Check `Session` model for `staffId`. If missing, add:
```prisma
model Session {
  // ... existing fields ...
  staffId    String?
  staff      StaffMember? @relation(fields: [staffId], references: [id])
}
```
Update the session open endpoint (`POST /api/sessions/open` or equivalent) to write `staffId` from the authenticated staff JWT.

### 2.2 New table — StaffPayment
```prisma
model StaffPayment {
  id           String      @id @default(cuid())
  staffId      String
  staff        StaffMember @relation(fields: [staffId], references: [id])
  weekStart    DateTime    // Always a Monday at 00:00:00 UTC
  totalHours   Decimal     @db.Decimal(6, 1)
  status       PaymentStatus @default(UNPAID)
  paidAt       DateTime?
  paidById     String?     // Admin who marked it paid
  paidBy       StaffMember? @relation("PaidByStaff", fields: [paidById], references: [id])
  note         String?
  createdAt    DateTime    @default(now())
  updatedAt    DateTime    @updatedAt

  @@unique([staffId, weekStart])
  @@index([weekStart])
  @@index([staffId])
}

enum PaymentStatus {
  UNPAID
  PAID
}
```

Run `npx prisma migrate dev --name add_staff_payroll` after adding the schema.

---

## 3. HELPER UTILITIES

Create `/lib/payroll.ts` (or `.js` if the project is JS):

```typescript
// /lib/payroll.ts

/**
 * Round raw minutes UP to the nearest 30-minute block, return as decimal hours.
 * Examples: 200min → 3.5h | 225min → 4.0h | 180min → 3.0h | 181min → 3.5h
 */
export function roundHoursUp(rawMinutes: number): number {
  return Math.ceil(rawMinutes / 30) / 2;
}

/**
 * Calculate raw duration in minutes between two dates.
 */
export function durationMinutes(openedAt: Date, closedAt: Date): number {
  return Math.floor((closedAt.getTime() - openedAt.getTime()) / 60000);
}

/**
 * Given a date, return the Monday of that ISO week at 00:00:00 UTC.
 */
export function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getUTCDay(); // 0=Sun, 1=Mon...
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

/**
 * Return Monday and Sunday of the week containing the given weekStart date.
 */
export function getWeekRange(weekStart: Date): { start: Date; end: Date } {
  const start = new Date(weekStart);
  const end = new Date(weekStart);
  end.setUTCDate(end.getUTCDate() + 6);
  end.setUTCHours(23, 59, 59, 999);
  return { start, end };
}

/**
 * Format decimal hours for display: 3.5 → "3.5 h" | 3.0 → "3.0 h"
 */
export function formatHours(hours: number): string {
  return `${hours.toFixed(1)} h`;
}

/**
 * Format raw minutes for display: 200 → "3h 20m" | 180 → "3h 00m"
 */
export function formatRawDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h ${String(m).padStart(2, '0')}m`;
}
```

---

## 4. API ENDPOINTS

All endpoints are protected with `requireSuperAdmin()` middleware. All return JSON.

### 4.1 GET `/api/admin/payroll`
**Payroll overview — all staff, all venues, one week.**

Query params:
- `weekStart` (required): `YYYY-MM-DD` — must be a Monday

Logic:
1. Parse and validate `weekStart` — if not a Monday, return 400.
2. Get `weekEnd` = weekStart + 6 days 23:59:59.
3. Fetch all StaffMembers across all venues.
4. For each staff member, fetch all `Session` records where:
   - `staffId = staff.id`
   - `openedAt >= weekStart`
   - `openedAt <= weekEnd`
5. Separate closed sessions (has `closedAt`) from open sessions.
6. Calculate `totalHours` = sum of `roundHoursUp(durationMinutes(openedAt, closedAt))` for closed sessions only.
7. Find or create `StaffPayment` record for `(staffId, weekStart)` — lazy creation.
   - If creating: set `totalHours` from calculation above, status = UNPAID.
   - If existing: update `totalHours` (recalculate in case sessions changed).
8. Return array sorted by status (UNPAID first), then by staff name.

Response shape:
```json
{
  "weekStart": "2026-03-09",
  "weekEnd": "2026-03-15",
  "summary": {
    "totalStaff": 7,
    "totalHours": 94.5,
    "unpaidCount": 4,
    "paidCount": 3
  },
  "staff": [
    {
      "paymentId": "cm...",
      "staffId": "cm...",
      "name": "Marcus Chen",
      "phone": "+1 555 0101",
      "venues": ["Downtown PB"],
      "closedSessionCount": 4,
      "openSessionCount": 1,
      "totalHours": 16.0,
      "status": "UNPAID",
      "paidAt": null,
      "paidByName": null,
      "note": null
    }
  ]
}
```

---

### 4.2 GET `/api/admin/staff/:staffId/hours`
**Single staff, single week — session breakdown.**

Query params:
- `weekStart` (required): `YYYY-MM-DD`

Logic:
1. Fetch staff member by `staffId`.
2. Fetch all sessions for that staff in the week range.
3. For each closed session, calculate raw minutes and rounded hours.
4. Find or create the `StaffPayment` record for this staff/week.
5. Return full session list with per-session calculations.

Response shape:
```json
{
  "staff": { "id": "...", "name": "Marcus Chen", "phone": "+1 555 0101" },
  "weekStart": "2026-03-09",
  "weekEnd": "2026-03-15",
  "payment": {
    "paymentId": "cm...",
    "status": "UNPAID",
    "totalHours": 16.0,
    "paidAt": null,
    "paidByName": null,
    "note": null
  },
  "sessions": [
    {
      "sessionId": "cm...",
      "date": "2026-03-09",
      "dayLabel": "Mon Mar 9",
      "venueName": "Downtown PB",
      "openedAt": "09:00",
      "closedAt": "12:20",
      "rawMinutes": 200,
      "rawDuration": "3h 20m",
      "roundedHours": 3.5,
      "isOpen": false
    }
  ],
  "openSessions": [
    {
      "sessionId": "cm...",
      "date": "2026-03-15",
      "dayLabel": "Sun Mar 15",
      "venueName": "Downtown PB",
      "openedAt": "10:00"
    }
  ],
  "totalRoundedHours": 16.0
}
```

---

### 4.3 GET `/api/admin/staff/:staffId/hours/cumulative`
**Multi-week summary for one staff member.**

Query params:
- `from` (required): `YYYY-MM-DD` — start Monday
- `to` (required): `YYYY-MM-DD` — end Monday (inclusive)
- Maximum range: 26 weeks. Return 400 if exceeded.

Logic:
1. Generate array of all week start Mondays from `from` to `to`.
2. For each week: fetch sessions, calculate hours, find or create StaffPayment.
3. Only return weeks where the staff had at least one session (skip empty weeks — no ghost records).
4. Return sorted chronologically (oldest first).

Response shape:
```json
{
  "staff": { "id": "...", "name": "Marcus Chen", "phone": "+1 555 0101" },
  "from": "2026-02-23",
  "to": "2026-03-15",
  "weeks": [
    {
      "weekStart": "2026-02-23",
      "weekEnd": "2026-03-01",
      "weekLabel": "Feb 23 – Mar 1",
      "paymentId": "cm...",
      "totalHours": 18.5,
      "sessionCount": 5,
      "status": "PAID",
      "paidAt": "2026-03-03T14:22:00Z",
      "paidByName": "Admin"
    },
    {
      "weekStart": "2026-03-02",
      "weekEnd": "2026-03-08",
      "weekLabel": "Mar 2 – Mar 8",
      "paymentId": "cm...",
      "totalHours": 21.0,
      "sessionCount": 6,
      "status": "PAID",
      "paidAt": "2026-03-10T09:15:00Z",
      "paidByName": "Admin"
    },
    {
      "weekStart": "2026-03-09",
      "weekEnd": "2026-03-15",
      "weekLabel": "Mar 9 – Mar 15",
      "paymentId": "cm...",
      "totalHours": 16.0,
      "sessionCount": 4,
      "status": "UNPAID",
      "paidAt": null,
      "paidByName": null
    }
  ],
  "totals": {
    "totalHours": 55.5,
    "unpaidHours": 16.0,
    "paidHours": 39.5,
    "unpaidWeeks": 1,
    "paidWeeks": 2
  }
}
```

---

### 4.4 PATCH `/api/admin/payroll/:paymentId/status`
**Mark a weekly settlement as paid or unpaid.**

Request body:
```json
{
  "status": "PAID",     // or "UNPAID"
  "note": "Bank transfer 14 Mar"  // optional, max 200 chars
}
```

Logic:
1. Find `StaffPayment` by `paymentId`.
2. If status = PAID: set `paidAt = now()`, `paidById = req.user.id`.
3. If status = UNPAID (undo): set `paidAt = null`, `paidById = null`.
4. Update `note` if provided (null if omitted and no existing note).
5. Write to AuditLog: `action = "PAYROLL_MARKED_PAID" | "PAYROLL_MARKED_UNPAID"`, `targetId = paymentId`.
6. Return updated payment record.

Response shape:
```json
{
  "paymentId": "cm...",
  "status": "PAID",
  "paidAt": "2026-03-16T11:30:00Z",
  "paidByName": "Super Admin",
  "note": "Bank transfer 14 Mar"
}
```

---

### 4.5 GET `/api/admin/payroll/export`
**Export CSV — all staff, one week.**

Query params:
- `weekStart` (required): `YYYY-MM-DD`

Logic: Same as `/api/admin/payroll` but return as CSV file download.

Response headers:
```
Content-Type: text/csv
Content-Disposition: attachment; filename="payroll-week-YYYY-MM-DD.csv"
```

CSV format:
```csv
Week,Staff Name,Phone,Venue(s),Sessions,Total Hours,Status,Paid On,Note
Mar 9–15 2026,Marcus Chen,+1 555 0101,Downtown PB,4,16.0,Unpaid,,
Mar 9–15 2026,Sarah Li,+1 555 0102,Eastside / North,6,22.5,Unpaid,,
Mar 9–15 2026,Tom Reyes,+1 555 0103,Eastside,5,18.0,Paid,Mar 11 2026,Bank transfer
TOTAL,,,,21,94.5,,
```

---

### 4.6 GET `/api/admin/staff/:staffId/hours/export`
**Export CSV — one staff, date range.**

Query params:
- `from` (required): `YYYY-MM-DD`
- `to` (required): `YYYY-MM-DD`

Two sections in the CSV — weekly summary first, then session detail:
```csv
WEEKLY SUMMARY
Staff,Phone,Week,Venue(s),Sessions,Hours,Status,Paid On
Marcus Chen,+1 555 0101,Mar 9–15 2026,Downtown PB,4,16.0,Unpaid,
Marcus Chen,+1 555 0101,Mar 2–8 2026,Downtown PB,6,21.0,Paid,Mar 10 2026
TOTAL,,,,10,37.0,,

SESSION DETAIL
Staff,Date,Venue,Session Start,Session End,Raw Duration,Rounded Hours
Marcus Chen,Mon Mar 9,Downtown PB,09:00,12:20,3h 20m,3.5
Marcus Chen,Tue Mar 10,Downtown PB,14:00,17:45,3h 45m,4.0
...
```

---

## 5. FRONTEND — ADMIN PANEL CHANGES

### 5.1 Navigation update

Find the Admin Panel sidebar component. Add "Payroll" as a new nav item:
```
Position: After "Staff Management", before "Player Directory"
Icon: Lucide <Banknote /> (24px, outline)
Label: "Payroll"
Route: /admin/payroll
Active state: purple-500 accent (matches other admin nav items)
```

---

### 5.2 Page: `/admin/payroll` — Payroll Overview

**File:** `app/admin/payroll/page.tsx` (or `.jsx`)

**Layout:**
```
Header row:
  Left:  "Payroll" (h1, text-white)
  Right: [Export Week CSV ↓] button (purple outline button)

Summary bar (Surface 2 card, flex row, gap-8):
  [5 venues]  [7 staff]  [94.5 total hours]  [4 unpaid]
  Each stat: small label (text-secondary) + large number (text-white)

Week navigation (flex row, centered):
  ◀ button (ghost, disabled if at current week) 
  "Week of Mar 9 – Mar 15, 2026" (text-white, font-medium)
  ▶ button (ghost, disabled if future week)

Staff table:
  Columns: Staff | Venue(s) | Hours | Status | Action
  Sort: UNPAID rows first, then alphabetical by name within each group
  Row height: 56px minimum (touch target)
  
  Staff cell: name (text-white, font-medium) + phone (text-secondary, text-sm)
  Venue(s) cell: comma-separated venue names (text-secondary)
  Hours cell: "16.0 h" (text-white, font-mono)
  Status cell:
    UNPAID → amber dot + "UNPAID" badge (amber-500 bg at 15% opacity, amber-500 text)
    PAID   → green dot + "PAID" badge (green-600 bg at 15% opacity, green-500 text)
  Action cell:
    UNPAID → [Mark Paid] button (purple-500 filled, small)
    PAID   → [Undo] button (neutral-700 ghost, small)
  
  Footer row: TOTAL | — | [total hours] | [X unpaid] | —

Interaction:
  Clicking any row (except the action button) → opens Staff Hours drawer (see 5.3)
  Mark Paid / Undo → optimistic UI update, PATCH to /api/admin/payroll/:paymentId/status
  
Empty state: "No sessions found for this week" (centered, text-secondary)
Loading state: skeleton rows (3 rows with pulse animation)
Error state: "Failed to load payroll data" + retry button
```

**Week navigation logic:**
- Default: current ISO week (Monday of current week).
- Store selected `weekStart` in URL search params: `/admin/payroll?week=2026-03-09`
- ▶ (next week) disabled if `weekStart` is current week or future.
- ◀ (prev week) no limit — can go back indefinitely.
- On navigation: re-fetch `/api/admin/payroll?weekStart=...`

---

### 5.3 Drawer: Staff Hours Detail

**Component:** `components/admin/StaffHoursDrawer.tsx`

Triggered from any row click on the Payroll Overview. Slides in from the right (400px wide on desktop, full-width on mobile).

**Drawer header:**
```
Staff name (text-xl, text-white)
Phone number (text-secondary)
[×] close button (top right)
```

**Two tabs:**
```
[ By Week ]    [ Cumulative ]
```
Tab style: underline active, text-secondary inactive.

**BY WEEK TAB:**
```
Week navigation:
  Same ◀ week label ▶ pattern as overview page
  Synced with overview's selected week by default
  
Payment status bar (Surface 2, rounded-xl, padding-4):
  Left: status badge (same style as overview)
  Right: [Mark Paid] or [Undo] button
  If PAID: show "Paid on Mar 11 · by Admin" (text-secondary, text-sm)

Optional note (shown if note exists, or expand to add):
  "Bank transfer 14 Mar" (text-secondary, italic, text-sm)
  [+ Add note] link if no note exists → inline text input on click

Session table:
  Columns: Date | Venue | Session Time | Raw | Rounded
  
  Date cell:     "Mon Mar 9" (text-white)
  Venue cell:    venue name (text-secondary) — only shown if staff worked multiple venues
  Time cell:     "09:00 → 12:20" (text-white, font-mono)
  Raw cell:      "3h 20m" (text-secondary, text-sm)
  Rounded cell:  "3.5 h" (text-white, font-mono, font-medium)
  
  Footer: TOTAL row | | | | [total hours] bold

Warning banner (amber, shown only if open sessions exist in this week):
  ⚠ icon + "1 open session excluded — session still running (Sun Mar 15)"
  Surface amber-500 at 10% opacity, border amber-500 at 30%, rounded-xl

Empty state: "No sessions this week"
```

**CUMULATIVE TAB:**
```
Date range picker row:
  "From" date input + "To" date input (default: last 4 weeks to today)
  Both inputs: date pickers, From must be a Monday (validate and snap to nearest Monday)
  [Export ↓] button (right-aligned)

Weeks table:
  Columns: Week | Hours | Sessions | Status | Paid On
  
  Week cell:    "Feb 23 – Mar 1" (text-white) — clickable, switches to By Week tab
  Hours cell:   "18.5 h" (text-white, font-mono)
  Sessions cell: "5" (text-secondary)
  Status cell:  same badge style as overview
  Paid On cell: "Mar 3 2026" (text-secondary) or "—"
  
  Footer: TOTAL | [total h] | [total sessions] | [X unpaid] | —

Totals summary cards (3 cards, flex row):
  Card 1: "Total Hours"  — [55.5 h] 
  Card 2: "Paid Hours"   — [39.5 h] (green text)
  Card 3: "Unpaid Hours" — [16.0 h] (amber text)

Empty state: "No sessions in this date range"
```

---

### 5.4 Mark Paid flow — detailed interaction

```
User clicks [Mark Paid]:
  1. Optimistic update: status badge changes to PAID immediately, button changes to [Undo]
  2. If note field is empty: no modal, just fire PATCH immediately
  3. PATCH /api/admin/payroll/:paymentId/status { status: "PAID" }
  4. On success: update local state with returned paidAt + paidByName
  5. On error: revert optimistic update, show toast "Failed to update — please try again"

User clicks [Undo]:
  1. Optimistic update: status reverts to UNPAID immediately
  2. PATCH /api/admin/payroll/:paymentId/status { status: "UNPAID" }
  3. Same error handling

Adding a note:
  User clicks [+ Add note] → inline input appears (no modal)
  User types and presses Enter or clicks away → 
    PATCH /api/admin/payroll/:paymentId/status { note: "..." } (status unchanged)
  Max 200 characters, show counter at 150+
```

---

### 5.5 Export behavior

**Export Week CSV (overview page):**
```
Button click → GET /api/admin/payroll/export?weekStart=YYYY-MM-DD
Browser triggers file download: payroll-week-2026-03-09.csv
No modal, no confirmation — direct download
```

**Export per-staff (cumulative tab):**
```
Button click → GET /api/admin/staff/:staffId/hours/export?from=...&to=...
Browser triggers file download: payroll-marcus-chen-2026-02-23-to-2026-03-15.csv
Filename: payroll-[kebab-case-name]-[from]-to-[to].csv
```

---

## 6. IMPLEMENTATION ORDER

Execute in this exact sequence. Do not skip ahead.

**Step 1 — DB foundation**
1. Verify `Session.staffId` exists. If not, add to Prisma schema + migrate.
2. Add `StaffPayment` model to Prisma schema.
3. Run `npx prisma migrate dev --name add_staff_payroll`.
4. Verify migration ran cleanly. Do not proceed if migration fails.

**Step 2 — Utilities**
1. Create `/lib/payroll.ts` with all helper functions from Section 3.
2. Write unit tests for `roundHoursUp()` covering edge cases:
   - Exact 30-min multiples (no rounding)
   - 1 minute over (rounds up full half-hour)
   - Zero minutes (returns 0)

**Step 3 — API endpoints (backend first, test with curl/Postman)**
1. `GET /api/admin/payroll` (overview)
2. `GET /api/admin/staff/:staffId/hours` (single week detail)
3. `PATCH /api/admin/payroll/:paymentId/status` (mark paid/unpaid)
4. `GET /api/admin/staff/:staffId/hours/cumulative` (multi-week)
5. `GET /api/admin/payroll/export` (week CSV)
6. `GET /api/admin/staff/:staffId/hours/export` (staff range CSV)

**Step 4 — Frontend components**
1. Add Payroll nav item to Admin sidebar.
2. Build `StaffHoursDrawer` component (By Week tab only first).
3. Build `/admin/payroll` overview page.
4. Connect overview to `StaffHoursDrawer`.
5. Add Cumulative tab to `StaffHoursDrawer`.
6. Wire up all export buttons.
7. Add Mark Paid / Undo interactions.

**Step 5 — Polish**
1. Loading skeletons on all data fetches.
2. Empty states (no sessions, no staff).
3. Error states with retry.
4. Verify all touch targets ≥ 48px.
5. Test mobile layout (drawer should be full-width on mobile).

---

## 7. VALIDATION & EDGE CASES

Handle all of these explicitly — do not leave them as unhandled states:

| Case | Handling |
|------|----------|
| Staff has 0 sessions this week | Show empty state, no StaffPayment record created |
| Staff has only open sessions (no closed) | totalHours = 0, show warning banner, still show in overview |
| Session `closedAt` < `openedAt` (corrupt data) | Skip that session, log warning to console |
| `weekStart` param is not a Monday | Return HTTP 400 with message "weekStart must be a Monday" |
| `from` > `to` in cumulative | Return HTTP 400 |
| Range > 26 weeks in cumulative | Return HTTP 400 with message "Maximum range is 26 weeks" |
| Staff member deleted but sessions still exist | Handle gracefully — show "(Deleted Staff)" as name |
| `paymentId` not found on PATCH | Return HTTP 404 |
| Concurrent Mark Paid requests | DB unique constraint on `(staffId, weekStart)` handles it — last write wins |
| Staff worked at a venue they're no longer assigned to | Still show historical sessions — don't filter by current venueId assignment |

---

## 8. WHAT NOT TO BUILD

Do not add these unless explicitly asked:

- ❌ Hourly rate fields — no money amounts anywhere in this system
- ❌ Automatic payment reminders or notifications
- ❌ Staff self-service hours view — admin-only feature
- ❌ Payroll history beyond what's in `StaffPayment` table
- ❌ Integration with any payment system
- ❌ Week auto-creation via cron — lazy creation only (on first admin view)
- ❌ Bulk "mark all paid" button (can be added later)
- ❌ Per-venue payroll breakdown (hours are per-person, not per-venue)

---

## 9. FILES TO CREATE / MODIFY

### New files:
```
lib/payroll.ts                                    ← utility functions
app/admin/payroll/page.tsx                        ← Payroll Overview page
components/admin/StaffHoursDrawer.tsx             ← Detail drawer (both tabs)
components/admin/PayrollStatusBadge.tsx           ← Reusable PAID/UNPAID badge
app/api/admin/payroll/route.ts                    ← GET overview
app/api/admin/payroll/export/route.ts             ← GET week CSV export
app/api/admin/payroll/[paymentId]/status/route.ts ← PATCH mark paid
app/api/admin/staff/[staffId]/hours/route.ts      ← GET single week detail
app/api/admin/staff/[staffId]/hours/cumulative/route.ts ← GET multi-week
app/api/admin/staff/[staffId]/hours/export/route.ts     ← GET staff CSV export
```

### Files to modify:
```
prisma/schema.prisma                    ← Add StaffPayment model, verify Session.staffId
app/admin/layout.tsx (or sidebar component) ← Add Payroll nav item
app/api/sessions/open/route.ts (or equivalent) ← Write staffId on session open
```

---

## 10. ACCEPTANCE CRITERIA

The feature is complete when ALL of the following are true:

- [ ] `npx prisma migrate dev` runs without errors
- [ ] `Session.staffId` is populated when a staff member opens a session
- [ ] `GET /api/admin/payroll?weekStart=2026-03-09` returns correct hours for all staff
- [ ] Rounding is always UP to nearest 30 min (test: 3h 01m → 3.5h, not 3.0h)
- [ ] Open sessions are excluded from total and trigger a warning
- [ ] `PATCH /api/admin/payroll/:paymentId/status` flips status and records paidAt + paidById
- [ ] Undo sets paidAt back to null
- [ ] Cumulative view shows correct week-by-week breakdown with payment status
- [ ] Week CSV export downloads with correct filename and all staff
- [ ] Staff range CSV export downloads with both summary and session detail sections
- [ ] Admin sidebar shows Payroll nav item
- [ ] Overview defaults to current ISO week
- [ ] Week navigation ▶ is disabled on current week
- [ ] Drawer opens on row click and shows correct staff data
- [ ] Switching tabs in drawer does not reset week selection
- [ ] All loading, empty, and error states are handled
- [ ] No console errors in normal operation
- [ ] Mobile: drawer renders full-width and is scrollable

---

_End of CURSOR_MODULE8_PAYROLL.md — CourtFlow Payroll Feature_

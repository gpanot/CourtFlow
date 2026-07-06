# CourtFlow — Roles & Rights Matrix

Last updated: 2026-07-05

This document describes who can do what across **Staff**, **Manager**, **Superadmin**, and the **Coach** flag (`isCoach`).

> **Important:** Coach is **not** a separate JWT role. It is a boolean flag on a staff account (`isCoach: true`). Any account can be a coach: `staff + coach`, `manager + coach`, or `superadmin + coach`.

---

## Role model

| Concept | What it is | Stored in |
|---|---|---|
| **Staff** | Front-desk / host operational role | JWT `role: "staff"` |
| **Manager** | Venue admin — admin panel + scoped venues | JWT `role: "manager"` |
| **Superadmin** | Platform admin — all venues + superadmin-only tools | JWT `role: "superadmin"` |
| **Coach** | Can use Coach Portal + own lesson data | DB `isCoach: true` (any role) |

### API auth tiers

Defined in `src/lib/auth.ts`:

| Guard | Who passes |
|---|---|
| `requireStaff` | staff, manager, superadmin |
| `requireManagerOrSuperAdmin` | manager, superadmin |
| `requireSuperAdmin` | superadmin only |

### Venue scope

Defined in `src/lib/venue-scope.ts`:

| Role | `getAuthorizedVenueIds()` returns |
|---|---|
| **Superadmin** | All venues |
| **Manager** | Venues they **own** (`ownerId`) OR are **assigned to** |
| **Staff** | Assigned venues only (when API checks scope) |

---

## Login surfaces

| Surface | Staff | Manager | Superadmin | + Coach flag |
|---|---|---|---|---|
| **Admin panel** (`/admin`) | No — redirected to `/staff` | Yes | Yes | Same; Coach Portal also available if `isCoach` |
| **Staff app** (`/staff`) | Yes | Yes | Yes | Yes |
| **Coach Portal** (`/coach-portal`) | Only if `isCoach` | Only if `isCoach` | Only if `isCoach` | Yes |
| **Mobile staff app** | Yes | Yes | Yes | Coach screens if `isCoach` |

### Post-login routing

| Account | Default behavior |
|---|---|
| `manager` / `superadmin` | Role choice: Admin panel, Staff app, Coach Portal (if coach), Tablet mode, etc. |
| `staff` + `isCoach` (coach only) | Auto-redirect to **Coach Portal** |
| `staff` (not coach) | Staff app / venue operations |

---

## App access (per venue assignment)

Each staff member is assigned to venues. Each assignment has an **`appAccess`** array:

| Value | Unlocks |
|---|---|
| `courtflow` | CourtFlow social session management (queue, courts, live) |
| `courtpay` | CourtPay check-in & payment system |

- Both can be enabled on the same venue.
- If only one app is enabled, login routes directly to that app.
- If both are enabled, the user picks on login.

> App access is **per venue assignment**, not global. A person may have `courtflow` at venue A and `courtpay` at venue B.

| Who can assign `courtflow`? | Who can assign `courtpay`? |
|---|---|
| **Superadmin only** | Manager or Superadmin |

---

## Admin panel — navigation visibility

Admin panel requires `manager` or `superadmin`. **Staff cannot enter** (`/admin` layout redirects to `/staff`).

| Section / Page | Staff | Manager | Superadmin |
|---|---|---|---|
| Overview | — | Yes* | Yes |
| Venues | — | Yes* | Yes |
| Bookings | — | Yes* | Yes |
| Coaching | — | Yes* | Yes |
| Memberships | — | Yes* | Yes |
| CourtPass Players | — | Yes* | Yes |
| Staff | — | Yes* | Yes |
| Venue Analytics | — | Yes* | Yes |
| Settings | — | Yes* | Yes |
| My Billing | — | Yes | Yes |
| **Organizations** | — | — | Yes |
| **Program Passes** | — | — | Yes |
| **CourtFlow — Social** (Live, Analytics, Players) | — | If `courtflow` access* | Yes |
| **Payroll Hosts** | — | — | Yes |
| **CourtPay — Check-in** (CourtPay, CP Players, CP Analytics, CP Settings) | — | If `courtpay` access* | Yes |
| **CP Billing** | — | — | Yes |
| **Kiosk Shop** | — | — | Yes |
| **Logs / Face test / Log errors** | — | — | Yes |

\*Filtered by assigned venues and per-venue app access.

---

## Feature rights matrix

| Capability | Staff | Manager | Superadmin | Coach (`isCoach`) |
|---|---|---|---|---|
| Run live sessions (queue, courts, payments) | Yes | Yes | Yes | If also staff/manager |
| CourtPay kiosk / check-in | Yes | Yes | Yes | — |
| Tablet mode | Yes | Yes | Yes | — |
| Sticker kiosk | Yes | No | Yes | — |
| View CourtPass players (API) | Assigned venues | Assigned venues | All venues | — |
| Admin: bookings grid, blocks, create booking | — | Yes | Yes | — |
| Admin: coaching packages & lessons | — | Yes | Yes | — |
| Admin: memberships, venue settings | — | Yes | Yes | — |
| Admin: staff CRUD | — | Yes† | Yes | — |
| Create superadmin accounts | — | — | Yes | — |
| Toggle `isCoach` on staff | — | Yes† | Yes | — |
| Venue analytics, dashboard | — | Yes | Yes | — |
| Platform billing / payroll / program passes | — | — | Yes | — |
| Coach Portal: own profile & bio | — | — | — | Yes (self only) |
| Coach Portal: weekly availability | — | — | — | Yes (self only) |
| Coach Portal: view own lessons | — | — | — | Yes (self only) |
| Export own lesson CSV | Own data only | Any coach | Any coach | Own data only |
| Google Calendar sync | — | — | — | Yes (self) |

† **Manager constraints:**
- Cannot create or edit **superadmin** accounts
- Cannot assign staff to venues outside their scope
- Cannot grant **CourtFlow** app access (superadmin only)
- Staff list never returns superadmin accounts to managers

---

## Coaching — admin vs coach portal

| Action | Admin (Manager+) | Coach Portal (`isCoach`) |
|---|---|---|
| Create / edit **coach packages** | Yes | No |
| Book / edit / cancel **lessons** | Yes | No |
| Edit **coach profile** (photo, DUPR, specialties…) | Admin → Coaching tab | Coach Portal (self) |
| Set **weekly availability** | Admin | Coach Portal (self) |
| View **assigned lessons** | Admin → Coaching | Coach Portal |
| Appear on **public booking** site | If profile complete | — |

Coach Portal APIs (`/api/admin/coach-portal/*`) use `requireStaff` but always scope to **`auth.id`** — coaches can only read/update their own record.

---

## Staff management rules

### Role dropdown in create/edit modal

| Logged-in role | Options shown |
|---|---|
| `superadmin` | Staff, Manager, Super Admin |
| `manager` | Staff, Manager |

### Creating staff (`POST /api/admin/staff`)

| Rule | Applies to |
|---|---|
| Cannot create `superadmin` | Manager |
| Cannot assign venues outside own scope | Manager |
| Email required | Manager, Coach (`isCoach`) |
| Seeds default weekly availability when `isCoach: true` | All creators |

### Staff list (`GET /api/admin/staff`)

| Caller | Sees |
|---|---|
| Superadmin | All staff on their venues + unassigned staff |
| Manager | Staff and managers on their venues only — **never superadmin** |

---

## Typical account combinations

| Account type | Role | `isCoach` | Gets |
|---|---|---|---|
| Front desk host | `staff` | false | Staff app only |
| Coach (no admin) | `staff` | true | Coach Portal (+ Staff app if chosen) |
| Venue manager | `manager` | false | Admin panel + Staff app |
| Head coach / manager-coach | `manager` | true | Admin + Coach Portal + Staff app |
| Platform owner | `superadmin` | false/true | Everything |

---

## API route access summary

| Route pattern | Staff | Manager | Super Admin |
|---|---|---|---|
| `/api/admin/staff`, bookings, coaching, memberships, venues (most) | — | Scoped | Full / all venues |
| `/api/admin/billing/*`, payroll, stickers, kiosk, logs | — | — | Full access |
| `/api/admin/coach-portal/*` | Self only (must be coach) | Self only | Self only |
| `/api/admin/coach-lessons/export` | Own `coachId` only | Any coach | Any coach |
| `/api/admin/courtpass-players` | Assigned venues | Assigned venues | All venues |
| Staff PWA routes (`/api/staff/*`, sessions, queue, kiosk) | Full | Full | Full |

---

---

## Email Notifications Matrix

> **Canonical reference:** [`docs/email-notifications.md`](./email-notifications.md) — full trigger list, subject lines, debugging, and source files.

Last audited: 2026-07-06

All transactional emails are sent via Resend using `sendBookingEmail` / `sendLessonEventEmails` from `src/lib/email/send.ts`.  
**Non-fatal** — email errors are logged but never cause API failures.

### Court Bookings

| Trigger | API Route | Email type | Recipients | Notes |
|---|---|---|---|---|
| Staff creates single-court booking | `POST /api/staff/bookings` | `staff_confirmed` | Player | Includes "Pay now" button → `/book/pay/:id`. Skipped if player has no email. |
| Staff creates multi-court batch | `POST /api/staff/bookings/batch` | `staff_confirmed` | Player | Pay link → first booking id. Skipped if no email. |
| Staff reschedules booking | `PATCH /api/staff/bookings/:id` (no status) | `staff_confirmed` | Player | Sends updated details + pay link. Skipped if no email. |
| Staff cancels booking | `PATCH /api/staff/bookings/:id` (status=cancelled) | `cancelled` | Player | Includes venue, date, time. Skipped if no email. |
| Player submits payment proof | `POST /api/public/bookings/:id/proof` | `pending` | Player | Acknowledgement email. |
| Admin approves payment | `POST /api/admin/bookings/:id/approve-payment` | `approved` | Player | — |
| Admin rejects payment | `POST /api/admin/bookings/:id/reject-payment` | `rejected` | Player | Includes rejection reason. |
| SePay auto-confirms payment | `src/modules/courtpay/lib/sepay.ts` | `auto_confirmed` | Player | Triggered by SePay webhook. |
| Player self-cancels | `PATCH /api/public/bookings/:id` (cancel) | `cancelled` | Player | — |

### Open Play Sessions

| Trigger | API Route | Email type | Recipients | Notes |
|---|---|---|---|---|
| Staff registers player | `POST /api/admin/open-play/register` | `staff_confirmed` | Player | Pay link → `/book/open-play/pay/:id`. Skipped if no email. |
| Player self-registers | `POST /api/public/open-play` (via public flow) | `pending` | Player | — |
| Player submits payment proof | `POST /api/public/open-play/:id/proof` | `pending` | Player | — |
| Admin approves payment | `POST /api/admin/open-play/:id/approve-payment` | `approved` | Player | — |
| Admin rejects payment | `POST /api/admin/open-play/:id/reject-payment` | `rejected` | Player | — |
| Admin cancels registration | `PATCH /api/admin/open-play/:id` (action=cancel) | `cancelled` | Player | — |

### Coach Lessons

| Trigger | API Route | Email type | Recipients | Notes |
|---|---|---|---|---|
| Staff creates lesson | `POST /api/admin/coach-lessons` | `staff_confirmed` | Player + Coach + Staff (venue email) | Uses `sendLessonEventEmails`. Coach gets a distinct "new booking" subject. |
| Staff reschedules lesson | `PATCH /api/admin/coach-lessons/:id` (date/time/coach change) | `staff_confirmed` | Player + Coach + Staff | Fires when `date`, `startTime`, `endTime`, or `coachId` changes. |
| Staff cancels lesson (status=cancelled) | `PATCH /api/admin/coach-lessons/:id` | `cancelled` | Player + Coach + Staff | — |
| Staff deletes lesson | `DELETE /api/admin/coach-lessons/:id` | `cancelled` | Player + Coach + Staff | — |
| Player submits payment proof | `POST /api/public/coach-sessions/:id/proof` | `pending` | Player | — |
| Admin approves payment | `POST /api/admin/coach-lessons/:id/approve-payment` | `approved` | Player + Coach + Staff | — |
| Admin rejects payment | `POST /api/admin/coach-lessons/:id/reject-payment` | `rejected` | Player + Coach + Staff | — |
| SePay auto-confirms | `src/modules/courtpay/lib/sepay.ts` | `auto_confirmed` | Player + Coach | — |

### Known gaps / not yet emailed

| Scenario | Status |
|---|---|
| Staff marks booking as `no_show` | No email sent (intentional — player doesn't need to know) |
| Batch booking edit / cancel | Batch edit not in UI yet. Cancellation of individual bookings in a group goes through single booking cancel (emails player). |
| Player cancels own open play registration | `DELETE /api/public/open-play/:id` sends `cancelled` email (not sent for expired holds) |
| Coach edits own lesson via Coach Portal | No email sent; staff creates/edits lessons. |

---

## Related docs

- [`docs/email-notifications.md`](./email-notifications.md) — full email notifications reference
- [`docs/ROLES.md`](./ROLES.md) — shorter roles reference
- [`docs/management-levels.md`](./management-levels.md) — manager vs superadmin design decisions and schema

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

## Related docs

- [`docs/ROLES.md`](./ROLES.md) — shorter roles reference
- [`docs/management-levels.md`](./management-levels.md) — manager vs superadmin design decisions and schema

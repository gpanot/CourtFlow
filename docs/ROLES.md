# CourtFlow — Roles & Access Reference

Last updated: 2026-06-10

---

## Role Overview

| Role | Who is it | Can log in to | Created by |
|---|---|---|---|
| `staff` | Front-desk staff, operators | Staff app (PWA / Mobile) | Manager or Superadmin |
| `manager` | Venue owner / team lead | Staff app + Admin panel | Superadmin (or self via onboarding) |
| `superadmin` | Platform administrator | Staff app + Admin panel (full) | Superadmin only |

---

## App Access (per venue assignment)

Each staff member is assigned to one or more venues. Each venue assignment carries an **app access** array:

| Value | App unlocked |
|---|---|
| `courtflow` | CourtFlow social session management (queue, courts, live) |
| `courtpay` | CourtPay check-in & payment system |

Both can be enabled simultaneously. When only one is set, the staff app routes directly to that app. When both are set, the user is prompted to pick on login.

> The `appAccess` array is **per venue assignment**, not per staff member globally. A staff member may have `courtflow` only at venue A and both `courtflow + courtpay` at venue B.

---

## Admin Panel Access

Access to `/admin` requires `role = manager` OR `role = superadmin`. Staff cannot enter the admin panel.

### Nav section visibility

| Nav section | Visible to `superadmin` | Visible to `manager` |
|---|---|---|
| Overview | Yes | Yes |
| Venues | Yes | Yes (own venues only) |
| Bookings | Yes | Yes |
| Memberships | Yes | Yes |
| Coaching | Yes | Yes |
| Staff | Yes | Yes (no superadmin accounts visible) |
| Players | Yes | Yes |
| Venue Analytics | Yes | Yes |
| My Billing | Yes | Yes |
| **CourtFlow — Social** section | Yes | Only if at least one assigned venue has `courtflow` access |
| **CourtPay — Check-in** section | Yes | Only if at least one assigned venue has `courtpay` access |
| Payroll Hosts | Yes (superadmin only) | No |
| CP Billing | Yes (superadmin only) | No |
| Kiosk Shop | Yes (superadmin only) | No |
| Logs & Errors | Yes (superadmin only) | No |

### Role dropdown in Staff create/edit modal

| Logged-in role | Options shown |
|---|---|
| `superadmin` | Staff, Manager, Super Admin |
| `manager` | Staff, Manager |

---

## API-level Guards

### Staff list (`GET /api/admin/staff`)

- `superadmin`: sees all staff assigned to their venues + unassigned staff
- `manager`: sees only `staff` and `manager` accounts assigned to their venues — **superadmin accounts are never returned**

### Venue picker in staff create/edit

- `superadmin`: all venues they are assigned to
- `manager`: venues they own (`ownerId`) + venues they are assigned to as staff (team-shared venues)

### Creating staff (`POST /api/admin/staff`)

- `manager`: cannot create `superadmin` accounts; cannot assign staff to venues outside their scope

### Editing staff (`PATCH /api/admin/staff/[staffId]`)

- `manager`: cannot edit superadmin accounts; cannot promote to `superadmin`; cannot reassign staff to venues outside their scope

### Venue creation/management

- `manager`: when creating a venue, they become `ownerId`; they see venues where `ownerId = their id` OR where they have a `staffAssignment`

---

## Staff App Access

The mobile/PWA staff app is always entered via `/staff`. After login:

1. If the staff member has **one venue** → enters that venue directly
2. If the staff member has **multiple venues** → prompted to pick
3. After venue selection, if the venue has **both** `courtflow` and `courtpay` → prompted to pick which app to open; if only one → routes directly

Managers and superadmins can choose "Go to admin panel" from the role choice screen at `/staff`.

---

## Onboarding

| Role | `onboardingCompleted` default | Notes |
|---|---|---|
| `staff` | `true` (set on creation) | Staff skip onboarding — they are created by a manager |
| `manager` (created by admin) | `true` (set on creation) | Same — manager created by superadmin bypasses onboarding |
| `manager` (self-sign-up) | `false` → set `true` after first venue created | Goes through `/onboarding` to create their first venue |
| `superadmin` | `false` → set `true` after setup | Goes through `/onboarding` |
| **Promoted to manager** | Automatically set to `true` by API | Prevents redirect to onboarding after role promotion |

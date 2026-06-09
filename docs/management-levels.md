# CourtFlow Management Levels

> Last updated: 2026-06-09

## Changelog

| Date | Change |
|---|---|
| 2026-06-09 | Added `manager` role between `staff` and `superadmin`. Introduced venue ownership (`ownerId`), scoped data access for managers, `/admin/my-billing` page, and venue owner reassignment. |
| 2026-03-09 | Initial system with two roles: `staff` and `superadmin`. |

---

## Role Hierarchy

```
superadmin  →  manager  →  staff
(platform)     (client)    (venue operator)
```

### 1. Super Admin (`superadmin`)

The platform owner. Has unrestricted access to everything.

| Capability | Details |
|---|---|
| Venues | Creates, edits, and deletes any venue. Sees all venues they are assigned to via `StaffVenueAssignment`. |
| Staff | Creates, edits, and deletes any staff member with any role. |
| Managers | Creates manager accounts and assigns them to venues via `ownerId`. Can reassign or remove venue ownership. |
| Players | Sees all players in the system (no venue filter). |
| Billing | Full access to billing configuration, invoices, rates, and payment marking. |
| Admin Panel | Full navigation: all sections including CP Billing, Kiosk Shop, Payroll Hosts, Logs & Errors. |
| Stickers/Kiosk | Full access to sticker templates, kiosk settings, and face recognition. |

### 2. Manager (`manager`)

A client who owns one or more venues. Cannot see or modify other clients' data.

| Capability | Details |
|---|---|
| Venues | Creates new venues (auto-assigned as owner via `ownerId`). Sees only venues where `ownerId = self`. Edits venue settings, courts, TV display for their own venues. |
| Staff | Creates `staff` and `manager` accounts within their own venues. Cannot create `superadmin`. Cannot modify or delete staff outside their venues. Cannot touch `superadmin` accounts. |
| Players | Sees only players who have `registrationVenueId` in their venues OR have queue entries/check-ins in their venues. Shared player database, venue-filtered visibility. |
| Billing | Read-only view via `/admin/my-billing`. Sees invoices and billing rates for owned venues. Cannot modify billing config or mark payments. |
| Admin Panel | Filtered navigation. Hidden sections: CP Billing, Kiosk Shop, Payroll Hosts, Logs & Errors. Visible: Overview, Venues, Bookings, Memberships, Coaching, Staff, Players, Venue Analytics, My Billing, Live Sessions, Analytics, CourtPay, CP Analytics. |
| Stickers/Kiosk | No access. |

### 3. Staff (`staff`)

A venue operator. Operates via the Staff PWA, not the admin panel.

| Capability | Details |
|---|---|
| Venues | Sees assigned venues only (via `StaffVenueAssignment`). |
| Admin Panel | No access. Redirected to staff login if they try `/admin`. |
| Staff PWA | Full access to session management, check-in, payment collection for assigned venues. |
| Players | Sees session players only (in the context of active sessions). |

---

## Database Schema

### StaffRole Enum

```prisma
enum StaffRole {
  staff
  manager
  superadmin
}
```

### Venue Ownership

```prisma
model Venue {
  ownerId  String?       @map("owner_id")
  owner    StaffMember?  @relation("VenueOwner", fields: [ownerId], references: [id], onDelete: SetNull)
}

model StaffMember {
  ownedVenues  Venue[]  @relation("VenueOwner")
}
```

- `ownerId = null` means the venue belongs to the platform (superadmin managed).
- `ownerId = <staffMemberId>` means the venue is owned by a manager.
- When a manager is deleted, `ON DELETE SET NULL` reverts the venue to platform ownership.

---

## Auth Layer

| Helper | Accepts | Used By |
|---|---|---|
| `requireStaff()` | `staff`, `manager`, `superadmin` | Staff PWA routes |
| `requireManagerOrSuperAdmin()` | `manager`, `superadmin` | Admin panel routes (most) |
| `requireSuperAdmin()` | `superadmin` only | Billing, kiosk, stickers, logs, venue deletion |

### Venue Scope (`src/lib/venue-scope.ts`)

```typescript
getAuthorizedVenueIds(auth)
// superadmin: venues where staff is assigned (StaffVenueAssignment)
// manager: venues where ownerId === auth.id

assertVenueAccess(auth, venueId)
// Throws if venueId is not in the caller's authorized scope
```

---

## API Route Access Matrix

| Route | Staff | Manager | Super Admin |
|---|---|---|---|
| `/api/admin/venues` | - | Own venues | Assigned venues |
| `/api/admin/staff` | - | Scoped to venues | All |
| `/api/admin/dashboard` | - | Scoped | Scoped |
| `/api/admin/players` | - | Venue-filtered | All |
| `/api/admin/manager/billing` | - | Own venues | All |
| `/api/admin/billing/*` | - | - | Full access |
| `/api/admin/kiosk-settings` | - | - | Full access |
| `/api/admin/sticker-*` | - | - | Full access |
| `/api/admin/face-stats` | - | - | Full access |
| `/api/admin/log-errors` | - | - | Full access |
| `/api/admin/staff-auth-logs` | - | - | Full access |
| `/api/admin/payroll/*` | - | - | Full access |
| All other `/api/admin/*` | - | Scoped | Full access |
| Staff PWA routes | Full | Full | Full |

---

## Venue Owner Reassignment

Only superadmins can reassign venue ownership:

```
PATCH /api/venues/{venueId}
Body: { "ownerId": "<staffMemberId>" }   // assign
Body: { "ownerId": null }                 // revert to platform
```

The admin Venues page includes a "Venue Owner (Manager)" dropdown, visible only to superadmins, for assigning or changing ownership.

---

## Key Design Decisions

1. **Single admin portal**: Managers reuse the existing `/admin` panel with filtered navigation. No separate portal was created.
2. **Ownership via `ownerId`**: Rather than using `StaffVenueAssignment` for manager scoping, a direct `ownerId` FK on `Venue` provides clear, simple ownership semantics.
3. **Player isolation via queries**: Players remain in a shared database. Manager visibility is enforced at query time by filtering on `registrationVenueId` and queue entry venue associations. No schema changes to the `Player` model were needed.
4. **Backward compatibility**: All existing `staff` and `superadmin` flows are unaffected. Venues without an `ownerId` are treated as platform-owned.

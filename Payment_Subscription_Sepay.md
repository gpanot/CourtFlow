Update the subscription system based on
revised requirements. This is a
SEPARATE MODULE from CourtFlow rotation.
Check-in + payment + subscription stands
alone independently.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CHANGE 1 — PACKAGES: FULLY EDITABLE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Packages are NOT fixed to 3 types.
Staff can create, edit, and delete
any number of packages per venue.

Remove fixed type constraint:
  DELETE: type field locked to
  "starter" | "regular" | "unlimited"

REPLACE WITH fully flexible package:

model SubscriptionPackage {
  id            String   @id @default(cuid())
  venueId       String
  name          String
  // e.g. "Monthly Pass", "10 Sessions"
  sessions      Int?
  // null = unlimited
  durationDays  Int
  // how long package is valid from activation
  price         Int
  // in VND
  perks         String?
  // free text e.g. "10% court booking
  // discount + free water bottle"
  isActive      Boolean  @default(true)
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  venue         Venue    @relation(
    fields: [venueId], references: [id]
  )
  subscriptions PlayerSubscription[]
}

━━━━━━━━━━━━━━━━
PACKAGES PAGE UI
━━━━━━━━━━━━━━━━

Route: /staff/subscriptions

TWO TABS:
  [Packages]  [Subscribers]

PACKAGES TAB:

IF no packages exist for this venue:

  Empty state:
  ┌─────────────────────────────────┐
  │ No packages yet                 │
  │                                 │
  │ [Create packages for me]        │
  │                                 │
  │ or [+ Create custom package]    │
  └─────────────────────────────────┘

  [Create packages for me] button:
    Creates 3 default packages instantly:

    Package 1:
      name: "Starter"
      sessions: 5
      durationDays: 60
      price: 0 (staff sets price after)
      perks: ""

    Package 2:
      name: "Regular"
      sessions: 10
      durationDays: 90
      price: 0
      perks: ""

    Package 3:
      name: "Unlimited"
      sessions: null (unlimited)
      durationDays: 30
      price: 0
      perks: ""

    After creation:
    Show packages list with banner:
    "3 packages created — set your prices"

IF packages exist:

  [+ Add package] button top right

  Package card per package:

  ┌─────────────────────────────────┐
  │ Regular              [Edit] [X] │
  │ 10 sessions · 90 days           │
  │ 900,000 VND                     │
  │ Perks: 10% court booking        │
  │        discount                 │
  │ Active subscribers: 14          │
  └─────────────────────────────────┘

  [Edit] → opens edit form (same as create)
  [X] → delete with confirmation:
    "Delete Regular package?
     14 active subscribers will
     keep their current subscription
     until it expires."
    [Delete] [Cancel]
    Deleting sets isActive: false
    Does NOT cancel active subscriptions

━━━━━━━━━━━━━━━━
CREATE / EDIT PACKAGE FORM
━━━━━━━━━━━━━━━━

Bottom sheet or full screen form:

  Package name:
  [                    ]

  Sessions included:
  [10        ] sessions
  [ ] Unlimited (toggle)
  If unlimited toggled: hide number input

  Valid for:
  [30        ] days from activation

  Price:
  [900,000   ] VND

  Perks (optional):
  [                              ]
  "e.g. 10% court booking discount,
   free water bottle"
  Free text, no formatting
  Max 200 characters

  [Save package]

Validation:
  Name required
  Price required (can be 0)
  Duration required
  Sessions required unless unlimited

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CHANGE 2 — REMOVE WRISTBAND NUMBER
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Players identified by NAME + PHONE only.
No face recognition for this module.
No wristband number.

This module is INDEPENDENT of CourtFlow
face recognition and queue system.

FIRST TIME REGISTRATION form:
  Name:   [              ] required
  Phone:  [              ] required
  Gender: [Male] [Female]  required
  Level:  [Beg][Int][Adv]  required

RETURNING PLAYER check-in:
  Staff searches by name or phone number
  [Search player by name or phone]
  → typeahead search results
  → tap player → proceed to payment

  OR player types their own phone number
  on the kiosk: [Enter your phone number]
  → found → show name for confirmation
  → not found → "Register as new player"

NO face scan in this module.
NO wristband number in this module.
These belong to CourtFlow rotation module.

Update Player model or create
separate CheckInProfile model
(see Change 3 for decoupling):

  name         String
  phone        String  @unique
  gender       String?
  skillLevel   String?
  venueId      String
  // scoped per venue for now

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CHANGE 3 — DECOUPLE INTO INDEPENDENT MODULE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

The check-in + payment + subscription
system is a SEPARATE MODULE.
It does NOT depend on CourtFlow
queue, rotation, TV display, or
face recognition.

This means:

━━━━━━━━━━━━━━━━
SESSION DEDUCTION TIMING
━━━━━━━━━━━━━━━━

Deduct session when player
SUCCESSFULLY CHECKS IN AND PAYS.
NOT when they scan at TV tablet.
NOT when they join the queue.

Check-in = paid entry to venue.
What they do after (play, rest,
leave early) is their business.
The subscription tracks venue visits
not games played.

This decouples subscription completely
from CourtFlow rotation logic.

On successful payment confirmation
(SePay webhook or manual confirm):

  IF player has active subscription:
    Create SubscriptionUsage:
      subscriptionId
      checkedInAt: now()
    
    Decrement sessionsRemaining by 1
    If sessionsRemaining === 0:
      status → "exhausted"

  IF player has no subscription:
    Normal session payment
    No subscription action

REMOVE from tv-queue/join:
  All subscription deduction logic
  All SubscriptionUsage creation
  These no longer live there

━━━━━━━━━━━━━━━━
MODULE BOUNDARIES
━━━━━━━━━━━━━━━━

CHECK-IN MODULE (independent):
  Player registration (name + phone)
  Payment (VietQR via SePay or cash)
  Subscription management
  Session deduction on check-in
  Boss dashboard
  
  Routes:
    /checkin/*
    /api/checkin/*
    /api/webhooks/sepay
    /api/subscriptions/*
    /staff/subscriptions
    /owner/*

COURTFLOW ROTATION MODULE (separate):
  Face recognition
  Queue management
  Court assignment
  TV display
  Ranking system
  
  Routes:
    /display/*
    /tv-queue/*
    /api/courts/*
    /api/tv-queue/*
    /api/kiosk/*

CONNECTION BETWEEN MODULES:
  Minimal and optional.
  Check-in module can work
  without CourtFlow rotation.
  
  If both modules active:
    Shared player record
    linked by phone number
    Check-in module creates/finds player
    CourtFlow uses same player record
    No direct dependency

━━━━━━━━━━━━━━━━
DATABASE SEPARATION
━━━━━━━━━━━━━━━━

Create CheckInPlayer model
(separate from CourtFlow Player
 or extend it — implementer decides
 based on existing schema):

model CheckInPlayer {
  id          String   @id @default(cuid())
  venueId     String
  name        String
  phone       String
  gender      String?
  skillLevel  String?
  createdAt   DateTime @default(now())

  @@unique([phone, venueId])

  venue         Venue                @relation(...)
  subscriptions PlayerSubscription[]
  payments      PendingPayment[]
  checkIns      CheckInRecord[]
}

model CheckInRecord {
  id          String   @id @default(cuid())
  playerId    String
  venueId     String
  checkedInAt DateTime @default(now())
  paymentId   String?
  // null for subscribers (no separate payment)
  source      String
  // "vietqr" | "cash" | "subscription"

  player  CheckInPlayer @relation(...)
  venue   Venue         @relation(...)
}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CHANGE 4 — BOSS DASHBOARD IN STAFF PROFILE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Boss dashboard is accessible from
staff profile menu.
Any staff can access for now.
No separate owner login needed yet.

Location:
  Staff app → Profile (tab or menu)
  → [Boss Dashboard]
  → Opens boss dashboard inline
    or as new page

Route: /staff/dashboard/boss

Keep all existing boss dashboard content:
  Today tab
  History tab
  Sessions tab
  Settings tab

Remove:
  Separate /owner/[venueId] route
  Separate owner login
  Owner role auth check

Replace with:
  Staff auth (already logged in)
  Menu item in staff profile

Staff profile menu layout:

  ┌─────────────────────────────┐
  │ [Avatar] Staff Name         │
  │         MM Pickleball Club  │
  ├─────────────────────────────┤
  │ Subscriptions          >    │
  │ Boss Dashboard         >    │
  │ Venue Settings         >    │
  │ ─────────────────────────── │
  │ Sign out                    │
  └─────────────────────────────┘

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CHANGE 5 — SUBSCRIBE DURING CHECK-IN FLOWS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Player can subscribe at two moments:

MOMENT A — First time registration flow:
After filling in name + phone + details
BEFORE showing payment screen

  Insert subscription offer screen:

  "Welcome to MM Pickleball, James!
   Want to save with a package?"

  Show package cards:
  (all active packages for venue)

  ┌─────────────────────────────────┐
  │ Regular                         │
  │ 10 sessions · 90 days           │
  │ 900,000 VND                     │
  │ 10% court booking discount      │
  └─────────────────────────────────┘

  (repeat for each package)

  [Skip — pay today only]
  (small, below packages)

  If player selects a package:
    Payment screen shows package price
    Reference: CF-SUB-[type]-[random]
    On confirmation:
    Subscription activated
    This session already included
    (first visit counted as session 1)
    
    Success screen:
    "Welcome, James!
     Regular package activated
     9 sessions remaining"

  If player taps [Skip]:
    Normal session payment flow
    150,000 VND for today only

MOMENT B — Returning player check-in:

After player identified by phone/name
AND player has no active subscription
Insert subscription offer BEFORE
showing payment screen:

  "Welcome back, James!
   Save with a package today?"

  Same package cards as above
  [Skip — pay today only]

  If player selects package:
    Payment screen shows package price
    This session included in package
    Success: subscription activated

  If player has active subscription:
    Skip offer entirely
    Skip payment entirely
    Go straight to success screen:
    "Welcome back, James!
     Regular · 6 sessions remaining"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
UPDATED KIOSK FLOW — ENTRANCE MODE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

HOME SCREEN (two buttons):
  [Check In]       → returning player
  [First Time?]    → new registration

━━━━━━━━━━━━━━━━
PATH A — CHECK IN (RETURNING)
━━━━━━━━━━━━━━━━

Step 1 — Identify player:
  [Enter your phone number]
  Large numeric input
  [Search]
  
  On match:
  Shows: "James Chen?"
  [Yes, that's me]  [Not me]
  
  Not found:
  "Phone not found"
  [Register as new player]
  [Try different number]

Step 2a — Active subscription found:
  Skip payment
  Skip subscription offer
  Show confirmation:
  "Welcome back, James!
   Regular · 6 sessions remaining"
  Auto-reset 8 seconds

Step 2b — No active subscription:
  Subscription offer screen
  (packages with [Skip] option)
  
  If package selected:
    → payment for package price
    → session included in package
  
  If skip:
    → payment for session fee only

Step 3 — Payment (if needed):
  VietQR with reference code
  ─── or ───
  [Pay by cash]
  Staff confirms via dashboard

Step 4 — Success:
  "Welcome back, James!"
  Sessions remaining (if subscribed)
  "Head to TV screen when ready"
  Auto-reset 8 seconds

━━━━━━━━━━━━━━━━
PATH B — FIRST TIME REGISTRATION
━━━━━━━━━━━━━━━━

Step 1 — Details form:
  Name:   [              ]
  Phone:  [              ]
  Gender: [Male] [Female]
  Level:  [Beginner][Intermediate][Advanced]
  [Next →]

Step 2 — Subscription offer:
  Package cards + [Skip]

Step 3 — Payment:
  Package price OR session fee
  VietQR or cash

Step 4 — Success:
  "Welcome to MM Pickleball, James!"
  Package info if subscribed
  "Head to TV screen when ready"
  Auto-reset 8 seconds

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
UPDATED API ENDPOINTS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

POST /api/checkin/identify
  Public (kiosk)
  Body: { venueCode, phone }
  Returns: {
    found: bool,
    player: { id, name, phone },
    activeSubscription: {
      packageName,
      sessionsRemaining,
      daysRemaining,
      isUnlimited
    } | null
  }

POST /api/checkin/register
  Public (kiosk)
  Body: {
    venueCode,
    name,
    phone,
    gender,
    skillLevel,
    packageId?  // if subscribing
  }
  Creates CheckInPlayer
  Creates PendingPayment
  Returns: {
    pendingPaymentId,
    amount,
    vietQR,
    paymentRef
  }

POST /api/checkin/pay-session
  Public (kiosk)
  Body: {
    venueCode,
    playerId,
    packageId?  // if subscribing
  }
  Creates PendingPayment
  Returns: {
    pendingPaymentId,
    amount,
    vietQR,
    paymentRef
  }

POST /api/webhooks/sepay
  (unchanged from previous prompt)
  Now also handles subscription payments
  Matches by paymentRef in content field
  
  On session payment confirmed:
    Create CheckInRecord
    If has subscription:
      Create SubscriptionUsage
      Decrement sessionsRemaining
    Emit: payment:confirmed to kiosk

  On subscription payment confirmed:
    Create PlayerSubscription
    Create CheckInRecord
    Create SubscriptionUsage (session 1)
    Set sessionsRemaining = sessions - 1
    Emit: payment:confirmed to kiosk

GET /api/checkin/packages/[venueCode]
  Public
  Returns all active packages for venue
  Used by: kiosk + Zalo page

POST /api/staff/subscriptions/packages
  Auth: staff
  Body: package fields
  Creates new package

PUT /api/staff/subscriptions/packages/[id]
  Auth: staff
  Body: updated fields
  Updates package

DELETE /api/staff/subscriptions/packages/[id]
  Auth: staff
  Sets isActive: false
  Does not cancel active subscriptions

POST /api/staff/subscriptions/packages/create-defaults
  Auth: staff
  Creates 3 default packages for venue
  if none exist
  Returns: created packages

GET /api/staff/boss-dashboard/today
GET /api/staff/boss-dashboard/history
GET /api/staff/boss-dashboard/sessions
GET /api/staff/boss-dashboard/session/[id]
GET /api/staff/boss-dashboard/session/[id]/export
  All auth: staff
  Same logic as previous /api/owner/* endpoints
  Just moved under /api/staff/ namespace

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
UPDATED DATABASE SCHEMA
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

REMOVE from previous schema:
  Fixed type enum on SubscriptionPackage
  Wristband/queueNumber references
    in subscription context

ADD to SubscriptionPackage:
  perks  String?  // free text, max 200 chars

ADD CheckInPlayer model (as above)
ADD CheckInRecord model (as above)

UPDATE PlayerSubscription:
  Remove: queueNumber reference
  Keep: playerId linked to CheckInPlayer

UPDATE PendingPayment:
  Remove: queueNumber reference
  Add: checkInPlayerId String?

Run prisma migrate.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DO NOT CHANGE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  CourtFlow rotation module entirely:
    Face recognition (AWS Rekognition)
    TV display
    Queue management
    Court assignment
    Ranking system
    TV tablet queue join
    CourtFlow Player model

  Staff court dashboard
  Session open/close logic
  Existing socket infrastructure

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SUMMARY — ALL CHANGES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CHANGE 1 — PACKAGES:
  Fully editable (create/edit/delete)
  "Create packages for me" auto-creates 3
  Perks text field added
  Price always editable

CHANGE 2 — NO WRISTBAND/FACE:
  Player identified by phone number
  Name + phone + gender + level only
  Phone lookup replaces face scan
  in check-in module

CHANGE 3 — INDEPENDENT MODULE:
  Check-in + payment + subscription
  fully decoupled from CourtFlow rotation
  Session deducted at check-in (payment)
  not at TV tablet scan
  Separate models: CheckInPlayer,
  CheckInRecord

CHANGE 4 — BOSS DASHBOARD:
  Moved to staff profile menu
  No separate owner login
  Any staff can access
  Route: /staff/dashboard/boss

CHANGE 5 — SUBSCRIBE IN FLOW:
  Offer packages after identification
  both in new + returning player flows
  [Skip] always available
  First session included in package
  when subscribing at check-in

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FILES TO CREATE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE:
  /app/staff/subscriptions/page.tsx
  /app/staff/dashboard/boss/page.tsx
  /app/subscribe/[venueCode]/page.tsx
  /components/checkin/PhoneLookup.tsx
  /components/checkin/RegistrationForm.tsx
  /components/checkin/SubscriptionOffer.tsx
  /components/checkin/PaymentScreen.tsx
  /components/checkin/SuccessScreen.tsx
  /components/staff/PackageCard.tsx
  /components/staff/PackageForm.tsx
  /components/staff/SubscriberList.tsx
  /api/checkin/identify/route.ts
  /api/checkin/register/route.ts
  /api/checkin/pay-session/route.ts
  /api/checkin/packages/[venueCode]/route.ts
  /api/staff/subscriptions/packages/route.ts
  /api/staff/subscriptions/packages/[id]/route.ts
  /api/staff/subscriptions/packages/
    create-defaults/route.ts
  /api/staff/subscriptions/subscribers/route.ts
  /api/staff/boss-dashboard/today/route.ts
  /api/staff/boss-dashboard/history/route.ts
  /api/staff/boss-dashboard/sessions/route.ts
  /api/staff/boss-dashboard/
    session/[id]/route.ts
  /api/staff/boss-dashboard/
    session/[id]/export/route.ts
  /api/webhooks/sepay/route.ts
  /lib/payment-reference.ts
  /lib/subscription-expiry.ts

MODIFY:
  prisma/schema.prisma
  /app/staff/profile (add menu items)
  /app/(kiosk)/entrance/page.tsx
    (update check-in flow)
  vercel.json
    (add cron job)
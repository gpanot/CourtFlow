# Product Overview

This document covers two related but distinct products: **CourtFlow** (the web platform) and **CourtPay** (the mobile app). They share the same backend and database, but they serve different purposes and audiences.

---

# CourtFlow

## What is CourtFlow?

CourtFlow is a **web-based venue operations platform for pickleball courts**. It is the central hub of the product suite — managing court queues, live session tracking, player rotations, and real-time TV displays. Staff and venue owners use CourtFlow to run the day-to-day operations of a court facility from any browser.

It is designed for pickleball venues in Southeast Asia (Vietnam-first), but the core functionality applies to any group-rotation court sport venue.

---

## Who Is CourtFlow For?

| User | Role |
|---|---|
| **Venue staff** | Manage queues, sessions, and player rotations from the staff dashboard |
| **Venue owners ("Boss")** | Monitor earnings, billing periods, memberships, and subscription analytics |
| **Players** | View their queue position, session history, and membership status |
| **TV / display** | A dedicated real-time screen showing live court and queue status to players |
| **Superadmin** | Platform-level management across all venues: billing, configuration, analytics |

---

## CourtFlow Value Propositions

1. **Court rotation on autopilot** — Queue logic handles walk-ins, group queues, rotations, and replacements. Staff manage people, not spreadsheets.
2. **Full operational visibility** — Live view of who is on court, who has paid, and what the session looks like at any moment.
3. **Player retention** — Venues can create tiered memberships and session packages to drive recurring visits and predictable revenue.
4. **Real-time player experience** — The TV display shows queue and court status so players always know where they stand without asking staff.
5. **Centralized management** — One platform manages courts, staff, players, bookings, coaching, and billing.

---

## CourtFlow Key Features

### Queue & Court Management
- Live queue with walk-in and group queuing support
- Automatic court rotation and game-end tracking
- Staff actions: replace players, call breaks, re-queue groups, warmup mode

### Session Management
- Full session lifecycle: start, track, stats, end
- Player stats, feedback collection, session history
- Payment status linked to each session

### Memberships & Packages
- Tiered membership plans with session counts and perks
- Subscription check-in deduction
- Boss dashboard: active subscriptions and revenue tracking

### TV Display
- Realtime queue and court status screen
- Designed to run on a venue-facing TV visible to all players

### Admin & Superadmin
- Venue, staff, and player management
- Coaching packages and lesson scheduling
- Court block / reservation scheduling
- Billing configuration per venue
- Usage-based invoicing (per check-in billing model)

---

## CourtFlow Business Model

CourtFlow bills venues on a **usage-based SaaS model**:
- A base rate per check-in
- Optional add-ons for subscription management and Sepay payment processing
- Weekly billing invoices aggregated per venue

Separately, venues can sell their own membership tiers and session packages to players — CourtFlow handles the tracking and deduction.

---

---

# CourtPay

## What is CourtPay?

CourtPay is a **mobile app (iOS & Android) for on-site check-in and payment management**, built specifically for venue staff and tablet kiosks. It is explicitly decoupled from CourtFlow's rotation logic — CourtPay focuses entirely on getting players checked in and payments collected quickly, whether by a staff member with a phone or via a self-service tablet at the entrance.

CourtPay consumes the same CourtFlow backend APIs but is a standalone app with its own UX optimized for in-person, fast-paced use.

---

## Who Is CourtPay For?

| User | Role |
|---|---|
| **Venue staff (phone)** | Handle check-ins, collect payments, monitor sessions from their pocket |
| **Venue owners** | View billing summaries, weekly earnings, and subscription breakdowns on the go |
| **Tablet kiosk** | Self-service station at the venue entrance — players check themselves in or pay without staff involvement |

---

## CourtPay Value Propositions

1. **Faster check-in** — Face recognition and QR-based flows get players on court in seconds, reducing front-desk queues.
2. **Payments collected at point of play** — VietQR payments go directly to the venue's bank account with real-time confirmation. No missed payments, no IOUs.
3. **Self-service at the door** — Tablet kiosk mode turns any iPad into an unmanned check-in / payment terminal, freeing up staff.
4. **Ownership visibility on mobile** — Owners get a boss dashboard with earnings, subscriptions, and billing breakdowns on their phone.
5. **Per-venue flexibility** — Feature flags let each venue enable only what they need (face recognition, subscriptions, cash, QR payments).

---

## CourtPay Key Features

### Check-In (Staff & Kiosk)
- **Face recognition** check-in (AWS Rekognition)
- **QR code / VietQR** check-in via player's phone
- **Wristband** scan option
- **Self-service kiosk** mode — player checks themselves in on a venue tablet

### Payments
- VietQR payments directly to the venue's bank account
- Cash payment tracking
- Membership / subscription deduction at check-in
- Real-time payment confirmation
- Cash flow summary and payment history

### Staff Dashboard
- Three-tab interface: **Session / Check-In / Payment**
- Venue selection (supports staff working across multiple venues)
- Session detail and history

### Boss / Owner View
- Billing period summary
- Weekly payment breakdown
- Subscription and membership analytics

### Tablet Mode
- Dedicated kiosk flow: venue select → mode select → self check-in or CourtPay payment
- No staff needed once set up

### Admin Access
- Embedded WebView of the CourtFlow web admin panel for superadmin access from mobile

---

## CourtPay Business Model

CourtPay is part of the CourtFlow platform — it does not bill separately. Venues pay CourtFlow's SaaS check-in fee, and CourtPay is the mobile tool through which those check-ins happen. The Sepay add-on billing applies when venues use QR payment processing through the app.

---

---

# How CourtFlow and CourtPay Relate

| | CourtFlow | CourtPay |
|---|---|---|
| **Form factor** | Web app (browser) | Mobile app (iOS / Android) |
| **Primary use** | Court operations, rotation, management | Check-in and payment at point of play |
| **Users** | Staff at desk, owners, players, TV display | Staff on the floor, tablet kiosk, owners on the go |
| **Rotation logic** | Yes — core feature | No — explicitly excluded |
| **Payments** | Tracks payment status per session | Handles the actual payment collection flow |
| **Backend** | Shared — same API and database | Consumes CourtFlow's REST API |
| **Real-time** | Socket.io for queue and session updates | Socket.io for payment event confirmation |

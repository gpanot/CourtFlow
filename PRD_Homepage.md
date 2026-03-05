# PRD — CourtFlow B2B SaaS Homepage

**Version:** 1.0  
**Date:** March 4, 2026  
**Author:** Product Team  
**Status:** Draft  

---

## 1. Overview

A single-page marketing homepage designed to convert **venue owners, facility managers, and recreation directors** into CourtFlow customers. The page must communicate the product's value proposition clearly, showcase core features, build trust, and drive sign-up conversions — all on one scrollable page.

**Target handoff:** Figma design → development.

---

## 2. Goals & Success Metrics

| Goal | Metric |
|------|--------|
| Communicate what CourtFlow does in < 5 seconds | Bounce rate < 40% |
| Drive sign-up conversions | CTA click-through > 8% |
| Build credibility for B2B buyers | Time on page > 90 seconds |
| Work on all devices | Mobile traffic conversion parity ±10% of desktop |

---

## 3. Target Audience

| Persona | Role | Pain Point |
|---------|------|------------|
| **Venue Owner** | Owns/operates pickleball facility | Courts sit idle, players leave frustrated |
| **Recreation Director** | Manages multi-court rec center | Can't manage rotations fairly at scale |
| **Club Manager** | Runs pickleball club programs | Skill mismatches ruin games, regulars complain |
| **Franchise Operator** | Multi-location sports business | No visibility across venues, inconsistent experience |

**Buyer mindset:** Pragmatic, ROI-driven, evaluating multiple solutions. Needs to see proof it works, understand pricing model, and trust the vendor before committing.

---

## 4. Page Structure (Top → Bottom)

### 4.1 — Sticky Navigation Bar

| Element | Details |
|---------|---------|
| **Logo** | CourtFlow wordmark + icon (left-aligned) |
| **Nav links** | Features · How It Works · Pricing · Testimonials |
| **Login button** | Text/ghost button style — mock, no action |
| **Sign Up button** | Primary CTA button — mock, no action |

**Behavior:**
- Sticky on scroll, compact on scroll-down.
- Nav links smooth-scroll to corresponding sections.
- Mobile: hamburger menu with same links + buttons.

---

### 4.2 — Hero Section

**Purpose:** Instantly communicate what CourtFlow is and why it matters.

| Element | Content |
|---------|---------|
| **Headline** | _"Stop Losing Players to Bad Rotations"_ |
| **Subheadline** | _"CourtFlow is the real-time court management platform that keeps every court full, every player happy, and your staff in control."_ |
| **Primary CTA** | "Start Free Trial" (mock button) |
| **Secondary CTA** | "Watch Demo" (mock button, links to nothing) |
| **Hero visual** | Split mockup showing: (1) TV display with court grid & timers on the left, (2) phone showing player queue view on the right. Venue environment in background (blurred or illustrated). |

**Design notes:**
- Full-viewport height on desktop.
- Visual should convey "professional venue" and "technology."
- Avoid stock photography of people playing pickleball — focus on the product screens.

---

### 4.3 — Social Proof Bar

**Purpose:** Build immediate credibility before the visitor scrolls further.

| Element | Content |
|---------|---------|
| **Stat 1** | "50+ Venues" (or placeholder) |
| **Stat 2** | "10,000+ Players Managed" |
| **Stat 3** | "< 2 min Average Court Downtime" |
| **Stat 4** | "98% Player Satisfaction" |

**Design notes:**
- Horizontal strip, contrasting background.
- Numbers should feel bold and prominent.
- Stats are illustrative/aspirational for now — will be updated with real data.

---

### 4.4 — Problem Statement Section

**Purpose:** Empathize with the buyer's pain so they feel understood.

**Headline:** _"Running Courts Shouldn't Be This Hard"_

Three pain-point cards in a row:

| Card | Icon idea | Title | Description |
|------|-----------|-------|-------------|
| 1 | Clock/hourglass | "Courts Sit Empty" | Players wait too long, courts go unused between games. You're leaving revenue on the table. |
| 2 | Angry face / scales | "Unfair Rotations" | Regulars hog courts, newcomers get frustrated. Manual rotation creates politics and complaints. |
| 3 | Clipboard chaos | "Staff Overwhelmed" | Whiteboards, clipboards, shouting names — your staff spends more time managing than serving. |

---

### 4.5 — Features Section

**Purpose:** Show what CourtFlow does through the lens of value delivered.

**Section headline:** _"Everything You Need to Run World-Class Courts"_

Six feature blocks — alternating layout (text left / visual right, then swap):

| # | Feature Title | Description | Visual placeholder |
|---|--------------|-------------|--------------------|
| 1 | **Smart Queue & Rotation** | Players join with one tap. Our algorithm assigns courts based on wait time, play history, and skill level — automatically. No clipboards. No arguments. | Phone screen showing queue position + "You're #4" |
| 2 | **Real-Time TV Display** | Mount a screen, open a browser. Courts, timers, and queue update live. Players know exactly when they're up — without asking staff. | TV mockup with court grid, colored timers (white/orange/red) |
| 3 | **Play Together Groups** | Players share a 4-character code and get assigned to the same court. Couples, friends, skill partners — they play together without hassle. | Phone showing group code "PB47" with 3 player avatars |
| 4 | **Staff Dashboard** | End a game in under 3 seconds. See every court, every player, every timer. Manage the queue, swap players, adjust skill levels — all from a phone. | Staff dashboard mockup with court cards |
| 5 | **Skill-Balanced Matching** | Max 1 skill-level gap per court. Beginners play beginners. Pros play pros. Everyone has competitive, fun games. | Visual of skill levels (Beginner → Pro) being matched on a court |
| 6 | **Multi-Venue Management** | One platform, unlimited venues. See live data across all locations. Consistent experience for players, full visibility for operators. | Admin dashboard showing multiple venue cards with live stats |

**Design notes:**
- Each block should feel scannable — short paragraph + visual.
- Icons or illustrations alongside each feature.
- Consider hover/scroll-triggered animations for Figma prototype.

---

### 4.6 — How It Works Section

**Purpose:** Reduce perceived complexity — show it's easy to get started.

**Section headline:** _"Up and Running in 15 Minutes"_

Three-step horizontal flow:

| Step | Icon idea | Title | Description |
|------|-----------|-------|-------------|
| 1 | Monitor + browser | **Set Up Your Venue** | Add your courts, set your rules, and connect a TV display — all from a browser. No hardware. No installation. |
| 2 | Phone + tap | **Players Join Instantly** | Players scan a QR code or open the app. No downloads, no accounts needed to start. One-tap check-in. |
| 3 | Play + repeat | **Courts Run Themselves** | CourtFlow handles rotation, timing, and matchmaking. Your staff monitors — the system manages. |

**Design notes:**
- Visual connector (line/arrow/dots) between steps.
- Numbers should be large and prominent (1, 2, 3).

---

### 4.7 — Testimonials / Social Proof Section

**Purpose:** Build trust through real-world validation.

**Section headline:** _"Trusted by Venues That Take Pickleball Seriously"_

Three testimonial cards:

| # | Quote (placeholder) | Attribution |
|---|-------------------|-------------|
| 1 | _"CourtFlow cut our court downtime in half. Players stay longer and come back more often."_ | Alex R., Venue Owner — Phoenix, AZ |
| 2 | _"Our staff used to dread open play nights. Now they actually enjoy them."_ | Maria S., Recreation Director — Austin, TX |
| 3 | _"We rolled it out across 4 locations in a week. The consistency is a game changer."_ | David L., Franchise Operator — Miami, FL |

**Design notes:**
- Headshot placeholders (circular avatars).
- Star ratings optional.
- Can be a carousel on mobile, grid on desktop.
- Mark as placeholder/mock content — to be replaced with real testimonials.

---

### 4.8 — Pricing Section

**Purpose:** Qualify leads and set price expectations (reduces unqualified sign-ups).

**Section headline:** _"Simple Pricing. No Surprises."_

Three pricing tiers:

| Tier | Price | Best For | Includes |
|------|-------|----------|----------|
| **Starter** | $99/mo | Single venue, up to 6 courts | Queue & rotation, TV display, staff dashboard, email support |
| **Pro** | $249/mo | Growing venues, up to 12 courts | Everything in Starter + multi-staff, analytics, priority support |
| **Enterprise** | Custom | Multi-venue operators | Everything in Pro + multi-venue dashboard, dedicated onboarding, SLA, API access |

Each card includes:
- Tier name and price
- "Best for" tagline
- Bullet list of features (5–7 per tier)
- CTA button: "Start Free Trial" for Starter/Pro, "Contact Sales" for Enterprise (all mock)

**Design notes:**
- Middle tier (Pro) visually highlighted as "Most Popular."
- Pricing is placeholder — final pricing TBD.
- Annual toggle optional (e.g., "Save 20% with annual billing").

---

### 4.9 — FAQ Section

**Purpose:** Handle objections and reduce friction before sign-up.

**Section headline:** _"Frequently Asked Questions"_

| Question | Answer |
|----------|--------|
| Do players need to download an app? | No. CourtFlow is a Progressive Web App (PWA). Players open a link or scan a QR code — works instantly on any phone browser. No app store needed. |
| What hardware do I need? | Just a TV or monitor with a web browser and internet. Any smart TV, Chromecast, Fire Stick, or old laptop works. |
| How does the rotation algorithm work? | It balances wait time, total play time, and skill level. Players who've waited longest get priority. Groups stay together. Skill gaps are kept to one level max. |
| Can I customize court rules? | Yes. Set court types (Men / Women / Mixed), game duration alerts, and rotation preferences per venue. |
| What happens if a player's phone dies? | Staff can manage any player from the dashboard — add them to queue, assign courts, or move them to break manually. |
| Is my data secure? | Yes. All data is encrypted in transit and at rest. We use industry-standard authentication and role-based access control. |
| Can I try it before committing? | Absolutely. Every plan starts with a 14-day free trial. No credit card required. |

**Design notes:**
- Accordion/collapsible style.
- Smooth expand/collapse animation.

---

### 4.10 — Final CTA Section

**Purpose:** Capture visitors who've scrolled the full page — they're warm leads.

| Element | Content |
|---------|---------|
| **Headline** | _"Ready to Fill Every Court?"_ |
| **Subheadline** | _"Join venues across the country that run smoother open play with CourtFlow. Free 14-day trial — no credit card required."_ |
| **Primary CTA** | "Start Your Free Trial" (mock button) |
| **Secondary CTA** | "Schedule a Demo" (mock button) |

**Design notes:**
- Full-width section with contrasting/dark background.
- Should feel like a confident, bold close.

---

### 4.11 — Footer

| Column 1: Product | Column 2: Company | Column 3: Support | Column 4: Legal |
|-------------------|--------------------|--------------------|-----------------|
| Features | About Us | Help Center | Privacy Policy |
| Pricing | Blog | Contact Us | Terms of Service |
| Changelog | Careers | Status Page | Cookie Policy |

**Bottom bar:**
- © 2026 CourtFlow. All rights reserved.
- Social icons: LinkedIn, Twitter/X, Instagram (mock links).

---

## 5. Global UI / UX Requirements

### 5.1 — Buttons

| Button | Style | State |
|--------|-------|-------|
| Sign Up / Start Free Trial | Primary — filled, high contrast | Mock (no action) |
| Login | Ghost/outline | Mock (no action) |
| Watch Demo | Secondary — outline or text link | Mock (no action) |
| Contact Sales | Secondary — outline | Mock (no action) |

### 5.2 — Responsive Behavior

| Breakpoint | Behavior |
|------------|----------|
| Desktop (≥1200px) | Full layout, side-by-side features, 3-column pricing |
| Tablet (768–1199px) | Stacked features, 2-column pricing, slightly smaller hero |
| Mobile (<768px) | Single column, hamburger nav, stacked everything, touch-friendly CTAs (min 48px tap target) |

### 5.3 — Brand & Visual Direction

| Element | Guideline |
|---------|-----------|
| **Color palette** | To be defined in Figma — suggest: deep navy/dark green primary, vibrant accent (orange or electric blue), clean whites |
| **Typography** | Modern sans-serif (e.g., Inter, Satoshi, or similar). Clear hierarchy: display, heading, body, caption sizes |
| **Imagery** | Product screenshots/mockups preferred over stock photography. Illustrations welcome for icons/steps |
| **Tone** | Professional but approachable. Confident, not salesy. Speaks to operators, not players |
| **Whitespace** | Generous — let sections breathe. Premium feel over information density |

### 5.4 — Accessibility

- WCAG 2.1 AA minimum.
- Color contrast ratios ≥ 4.5:1 for text.
- All images have alt text.
- Keyboard navigable.
- Focus indicators on interactive elements.

---

## 6. Content Inventory

| Asset | Status | Notes |
|-------|--------|-------|
| Logo / wordmark | Needed | Design in Figma |
| Hero product mockups (TV + phone) | Needed | Create from actual app screens |
| Feature section visuals (6) | Needed | Screenshots or stylized mockups |
| Testimonial headshots | Placeholder | Use abstract avatars until real testimonials sourced |
| Social proof stats | Placeholder | Update with real data when available |
| Pricing details | Placeholder | Finalize before launch |
| FAQ content | Draft complete | Review with support team |
| Privacy Policy / Terms | Needed | Legal review required |

---

## 7. Out of Scope (V1 Homepage)

- Blog / content hub
- Interactive demo or sandbox
- Chatbot / live chat widget
- Multi-language / i18n
- Customer login portal (separate app)
- Animated product walkthrough video (consider for V2)
- Integration marketplace page
- Case study detail pages

---

## 8. Technical Notes (for dev handoff after Figma)

- Single-page static site (can be a Next.js page or standalone HTML).
- All CTA buttons are non-functional mocks — no backend wiring needed.
- Smooth-scroll navigation between sections.
- Lazy-load images below the fold.
- Page weight target: < 2MB total.
- Lighthouse performance score target: > 90.
- SEO: proper meta tags, Open Graph, structured data for SaaS product.

---

## 9. Open Questions

1. **Pricing:** Are the placeholder tiers and prices directionally correct?
2. **Testimonials:** Do we have any real beta venue testimonials to use?
3. **Demo video:** Should "Watch Demo" link to a Loom/YouTube, or is it future scope?
4. **Analytics:** What analytics/tracking should be embedded (GA4, Mixpanel, etc.)?
5. **Domain:** Is courtflow.com / courtflow.io secured?

---

_End of PRD_

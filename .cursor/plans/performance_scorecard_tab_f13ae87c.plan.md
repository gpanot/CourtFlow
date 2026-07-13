---
name: Performance Scorecard Tab
overview: "Add a \"Performance\" tab to the Venue Analytics page (alongside the existing \"Analytics\" tab) that renders the CEO scorecard: Cash vs Revenue Recognized, Revenue/court-hour, Court Efficiency, Occupancy by source (using all CourtBlock types as distinct sources), Revenue Mix doughnut, and Channel Performance cards."
todos:
  - id: api-performance-fields
    content: "Add performance data fields to venue-analytics API route: fetch court_blocks, use bookingConfig hours for denominator, compute occupancyBySource, revenueMix, channelPerf, revenueRecognized"
    status: completed
  - id: tab-ui
    content: Add Analytics/Performance tab switcher to page.tsx header area
    status: completed
  - id: performance-tab-component
    content: Implement PerformanceTab component with all 5 scorecard sections (cash vs revenue, KPI cards, occupancy bar, revenue mix doughnut, channel cards)
    status: completed
isProject: false
---

# Performance Tab — Venue Analytics

## What changes

### 1. [`src/app/(admin)/admin/venue-analytics/page.tsx`](src/app/(admin)/admin/venue-analytics/page.tsx)
- Wrap existing content in an **"Analytics"** tab
- Add a **"Performance"** tab that renders the new scorecard sections

### 2. [`src/app/api/admin/venue-analytics/route.ts`](src/app/api/admin/venue-analytics/route.ts)
- Fetch `court_blocks` for the period
- Fetch venue `settings.bookingConfig` to get `bookingStartHour` / `bookingEndHour` for real available-hours denominator
- Return new `performance` object

---

## Data model clarifications

### Available hours denominator
From `settings.bookingConfig.bookingStartHour` (default 8) and `bookingEndHour` (default 22) → 14 h/court/day (instead of current hardcoded 12).

### Court Occupancy by Source (hours breakdown)
All sources occupy court time. **No double-counting** — they physically can't overlap on the same court:

| Source | Where data comes from |
|---|---|
| Walk-in / bookings | `bookings` with `status=confirmed/completed` |
| Coaching | `coach_lessons` with `courtId != null` and `status=confirmed/completed` |
| Maintenance | `court_blocks` with `type=maintenance` |
| Private event | `court_blocks` with `type=private_event` |
| Private comp | `court_blocks` with `type=private_competition` |
| Competition | `court_blocks` with `type=competition` |
| Open play (block) | `court_blocks` with `type=open_play` |
| Alobo | `court_blocks` with `type=alobo` |
| Program pass | `court_blocks` with `type` = program pass block (user clarified that program passes create CourtBlocks) |

Court efficiency % = (sum of all above hours) / available hours × 100

### Revenue Recognized vs Cash Collected
- **Cash collected** = `bookingRevenue` + `openPlayRevenue` + `courtPayRevenue` + `lessonRevenue` + `openBillCollected` + `programPassRevenue` (already computed as `totalRevenue`)
- **Revenue recognized** = Cash collected + `openBillAccrued` (open/issued/overdue bills that haven't been paid yet)
- Outstanding = recognized − collected (= open bill accrued unpaid portion)

### Revenue Mix by channel
- Court bookings (cash bookings revenue)
- Program passes (program pass payments)
- Coaching (lesson revenue)
- Open play (open play registration revenue)
- Memberships (MRR)

### Revenue / court hour
= `totalRevenue` ÷ `totalBookedHoursAllSources` (all sources: bookings + coaching + blocks)

---

## New API fields to add to `venue-analytics` response

```ts
performance: {
  cashCollected: number;           // = totalRevenue (already exists)
  revenueRecognized: number;       // cashCollected + openBillAccrued
  outstanding: number;             // revenueRecognized - cashCollected
  collectedPct: number;            // cashCollected / revenueRecognized * 100
  revenuePerCourtHour: number;     // totalRevenue / totalAllSourceHours
  courtEfficiencyPct: number;      // totalAllSourceHours / totalAvailableHours * 100
  totalAvailableHours: number;     // courts × (endHour-startHour) × days
  occupancyBySource: {
    source: string;                // "walk_in" | "coaching" | "maintenance" | etc.
    label: string;                 // Display label
    hours: number;
    pct: number;
    color: string;
  }[];
  revenueMix: {
    channel: string;
    label: string;
    revenue: number;
    pct: number;
    color: string;
  }[];
  channelPerf: {
    courtBookings: { revenue: number; bookings: number; avgPerBooking: number };
    programPasses: { revenue: number; unpaidCount: number };
    coaching: { revenue: number; lessons: number; avgPerLesson: number };
    openPlay: { revenue: number; registrations: number; paidCount: number; unpaidCount: number };
  };
  players: { total: number; newInPeriod: number };
}
```

---

## Tab structure in `page.tsx`

```tsx
// Two tab buttons: "Analytics" | "Performance"
const [tab, setTab] = useState<"analytics" | "performance">("analytics");

// Existing content wrapped in: {tab === "analytics" && <...existing...>}
// New content: {tab === "performance" && <PerformanceTab data={data} />}
```

The `PerformanceTab` component (defined in the same file or extracted to a sibling component file) renders:
1. **Cash vs Revenue** bar + legend (collected %, outstanding VND + label "open bill accounts")
2. **Three KPI cards**: Revenue/court-hour (with % vs last period), Court Efficiency (hrs booked / available), Players (total + new this month)
3. **Court Occupancy by Source** — stacked horizontal bar + legend (all block types shown)
4. **Revenue Mix by Channel** — doughnut chart (uses `<canvas>` via `recharts` PieChart, already imported)
5. **Channel Performance** — 2×2 grid of cards (Court bookings, Program passes, Coaching, Open play)

Colors match the HTML mockup:
- Walk-in: `#2a78d6`
- Coaching: `#eda100`
- Program passes / private: `#4a3aa7`
- Open play: `#1baf7a`
- Maintenance / blocked: `#898781`

---

## Key decisions confirmed

- Maintenance **counts as "used" hours** (numerator of efficiency), shown as its own segment
- Available hours use real venue `bookingStartHour`/`bookingEndHour` from `settings.bookingConfig`
- Program pass court hours come from `CourtBlock` type (user confirmed program passes create blocks)
- All `CourtBlock` types are shown; they can be grouped by type or shown individually
- Revenue recognized = cash + open-bill accrued; both figures shown side-by-side

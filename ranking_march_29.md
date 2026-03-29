Implement a player ranking system that builds 
accurate relative skill scores through staff 
observation over multiple games.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
OVERVIEW
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Staff watches players on court and ranks them 
1st to 4th after observing a game.
The algorithm uses these rankings to build 
a running score per player that improves 
court matching over time.

No DUPR. No external data. 
Just staff observation → score adjustment → 
better court assignments.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ELIGIBILITY (COURT STATE)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

There is no separate “warmup” rule for ranking.

A court qualifies for the ranking banner and for
POST /rank when:
  - Court.status === "active"
  - The current open CourtAssignment has exactly
    four players (playerIds.length === 4)

Elapsed “game running” time uses
CourtAssignment.startedAt for that assignment.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PART 1 — DATABASE CHANGES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. Add to Player model in schema.prisma:

rankingScore    Int     @default(200)
rankingCount    Int     @default(0)
lastRankedAt    DateTime?

rankingScore default values by declared skillLevel
when a player is created:
  beginner     → 100
  intermediate → 200
  advanced     → 300
  pro          → 350

(Prisma @default(200) is a fallback; application
must set rankingScore from skillLevel on create.)

2. Create new model PlayerRanking:

model PlayerRanking {
  id            String   @id @default(cuid())
  playerId      String   @map("player_id")
  courtId       String   @map("court_id")
  sessionId     String   @map("session_id")
  staffId       String   @map("staff_id")
  position      Int      // 1 = best, 4 = weakest
  scoreDelta    Int      @map("score_delta")
  createdAt     DateTime @default(now()) @map("created_at")

  player Player       @relation(fields: [playerId], references: [id], onDelete: Cascade)
  court  Court        @relation(fields: [courtId], references: [id], onDelete: Cascade)
  session Session     @relation(fields: [sessionId], references: [id], onDelete: Cascade)
  staff   StaffMember @relation(fields: [staffId], references: [id], onDelete: Cascade)

  @@index([sessionId, courtId])
  @@index([sessionId, courtId, createdAt])
  @@map("player_rankings")
}

3. Back-relations: Player, Court, Session, StaffMember
   each include playerRankings PlayerRanking[]

4. Run prisma migrate after schema changes.

5. Rank endpoint atomicity: use prisma.$transaction
   to update all four players and create four
   PlayerRanking rows in one transaction.

6. “Already ranked for this session on this court”:
   A court is considered ranked for the current
   assignment when at least one PlayerRanking row
   exists for (sessionId, courtId) with
   createdAt >= assignment.startedAt
   (same four players are on court until game ends).

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PART 2 — SCORING LOGIC
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Score deltas per position (fixed, never changes):
  1st place → +15
  2nd place → +5
  3rd place → -5
  4th place → -15

Score boundaries (clamp, never exceed):
  Minimum score: 50   (floor — prevents runaway negative)
  Maximum score: 450  (ceiling — prevents runaway positive)

  newScore = Math.max(50, Math.min(450, currentScore + delta))

Create src/lib/ranking.ts with:

export function getScoreDelta(position: number): number
export function clampScore(score: number): number
export function initialRankingScoreForSkillLevel(skillLevel: SkillLevel): number

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PART 3 — API ENDPOINT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Create src/app/api/courts/[courtId]/rank/route.ts

POST — staff submits ranking for a court.

Request body:
{
  sessionId: string,
  rankings: [
    { playerId: string, position: number },  // position 1-4
    ...
  ]
}

Validation:
- Require auth (staff or admin only); staffId from session
- rankings must have exactly 4 entries
- positions must be 1, 2, 3, 4 — no duplicates
- all playerIds must match the current open assignment’s
  playerIds for this court
- court must be status "active" and assignment must have 4 players
- reject duplicate submit: any PlayerRanking for this
  sessionId+courtId with createdAt >= assignment.startedAt
- optional: also reject second POST within 5 minutes for
  same court+session (belt and suspenders)

Logic (inside $transaction):
1. Validate request
2. For each player in rankings:
   a. scoreDelta = getScoreDelta(position)
   b. newScore = clampScore(currentScore + delta)
   c. Update player: rankingScore, rankingCount++, lastRankedAt
   d. Create PlayerRanking row

3. Return { success, updates: [...] }

4. emitToVenue(venueId, "rankings:updated", { courtId })
   Also emit court:updated / queue:updated as needed so UI refreshes.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PART 4 — NOTIFICATION BANNER (STAFF DASHBOARD)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Placement: directly below the tab bar, above the court grid,
on the Courts tab (implemented in staff dashboard).

Show the banner when there is at least one court where:
  - Court status = active
  - Current assignment has exactly 4 players
  - Elapsed since assignment.startedAt > 4 minutes
  - At least 2 of those 4 players have rankingCount < 3
  - Not yet ranked for this assignment (see Part 1 §6)

UI:
  Amber/orange background, warning icon
  “Ranking:” + one tappable pill per court + chevron
  Tapping a pill or the banner opens the rank bottom sheet
  for that court (or first court).

Refresh: prefer socket events (rankings:updated, court:updated);
polling (e.g. every 30s) optional fallback.

No manual dismiss — banner clears when no court qualifies
(ranked, game ended, or conditions no longer met).

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PART 5 — RANK BOTTOM SHEET UI
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Trigger: staff taps a court pill in the banner
         OR taps the banner / chevron (first court)

Do NOT add a Rank button on court cards.

Bottom sheet shows 4 players in current order.
Staff reorders best → worst (▲▼ or drag).

Each row: avatar, name, session display, rankingScore (muted),
declared level badge, reorder controls.
Position styling: 1st gold, 2nd silver, 3rd bronze, 4th grey.

[Save Ranking]  [Skip]
Save → POST rank API. Skip → close, no API call.

After save: brief success, close after ~1.5s.

Component: src/components/rank-bottom-sheet.tsx

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PART 6 — COURT ASSIGNMENT ALGORITHM UPDATE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Implementation file: src/lib/algorithm.ts (not a separate
court-assignment module).

Constants: src/lib/constants.ts (e.g. RANKING_POOL_SIZE = 8,
RANKING_MAX_GAP_SOFT = 80).

When selecting 4 players from the waiting queue:
  - Consider the first RANKING_POOL_SIZE (8) candidates
    in FIFO order (same ordered list as today).
  - Among valid pickleball gender foursomes in that pool,
    prefer the group of 4 that minimizes the maximum pairwise
    gap in rankingScore (tie-break with existing mix + FIFO
    skip penalty).
  - If the best such group has max gap > 80, log a warning
    but still assign that best group.
  - If no valid foursome exists in the pool of 8, fall back
    to searching the full QUEUE_LOOKAHEAD window (30) with
    the existing gender/mix/FIFO logic (no ranking objective).

Priority = minutes_waiting - total_play_minutes is unchanged
where already used; grouping adds ranking proximity as a
soft objective after gender (see Part 7).

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PART 7 — GENDER + RANKING COMBINED
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Order of constraints:
  1. Gender constraint (hard)
  2. Ranking score proximity (soft, within pool)
  3. Wait time / mix / FIFO (existing penalties)

If gender makes balance impossible, assign anyway;
log gap; do not violate court gender rules.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PART 8 — STAFF DASHBOARD — SCORE DISPLAY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

In the queue list (queue-panel), show a small bar per player:
  ~40px wide, ~4px tall, fill = score/450
  Colors: 50–149 amber, 150–249 blue, 250–450 green

Do not expose rankingScore on player-facing APIs or UI.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DO NOT ADD
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

No rank button on court cards
No separate ranking tab or screen
No ranking history UI for staff
No raw ranking score on court cards

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DO NOT CHANGE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

- Existing check-in flow
- Face recognition logic
- Payment or session management
- Queue entry creation or removal patterns
- TV display logic
- Any player-facing screens

(Socket: may add one new event name rankings:updated;
existing emit patterns stay the same.)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SUMMARY OF FILES TO CREATE / MODIFY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE:
  src/lib/ranking.ts
  src/app/api/courts/[courtId]/rank/route.ts
  src/components/rank-bottom-sheet.tsx
  prisma/migrations/<timestamp>_add_player_ranking

MODIFY:
  prisma/schema.prisma
  src/lib/algorithm.ts
  src/lib/constants.ts
  src/app/(staff)/staff/dashboard.tsx
  src/components/queue-panel.tsx
  src/lib/api-client.ts (if needed for rank POST)
  Any player-create paths to set rankingScore from skillLevel
  hooks/use-socket or dashboard listeners for rankings:updated

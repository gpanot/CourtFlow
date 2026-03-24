# Game balance algorithm (CourtFlow)

This document describes how **fairness and balance** are defined and applied in the CourtFlow codebase. The implementation lives primarily in `src/lib/algorithm.ts`, with tunable numbers in `src/lib/constants.ts`.

## 1. Goals (what “balance” means here)

CourtFlow balances several concerns when filling a **4-player** court:

| Concern | Mechanism |
|--------|-----------|
| Comparable skill on the same court | **Skill gap constraint** (see §3) — enforced when **replacing** a player mid-game |
| Men’s / women’s / mixed sessions | **Game type** derived from player genders, optional **session mix targets** |
| Fair queue order | **FIFO** ordering by `joinedAt`, with limited **lookahead** when optimizing mix |
| Friends together | **Groups** (2–4 players) filled with solos from the front of the queue |

Product copy elsewhere may also mention **total play time** in rotation; that field exists on queue entries but is **not** used in the rotation scoring functions in `algorithm.ts` today.

---

## 2. Constants (tuning knobs)

Defined in `src/lib/constants.ts`:

| Constant | Value | Role |
|----------|--------|------|
| `COURT_PLAYER_COUNT` | 4 | Players per court |
| `MAX_SKILL_GAP` | 1 | Maximum allowed difference between **skill indices** for any pair on court (when the check runs — see §3) |
| `QUEUE_LOOKAHEAD` | 30 | How many waiting entries are considered for combinations / replacement scans |
| `MIN_GROUP_SIZE` | 2 | Smallest group size considered for “group + fill” |
| `SKILL_LEVELS` | `beginner` → `intermediate` → `advanced` → `pro` | Ordinal scale; `getSkillIndex()` maps to 0–3 |

Session **game type mix** targets (percentages for men’s / women’s / mixed) are stored on the session and typed as `GameTypeMix` in `algorithm.ts` (`men`, `women`, `mixed` as weights, normalized when scoring).

---

## 3. Skill balance

### 3.1 Definition

- Each player has a **skill level** (Prisma `SkillLevel`), one of the four levels above.
- The **skill index** is the position in `SKILL_LEVELS` (0–3).
- For a set of players, the algorithm checks **every pair** \((i, j)\):  
  \(\lvert \text{index}(i) - \text{index}(j) \rvert \le \texttt{MAX\_SKILL\_GAP}\).

So with `MAX_SKILL_GAP = 1`, a court may have at most **one step** between the weakest and strongest player on the ordinal scale (e.g. beginner + intermediate is allowed; beginner + advanced is not).

### 3.2 Where it is enforced in code

- **`checkSkillBalance()`** in `algorithm.ts` implements the pairwise rule.
- It is used in **`findReplacement()`** only: when a player leaves mid-game, waiting **solo** players are scanned in FIFO order (within the lookahead window). The **first** candidate that keeps the court skill-balanced is pulled in.

**Important:** The main rotation path (`runRotation` → `selectBestFour` / `findGroupWithFill`) **does not** call `checkSkillBalance` today. So new games started from the queue are **not** filtered by skill gap in the current implementation—only **substitutions** are.

---

## 4. Game type (men’s / women’s / mixed)

**`deriveGameType()`** sets the game type for a foursome:

- All players `male` → `men`
- All players `female` → `women`
- Otherwise → `mixed`

This type is stored on the `courtAssignment` and used for analytics and mix targeting.

### 4.1 Pickleball gender foursomes (enforced)

Rotation and replacements require a **valid** foursome before assigning:

- **4 men** → men’s game  
- **4 women** → women’s game  
- **2 men + 2 women** → mixed (true doubles-style mixed)

**Not allowed:** 3 men + 1 woman or 3 women + 1 man (and any other split). The algorithm only considers combinations of four that satisfy the rule above, within the solo lookahead window. That usually means the “odd” person out **stays in the queue** while a valid foursome is built from deeper positions (e.g. three men and one woman at the front → take four men if a fourth man exists later in the window).

If a player has `gender: other`, the strict 2/2 or 4/0 check is **skipped** for that foursome so rare profiles do not deadlock the queue.

Implementation: **`isValidPickleballGenderFoursome()`** in `algorithm.ts`.

---

## 5. Session game-type mix targets

If the session has a **game type mix** target (`GameTypeMix`), the algorithm tries to pick a foursome whose implied game type **moves session-wide percentages** toward those targets.

### 5.1 Counting “current” mix

`getSessionGameTypeCounts()` counts completed assignments in the session with `isWarmup: false`, by `gameType`. Warmup games do not count.

### 5.2 Scoring a proposed game

`scoreMixDeviation(proposed, current, target)`:

1. Normalize target weights (`target.men + target.women + target.mixed`; if zero, deviation is 0).
2. Simulate adding one game of type `proposed` and compute the percentage of each type **after** that game.
3. Sum absolute differences between **actual %** and **target %** for men’s, women’s, and mixed.

**Lower score = closer to target.** This is a simple L1 deviation in percentage space, not a solver—good enough for picking among 4-player combinations.

---

## 6. Selecting four solo players: `selectBestFour`

Input: solo queue candidates (ordered by `joinedAt`), current game-type counts, optional mix target.

- Consider all **4-combinations** from the first `QUEUE_LOOKAHEAD` solo candidates (nested loops over indices `a < b < c < d`).
- **Discard** any combination that fails `isValidPickleballGenderFoursome` (§4.1).
- For each remaining combination:
  - `mixScore` = `scoreMixDeviation` when a session mix target exists; otherwise `0`.
  - **Skip penalty**: positions `a,b,c,d` are 0-based indices into the solo list. Perfect FIFO at the head is `0,1,2,3` (average index 1.5). Penalty = `(avgIndex - 1.5) * 2`.
  - **Total score** = `mixScore + skipPenalty`; minimize total score.

If **no** valid combination exists in the window, `selectBestFour` returns **null** and this court does not start a game on that rotation pass.

---

## 7. Groups: `findGroupWithFill`

- Candidates are partitioned by `groupId`; solos have `groupId: null`.
- Groups with size between `MIN_GROUP_SIZE` (2) and `COURT_PLAYER_COUNT` (4) are considered.
- Groups are sorted by the **earliest** `joinedAt` among members (group “position” in line).
- For each group: if it already has 4 members, they must pass **`isValidPickleballGenderFoursome`**; otherwise the group is skipped.
- If the group needs **solo fill**, **`findBestFillForGroup`** tries every combination of `slotsNeeded` solos from the first `QUEUE_LOOKAHEAD` solos and picks the fill that minimises the same FIFO skip penalty as `selectBestFour` (average index in the full ordered queue). Only fills that satisfy §4.1 are considered.

---

## 8. Choosing between “group path” and “solo path” in `runRotation`

1. Build `fullGroup` = result of `findGroupWithFill` (if any).
2. Build `soloSelection` = `selectBestFour` on **only** solos (with mix scoring if target set).
3. If **both** exist: compare **FIFO position**:
   - Group: `min(joinedAt)` across members.
   - Solo selection: `min(joinedAt)` across the four chosen solos.
   - Whichever is **earlier** wins; ties favor the group path if `<=` is used for the group side (group wins when positions are equal).

If only one path is valid, that path is used.

---

## 9. Replacement (`findReplacement`)

Used when someone leaves an **in-progress** game:

1. Load current on-court players (excluding departed IDs).
2. Scan waiting **solos** in `joinedAt` order, up to `QUEUE_LOOKAHEAD`.
3. For each candidate, form a temporary foursome with remaining players + candidate and run **`checkSkillBalance`** and **`isValidPickleballGenderFoursome`**.
4. First candidate that passes both updates the assignment and queue status.

Game-type mix targets are **not** applied in this path—only skill and gender composition relative to who is already on court.

---

## 10. Warmup flow (not competitive balance)

`assignToWarmup` places players on warmup courts; assignments use `gameType: "mixed"` and `isWarmup: true`. Warmup transitions are time-driven (`WARMUP_DURATION_SECONDS`, `AUTO_START_DELAY_SECONDS`). This path is about **court utilization and flow**, not the same “balance” scoring as rotation.

---

## 11. Summary table

| Stage | Skill gap rule | Gender foursome (§4.1) | Mix target | FIFO |
|-------|----------------|--------------------------|------------|------|
| New game from queue (`runRotation`) | Not applied | Yes | Yes, when session has targets | Yes, with skip penalty |
| Group + fill | Not applied | Yes | N/A | Same skip penalty for fill |
| Mid-game replacement | Yes (`MAX_SKILL_GAP`) | Yes | No | Yes (scan solos in order) |

---

## 12. References

- Implementation: `src/lib/algorithm.ts`
- Constants and skill index: `src/lib/constants.ts`
- Related product context: `PRD_System_Overview.md`, `COURTFLOW_PRODUCT_OVERVIEW.md`

If you extend rotation to enforce skill balance for **new** games, the natural place is after building candidate foursomes (filter or add a term to the same scoring loop used in `selectBestFour`) and optionally when validating `findGroupWithFill` results.

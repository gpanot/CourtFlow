# CourtFlow — Game Balance: Mixed, Men & Women

How the rotation algorithm decides the **game type** (Men / Women / Mixed) for each court, and how staff controls the balance.

---

## How Game Type Is Determined

Every time 4 players are assigned to a court, the system derives the game type from their genders:

| Composition | Game Type |
|-------------|-----------|
| All male | **Men** |
| All female | **Women** |
| Any mix of male + female | **Mixed** |

There is no manual game-type selection — it is always computed from who ends up on the court. Players have no individual preference toggle; the venue controls the balance.

---

## Default Behavior — FIFO (No Target Mix Set)

With no target mix set by staff, the algorithm uses **strict FIFO**: the first 4 people in the queue play together, regardless of gender.

In a typical session with roughly equal men and women, this naturally produces **mostly Mixed games**, because a random draw of 4 from a blended queue will usually contain both genders.

> **Rule of thumb:** If your queue is 60% male / 40% female, expect roughly **70–80% Mixed**, **15–25% Men**, and **0–5% Women** games — simply because 4 women in a row is statistically rare.

This is the right default for most casual open-play sessions.

---

## Staff Target Mix — The Control Lever

Staff can set a **Game Type Mix** target for the session — a ratio like `Men 2 : Women 1 : Mixed 3`. The algorithm then:

1. Looks at all possible 4-player combinations in the top 30 of the queue
2. Scores each combination on how well its resulting game type moves the session toward the target ratio
3. Adds a **FIFO penalty** so it doesn't skip too far down the queue
4. Picks the best-scoring combination

This is the **only lever that controls game balance**, and it is intentionally in the hands of staff — not individual players.

### Presets for Staff

To make this effortless, the staff dashboard offers one-tap presets when opening or adjusting a session:

| Preset | Ratio | When to use |
|--------|-------|-------------|
| **All Mixed** | Men 0 : Women 0 : Mixed 1 | Default co-ed open play |
| **Balanced** | Men 1 : Women 1 : Mixed 2 | Venue wants variety — some single-gender, mostly mixed |
| **Men's Session** | Men 1 : Women 0 : Mixed 0 | Men's night or league |
| **Women's Session** | Men 0 : Women 1 : Mixed 0 | Women's night |
| **Custom** | Staff sets sliders | Full control for any situation |

Staff taps one button. The algorithm does the rest.

---

## Why No Player Preference Toggle?

We deliberately removed the "Same Gender" preference from the player app. Here's why.

### The problem with individual preferences

If players can toggle "same gender" as a preference, a predictable pattern emerges: a large chunk of men will enable it permanently. In a typical session (60% male / 40% female), if even 50% of men lock in "same gender":

**Session: 20 players — 12 men, 8 women**
6 men have "same gender" enabled.

| Court | Players | Game Type | Problem |
|-------|---------|-----------|---------|
| Court A | 4 same-gender men | **Men** | Preference honored |
| Court B | 2 same-gender men + 2 no-pref men | **Men** | Drags no-pref men into men-only |
| Court C | 4 remaining men | **Men** | No men left for mixed |
| Court D | 4 women | **Women** | Only women remain |
| Court E | 4 women | **Women** | Only women remain |

**Result: 3 Men, 2 Women, 0 Mixed.** Zero mixed games in a co-ed session with 20 players. The preference toggle lets a minority of players hijack the balance for everyone. Even a staff target mix can't fix it if the preference acts as a hard filter — the algorithm can't put those men in mixed games.

### The cleaner design

- **No player toggle** — no over-promising, no cascade effect, no social friction
- **Staff target mix** — the venue decides the vibe, staff adjusts based on who's actually in the room
- **Players choose which session to attend** — if a venue runs "Men's Night" on Thursdays, men who want same-gender play show up Thursday. That's a clearer contract than a toggle that fights the algorithm.

---

## Examples

### Example 1 — Casual Evening, No Target

**Queue (12 players):**
Jake (M), Tom (M), Lisa (F), Sam (M), Ana (F), Mike (M), Sara (F), Dave (M), Kim (F), Rob (M), Jen (F), Pat (M)

**Staff target mix:** None (pure FIFO)

| Court | Players Assigned | Game Type |
|-------|-----------------|-----------|
| Court A | Jake, Tom, Lisa, Sam | **Mixed** |
| Court B | Ana, Mike, Sara, Dave | **Mixed** |
| Court C | Kim, Rob, Jen, Pat | **Mixed** |

**Result:** 100% Mixed. FIFO order naturally blends genders. This is the most common outcome in a co-ed session and works great for casual play.

---

### Example 2 — Staff Wants Variety (Balanced Preset)

**Queue (16 players):**
10 men, 6 women

**Staff target mix:** `Men 1 : Women 1 : Mixed 2` (Balanced preset)

The algorithm looks within the top 30 and rearranges to hit the ratio:

| Court | Players Assigned | Game Type | Notes |
|-------|-----------------|-----------|-------|
| Court A | 4 men | **Men** | Algorithm clusters men for the Men slot |
| Court B | 4 women + 2 men nearby swapped | **Women** | Clusters women — only 6 available, 4 fit here |
| Court C | 2 men + 2 women | **Mixed** | On target |
| Court D | 2 men + 2 women | **Mixed** | On target |

**Result:** 1 Men, 1 Women, 2 Mixed. Staff gets the balance they wanted. The 2 extra men who couldn't fit this rotation cycle re-queue and play next. Nobody waits more than one extra rotation.

---

### Example 3 — Women's Night

**Queue (14 players):**
3 men, 11 women

**Staff target mix:** `Men 0 : Women 1 : Mixed 0` (Women's Session preset)

| Court | Players Assigned | Game Type | Notes |
|-------|-----------------|-----------|-------|
| Court A | 4 women | **Women** | Target says women only |
| Court B | 4 women | **Women** | Target says women only |
| Court C | 3 women + ... | — | Only 3 women left — waits for re-queue |

The 3 men in the queue wait until staff either adjusts the target or opens a court for mixed play. In practice, staff would notice and switch to **Balanced** or **All Mixed** to get everyone playing.

**Result:** Staff controls the theme. The algorithm follows. Men aren't excluded by a bug — the venue chose this session type.

---

## Priority Hierarchy

```
1. Staff Target Mix     — venue controls the experience
2. FIFO Fairness        — nobody skipped more than necessary
```

There is no third layer. The venue decides the balance; the algorithm optimizes within that constraint while keeping wait times fair.

---

## Summary

| Control | Who | What it does |
|---------|-----|-------------|
| **FIFO (default)** | Automatic | First 4 in queue play — mostly Mixed in a co-ed crowd |
| **Staff Target Mix** | Staff per session | Steers the ratio with one-tap presets or custom sliders |
| **Themed Sessions** | Venue scheduling | "Men's Night", "Women's Night" — players self-select by showing up |

**Key design principle:** The venue controls the game balance. Players choose which sessions to attend. No individual toggle can override what the venue has decided.

---

## V2 — Planned Enhancements

### Preference as Informational Signal (Not Algorithm Input)

Re-introduce a **read-only preference** in the player profile — but it does **not** feed into the algorithm. Instead:

- Players can indicate "I generally prefer same-gender games" in their profile
- Staff sees **aggregated preference data** on the queue dashboard:
  `"8 of 14 men prefer same-gender · 2 of 6 women prefer same-gender"`
- This helps staff **choose the right preset** — if most men want same-gender, staff might set Balanced (1:1:2) instead of All Mixed
- The algorithm itself never sees the preference. Staff makes the call with the information.

**Why this works:** It gives players a voice without giving them a veto. Staff sees the crowd's mood and adjusts. The algorithm stays clean and predictable.

### Auto-Suggested Target Mix

Once enough players have joined the queue (e.g., 8+), the system could **auto-suggest** a target mix based on the gender composition:

| Queue Composition | Suggested Preset |
|-------------------|-----------------|
| 80%+ one gender | Men's/Women's Session |
| 50–80% one gender | Balanced (1:1:2) |
| Roughly even | All Mixed |

Staff gets a one-tap "Use suggested mix" prompt. They can accept, modify, or ignore it. The suggestion updates as the queue composition changes throughout the session.

### Session-Type Scheduling

Venues can pre-schedule session types in the admin panel:

- **Monday 18:00** — Open Play (All Mixed)
- **Wednesday 18:00** — Competitive Mixed (Balanced)
- **Thursday 18:00** — Men's Night (Men's Session)
- **Saturday 09:00** — Women's Morning (Women's Session)
- **Saturday 14:00** — Open Play (All Mixed)

The target mix is automatically applied when staff opens the session. Players see the session type on the home screen before they join, so they can self-select. This eliminates the need for any individual preference toggle — the schedule *is* the preference system.

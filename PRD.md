---

# PRD – Pickleball Court Management System
**Version:** 2.2 | **Status:** Final Draft — Ready for UI Design & Cursor Development

---

To make it simpler in terms of development we will use a PWA for the 4 accesses :
staff (mobile first)
player (mobile first)
TV (web/responsive)
superadmin (web/responsive)
PWA but Mobile first for the UI/UX.

## 1. Product Overview

A multi-venue, real-time court management platform for pickleball facilities. Players join a queue with one tap, optionally group up with friends, and receive push notifications telling them which court to go to. Staff controls the full court lifecycle from a fast, minimal dashboard. Large display screens show court status, live game timers, and the player queue — visible to everyone in the venue.

---

## 2. Design Philosophy

**The phone is a notification device. The TV is the game controller.**

### Player — 3 moments of interaction per game cycle
1. **Join** — tap "Join the Game" on arrival (optionally form a group)
2. **Go play** — receive push *"Court A — go play!"*, walk there
3. **After game** — receive push *"Good game! What's next?"* — one tap

Nothing else. No confirmation tap. No "game finished" button. No timers to manage.

### Staff — one clear job
Watch the courts physically. Tap "End Game" when a court empties. Rotation triggers automatically. Under 3 seconds, no dialogs for routine actions.

### Display Screen — the shared reference point
Everyone looks at the TV. Court labels match the physical signs on the walls. Shows court status, live elapsed timers, and the waiting queue.

---

## 3. Goals & Success Metrics

| Goal | Metric |
|------|--------|
| Minimize idle court time | < 2 min between rotations |
| Equal play time | Max 15% deviation per session |
| Player friction | Max 3 phone interactions per game cycle |
| Staff speed | End Game in under 3 seconds |
| Player satisfaction | ≥ 4.2/5 post-session rating |
| Social engagement | "Play Together" feature used in ≥ 20% of sessions |

---

## 4. Users & Roles

**Player** — joins queue (solo or grouped), receives court notification, plays, responds post-game. No in-game interaction required.

**Venue Staff** — opens/closes sessions, adds/removes courts live, ends games, manages individual players, handles exceptions. Sees only their venue.

**Super Admin** — cross-venue visibility, venue config, staff management, analytics across all venues.

---

## 5. Architecture

### Multi-Tenant Model
- Single backend for all venues
- All data venue-scoped (venue_id on every table)
- Player profiles global — one account across all venues
- Staff sees only their venue; Super Admin sees everything

### Tech Stack
| Layer | Choice |
|-------|--------|
| Mobile App | PWA Progressive Web APP  |
| Backend + DB | Neon (Postgres + Realtime) |
| Real-time | Neon Realtime (WebSocket) |
| Display Screen | React web app — fullscreen in any browser, any Wi-Fi screen |
| Auth | Phone OTP — no password |
| Push | Expo Push / Firebase FCM |
| Hosting | Neon + Vercel |

### Core Data Models
```
Venue
  id, name, location, active

Player
  id, name, phone, skill_level (beginner/intermediate/advanced/pro)
  gender, game_preference (no_preference/same_gender), created_at

Court
  id, venue_id, label (free text — e.g. "Court A", "7", "North")
  status (idle/active/maintenance)
  active_in_session (boolean, toggled live by staff)

Session
  id, venue_id, date, opened_at, closed_at, status

PlayerGroup
  id, session_id, code (short e.g. "PB47")
  player_ids[] (2–4 players)
  created_at, status (forming/active/disbanded)
  queue_position_reference (based on longest-waiting member)

QueueEntry
  id, session_id, player_id, group_id (nullable)
  joined_at, status (waiting/assigned/playing/on_break/left)
  break_until, total_play_minutes_today
  game_preference (no_preference/same_gender — per-session override)

CourtAssignment
  id, court_id, session_id, player_ids[4]
  started_at, ended_at, ended_by (staff_id)
  game_type (men/women/mixed)
  group_ids[] (which groups or solo players are on this court)
```

---

## 6. Core Features

### 6.1 Player Mobile App (PWA)

**Onboarding (one-time, ~60 seconds)**
Scan QR at venue → phone OTP → name, gender, skill level (with description per level) → profile saved globally.

**Home Screen**
GPS auto-detects venue or manual select. Single dominant CTA: **"Join the Game"**. Already queued: shows **"#4 in line"** or **"Group #4 in line"**.

**Queue Screen — Solo**
Position only — large: **"#4 in line"**. First names of players/groups ahead (up to 5 entries). No wait time estimate. Game preference toggle (No preference / Same gender) — defaults to profile setting, changeable per session. Options: "Leave Queue" · "Play with Friends"

**Play Together — Group Formation**
Player taps **"Play with Friends"** in queue screen:
1. App generates a short group code: **"PB47"**
2. Player shares code with friends (copy/paste or show screen)
3. Friends enter code in their own app → join the group
4. Group supports 2–4 players
5. Once group formed → all members see **"Group of 3 — #4 in line"**
6. Group moves through queue as a single unit
7. Queue position based on the member who has been waiting longest
8. Group dissolves automatically if a member leaves the queue or ends their session

**Group Constraints:**
- Max 1 skill level gap between any two players in the group (soft rule — staff can override)
- If group is 2 or 3 → algorithm fills remaining court spots with solo players matched by skill
- Group of 4 → assigned together to one court as a unit
- Group's combined play time today is factored into priority — heavily played groups wait longer, same as solo players

**Court Assigned Screen**
Push: *"Court A — go play!"* In-app: court label (large), teammates (name + skill badge + group icon if applicable), game type, countdown "Starting in 3:00". Auto-starts — no tap required. Player walks to court.

**In-Game Screen**
Court label. "You're playing — have fun!" No buttons. Staff ends the game.

**Post-Game Screen** (triggered by staff ending the game)
Push: *"Good game! What's next?"* Three large equal buttons:
- **"Re-queue Now"** — back in queue immediately (group re-queues together if all members tap)
- **"Take a Break"** — select 5 / 10 / 15 / 20 / 30 min (group members can choose independently)
- **"End Session"** — double confirmation required

**No response in 3 minutes → auto Re-queue.** Player stays in system unless they explicitly opt out. Never auto-ejected.

**Break Flow**
Timer visible in app. Push 2 min before end. Tap "I'm Back" → re-queues at fair position. No response after break ends → **auto re-queues**. "End Break Early" anytime. If in a group, each member manages their break independently — group reforms when all active members are back in queue.

**End Session**
Double confirmation: *"Are you sure? You'll be removed from today's session."* Stats saved. Can rejoin same day. If in a group → group notified that member left, group continues with remaining players (min 2 to stay a group, otherwise dissolves).

**Profile & History**
Total games, total time played across all venues. Match history: date, venue, court label, teammates. Skill level — player can update anytime. Game preference (No preference / Same gender) — optional, editable anytime. Players with gender "other" default to "No preference" only.

---

### 6.2 Staff Dashboard

**Every routine action in under 3 seconds. No confirmation dialogs for End Game.**

**Session Management**
Open Session → staff selects which courts to activate by label → TV goes live. Close Session → all players notified, queue locks, summary generated. Closing session is the only bulk-exit action.

**Court Overview — Primary Screen**
Active courts as large interactive cards: label, status color, player names (with 🔗 group icon where applicable), **elapsed game timer**. Tap court → instant action sheet.

**Primary Action — End Game**
Tap court card → **"End Game"** (one large button, no dialog) → instant. Court idles, rotation triggers, all 4 players get post-game notification. Under 3 seconds total.

**Individual Player Management**
Staff can act on any individual player from three entry points: court card, queue list, or player search.

Tap any player name → action sheet:
- **"End Player Session"** — removes from court or queue, marks as left, frees spot
- **"Move to Break"** — puts on break with custom duration (e.g. injury assessment)
- **"Adjust Skill Level"** — takes effect on next assignment, player notified

**"End Player Session" by staff — behavior:**
- If player is on a court → removed from assignment, remaining 3 players notified *"A player has left — a replacement is coming"*, next player from queue pulled in to fill the single spot
- If player is in a group on court → group notified, replacement pulled, group may dissolve if below 2
- If player is in queue → removed silently, queue reorders, group updated
- Player receives push: *"Your session was ended by staff — hope to see you soon"*
- Event logged with staff ID and reason (injury / personal / other)
- No double confirmation for staff — intentional by nature

**Dynamic Court Management Mid-Session**

Adding a court:
- Tap "Add Court" → select from venue court list
- Appears on TV as ⚫ Grey "Available" immediately
- Algorithm includes it in next rotation instantly

Removing a court:
- Tap court → "Remove from Session"
- If idle → disappears immediately
- If game in progress → staff chooses:
  - **"Wait for current game"** → greys out, no new assignments, auto-removed when done
  - **"End game now"** → players notified, returned to front of queue with priority preserved

TV grid reflows smoothly on every add/remove.

**Queue Management**
Full queue visible: position, name, skill badge, group indicator (🔗). Bump / remove / add manual player (no smartphone — name entered, staff badge shown everywhere). Staff can break a group manually if needed (injury, dispute). Manual player court confirmations done by staff from dashboard.

**Group Management**
Staff can view group composition from queue panel. Can break a group (members become solo players at their current queue positions). Can merge solo players into a group manually if requested.

---

### 6.3 Display Screen (TV / Large Screen)

Web app. Any browser, any Wi-Fi screen. No installation. Designed for 55"+ TV viewed from 5+ meters.

**Layout**
- Top bar: Venue name · Time · Session status · Active court count
- Main: Court grid — dynamic, adapts to however many courts are currently active
- Side/bottom: Queue panel — next 8–10 entries (solo players or groups)

**Court Grid**
Only active courts shown. Grid reflows automatically. Smooth animation on add/remove. No hardcoded sizes.

**Court Card**
Court label (min 72px — matches wall sign), status color, player names (🔗 icon for grouped players), elapsed timer.

**Elapsed Timer — Key Visual Signal**
| Time | Color | Meaning |
|------|-------|---------|
| 0:00 – 19:59 | White | Normal |
| 20:00 – 29:59 | 🟠 Orange | Running long |
| 30:00+ | 🔴 Red | Overdue |

No buzzer. No forced end. Color shift creates natural social pressure — visible to players on court and players waiting.

**Court Card States**
| State | Color | Content |
|-------|-------|---------|
| Active | 🟢 Green | Label, names (🔗 groups), elapsed timer |
| Starting | 🔵 Blue | Label, names, "Starting in X:XX" |
| Idle | ⚫ Grey | Label, "Available" |
| Maintenance | 🔴 Red | Label, "Out of Service" |

**Queue Panel**
Solo players: position + first name. Groups: 🔗 + "Group of 3" + member names. On break: ☕ + return countdown. Manual players: staff badge. All real-time.

**Resilience**
Disconnect → last known state + subtle "Reconnecting..." banner. Auto-reconnects. Grid reflows on court changes.

---

## 7. Rotation Algorithm

**Priority Score — Solo Player**
```
Priority = minutes_waiting_in_queue - total_play_minutes_today + skill_match_bonus
```

**Priority Score — Group**
```
Group Priority = longest_waiting_member_minutes - average_play_minutes_today (all members) + skill_match_bonus
```

Groups are treated as a single queue unit. Their position is anchored to their longest-waiting member but penalized by the group's collective play time today.

**Assignment when court becomes available:**
1. Evaluate top entries in queue (solo players and groups as units)
2. If a group of 4 is next → assign them directly to court (skill check only — group composition overrides individual game preferences since they chose to play together)
3. If a group of 2–3 is next → assign group, fill remaining spots with best-matched solo players (respecting both skill and game preference compatibility)
4. If all solo → take top 4 by priority score, checking both skill balance and game preference compatibility
5. Skill balance check — max 1 level gap between any two players on court
6. Game preference check — players with "same gender" preference only matched with players of the same gender; "no preference" players match with anyone
7. If balance impossible with top entries → look ahead up to 8 positions in queue
8. Derive game type from assigned players (all male = men, all female = women, mixed genders = mixed) — recorded on the assignment for display and analytics
9. Assign, push *"Court A — go play!"* to all 4
10. TV → 🔵 Blue, 3-min countdown
11. 3 min later → auto-start, timer 0:00, TV → 🟢 Green

**Game Preference Rules**
- Players optionally set a preference in their profile: "No preference" (default) or "Same gender"
- Preference can be changed per session from the queue screen
- Preference is best-effort — priority is still driven by wait time
- When in a voluntary group (Play Together), individual preferences are relaxed to match the group composition
- Players with gender "other" always use "No preference"

**Group Skill Constraint**
If a group's internal skill spread exceeds 1 level → staff notified on dashboard. Staff can approve the assignment anyway or break the group. Algorithm never silently violates the skill rule.

**Game End**
Staff taps "End Game" → rotation triggers → all 4 previous players get post-game notification → next entry (solo or group) assigned.

**Single Player Replacement (injury/no-show)**
When one player is removed from an active court → algorithm pulls the single best-matched solo player from queue (skill level priority) → that player notified → joins the existing 3.

---

## 8. Notifications

| Trigger | Message | Channel |
|---------|---------|---------|
| Court assigned | "Court A — go play!" | Push + in-app |
| Game ended by staff | "Good game! What's next?" | Push + in-app |
| 2 min before break ends | "Break ending soon — tap to re-queue" | Push |
| Break expired, no response | Silent auto re-queue | System |
| Removed by staff | "Your session was ended by staff — hope to see you soon" | Push |
| Player left group | "A group member has left — your group continues" | Push (remaining members) |
| Group dissolved | "Your group has been dissolved — you're now solo in queue" | Push |
| Session closing | "Today's session is ending — thanks for playing!" | Push |
| Replacement needed | "A player has left — a replacement is coming" | Push (remaining 3 on court) |

---

## 9. Venue Settings

| Setting | Default | Range |
|---------|---------|-------|
| Auto-start delay | 3 min | 1–5 min |
| Post-game re-queue timeout | 3 min | 1–5 min |
| Break duration options | 5/10/15/20/30 min | Configurable |
| GPS join radius | 200m | 50–500m |
| Max group size | 4 | 2–4 |
| Max skill gap within group | 1 level | Configurable |

---

## 10. Screen Inventory (22 screens)

**Player App — 12 screens**
| # | Screen | Key Element |
|---|--------|-------------|
| 1 | Splash | Brand, loading |
| 2 | Phone Entry | Number input, Send Code |
| 3 | OTP Verification | 6-digit input, resend after 30s |
| 4 | Profile Setup | Name, gender, skill level |
| 5 | Home / Venue Select | "Join the Game" dominant CTA |
| 6 | Queue Waiting — Solo | "#4 in line", players ahead, "Play with Friends" option |
| 7 | Play Together — Group Formation | Group code display, member list, share option |
| 8 | Queue Waiting — Group | "Group of 3 — #4 in line", members shown |
| 9 | Court Assigned | Label (huge), teammates (🔗 groups), countdown |
| 10 | In-Game | Label, "You're playing — have fun!" |
| 11 | Post-Game | Re-queue / Break / End Session |
| 12 | Profile & History | Stats, match history |

**Staff App — 5 screens**
| # | Screen | Key Element |
|---|--------|-------------|
| 13 | Staff Login | Credentials |
| 14 | Court Overview | Active courts, timers, colors, group indicators |
| 15 | Court Action Sheet | "End Game" primary · "Manage Player" secondary |
| 16 | Queue Management | Solo + groups, bump/remove/break group/add manual |
| 17 | Session Management | Open/close, add/remove courts, stats |

**Display Screen — 1 screen**
| # | Screen | Key Element |
|---|--------|-------------|
| 18 | Court Grid | Dynamic grid, timers, queue panel with groups |

**Super Admin Web — 4 screens**
| # | Screen | Key Element |
|---|--------|-------------|
| 19 | Multi-Venue Overview | All venues live |
| 20 | Venue Configuration | Court labels, settings |
| 21 | Staff Management | Add/remove staff |
| 22 | Analytics | Cross-venue stats |

---

## 11. UI/UX Design Principles

**One primary action per screen.** Single dominant button, zero decision fatigue.

**Real-time everywhere.** WebSocket on all surfaces. No stale data, no pull-to-refresh.

**Court labels match reality.** What players see on phone and TV must exactly match the physical sign on the court wall.

**Consistent color system** across all surfaces:
- 🟢 Green = Active game
- 🔵 Blue = Assigned / starting
- 🟠 Orange = Running long (20+ min)
- 🔴 Red = Overdue (30+ min) or maintenance
- ⚫ Grey = Idle
- 🔗 Link icon = Grouped players (used across app, staff dashboard, TV)

**TV legibility.** Court labels min 72px, player names min 36px, readable from 5+ meters.

**Staff speed.** No dialogs on End Game. Tap court, tap End Game, done.

**Player safety net.** No action auto-removes a player from session. Default is always to stay in the game. Only explicit double-confirmed "End Session" or staff action removes them.

**Group UX is lightweight.** Group code is the only mechanism — no friend lists, no contacts access, no accounts to link. Share a 4-character code, done.

**Dynamic layout.** TV and staff dashboard reflow gracefully when courts change. No hardcoded grid sizes.

**Offline tolerance.** Subtle banner, never blank screen, auto-reconnects.

**Accessibility.** 16px min body, 48×48px touch targets, WCAG AA contrast.

---

## 12. All Resolved Decisions

| Decision | Resolution |
|----------|------------|
| Game end | Staff only — "End Game" when court visually empty |
| Player confirmation | Removed — auto-start after 3 min |
| Wait time estimate | Removed — position only |
| Post-game default | Auto re-queue after 3 min |
| End Session | Double confirmation required |
| Break timeout | Auto re-queue (never end session) |
| Session exit | Player explicit action or staff action only |
| Court identity | Custom label (free text), matches physical sign |
| Court count | Dynamic — staff activates/deactivates live |
| Mid-session changes | Full support — add/remove with graceful TV reflow |
| Branding | Single brand, all venues |
| Auto-start window | 3 minutes |
| TV elapsed timer | White → orange at 20 min → red at 30 min |
| Individual player removal | Staff can end any player's session with reason logging |
| Single player replacement | One replacement pulled by skill match, not full rotation |
| Play Together | Group code system, 2–4 players, treated as queue unit |
| Group queue position | Anchored to longest-waiting member |
| Group priority penalty | Based on average play time of all members today |
| Group skill constraint | Max 1 level gap, staff can override |
| Game preference | Player-controlled (No preference / Same gender), not staff-controlled per court |
| Court type | Derived from assigned players (men/women/mixed), no longer set on courts |
| Group post-game | Members choose independently (re-queue / break / leave) |
| Group dissolution | Auto if below 2 members, or staff manual break |

---

## 13. Out of Scope — V1

Payment/booking, tournament mode, league standings, automated game end, per-player advanced analytics, score tracking, friend lists / persistent social graph, third-party calendar integration.

---

Full rewrite it is. Let me write all stories from scratch based on PRD v2.2.

---

# User Stories – Pickleball Court Management System
**Version:** 2.2 | **Roles:** Player · Staff · Display Screen · System
**Format:** Epics with detailed stories + Acceptance Criteria + Edge Cases

---

## EPIC 1 — Player Onboarding

### US-001 · New player registers via phone number
**As a** new player
**I want to** register with just my phone number
**So that** I can access the system quickly without a password

**Acceptance Criteria:**
- [ ] Player enters phone number → OTP via SMS within 30 seconds, 6 digits, valid 5 min
- [ ] After 3 failed OTP attempts → must request new code
- [ ] After OTP verified → prompted for name, gender, skill level
- [ ] Profile saved globally — works across all venues
- [ ] Returning player skips onboarding, goes directly to Home

**Edge Cases:**
- Wrong number entered → must restart, no account created
- Number already registered → logs in directly, no duplicate
- SMS lost → resend button available after 30 seconds

---

### US-002 · Player sets skill level
**As a** new player
**I want to** select my skill level during onboarding
**So that** I get matched with players of similar ability

**Acceptance Criteria:**
- [ ] Four levels: Beginner / Intermediate / Advanced / Pro, each with a short description to help self-assessment
- [ ] Player can update from profile at any time
- [ ] Skill level visible as badge to teammates on Court Assigned screen
- [ ] Staff can override per session from dashboard

**Edge Cases:**
- Player skips → defaults to Beginner, prompted to update on next login
- Player self-declares incorrectly → staff can correct mid-session

---

### US-003 · Returning player logs in
**As a** returning player
**I want to** open the app and be ready immediately
**So that** I don't waste time on login friction

**Acceptance Criteria:**
- [ ] Session remembered 30 days — no re-login required
- [ ] Home screen loads within 2 seconds
- [ ] If expired → phone OTP re-auth only, no password
- [ ] All profile, history, preferences preserved

---

## EPIC 2 — Player Queue Management

### US-004 · Player joins the queue
**As a** player at a venue
**I want to** join the queue with one tap
**So that** I'm in line as soon as a court is available

**Acceptance Criteria:**
- [ ] Venue auto-detected via GPS (configurable radius, default 200m) or manually selected
- [ ] "Join the Game" is the single dominant action on Home screen
- [ ] On joining: position number shown immediately — no wait time estimate
- [ ] Player cannot join queue at two venues simultaneously
- [ ] Queue position updates in real time, no manual refresh

**Edge Cases:**
- GPS unavailable → manual venue selection, staff can verify presence
- Session not yet open → shows "No active session at this venue"
- Player already in queue at another venue → error shown, must leave that queue first

---

### US-005 · Player views queue position
**As a** queuing player
**I want to** see my real-time queue position
**So that** I know where I stand without checking constantly

**Acceptance Criteria:**
- [ ] Position shown prominently: "#4 in line"
- [ ] No wait time estimate — games have no fixed duration
- [ ] First names (+ group indicators 🔗) of up to 5 entries ahead visible
- [ ] Position updates live as entries above get assigned to courts
- [ ] Groups shown as single entries: "🔗 Group of 3"

**Edge Cases:**
- Multiple courts free at once → position jumps by more than 1, updates instantly
- Player ahead takes a break → their position held or adjusted per break rules

---

### US-006 · Player leaves the queue voluntarily
**As a** queuing player
**I want to** leave the queue if I change my mind
**So that** I don't block a queue spot I won't use

**Acceptance Criteria:**
- [ ] "Leave Queue" always visible on Queue screen
- [ ] Single confirmation dialog before removing
- [ ] Removed immediately, all positions update in real time
- [ ] If in a group → group notified, group continues if ≥ 2 members remain, dissolves if only 1
- [ ] Player can rejoin queue anytime but starts at the back

**Edge Cases:**
- Player leaves queue while being assigned (race condition) → assignment cancelled, next entry pulled, player notified

---

### US-007 · Player is assigned a court
**As a** queuing player
**I want to** receive a clear notification when my court is ready
**So that** I know exactly where to go and who I'm playing with

**Acceptance Criteria:**
- [ ] Push notification immediately: *"Court A — go play!"*
- [ ] In-app screen shows: court label (large), teammates (name + skill badge, 🔗 for grouped), game type
- [ ] Countdown shown: "Starting in 3:00" — counts down to auto-start
- [ ] No confirmation tap required — player simply walks to court
- [ ] All 4 assigned players receive notification simultaneously

**Edge Cases:**
- Phone off / no signal → assignment visible immediately on next app open if within 3-min window
- Player in dead zone → sees it on opening app, game may already be starting

---

### US-008 · Game auto-starts after 3 minutes
**As a** player assigned to a court
**I want** the game to start automatically
**So that** I don't need to touch my phone just to confirm I walked to a court

**Acceptance Criteria:**
- [ ] 3-minute countdown visible on Court Assigned screen and on TV (Blue state)
- [ ] After 3 minutes → game auto-starts regardless of any player action
- [ ] TV card turns Green, timer starts at 0:00
- [ ] In-app screen switches to In-Game screen for all 4 players
- [ ] No player tap required at any point

**Edge Cases:**
- Player didn't make it to court in 3 min → game still starts, staff handles if needed
- Countdown screen dismissed → push notification sent at 30 seconds remaining

---

## EPIC 3 — Play Together (Group System)

### US-009 · Player creates a group
**As a** queuing player
**I want to** create a group so friends can join me
**So that** we get assigned to the same court together

**Acceptance Criteria:**
- [ ] "Play with Friends" option visible on Queue screen
- [ ] Tapping it generates a short group code (e.g. "PB47") — 4 characters, unique per session
- [ ] Code displayed large with a share/copy button
- [ ] Group creator sees member list updating live as friends join
- [ ] Group supports 2–4 players maximum
- [ ] Group queue position anchored to the longest-waiting member in the group

**Edge Cases:**
- Player tries to create a group while already in a group → must leave current group first
- Code expires if creator leaves queue → code invalidated, friends notified

---

### US-010 · Player joins a group via code
**As a** queuing player
**I want to** enter a group code to join my friend's group
**So that** we get assigned to the same court

**Acceptance Criteria:**
- [ ] "Join a Group" option visible on Queue screen
- [ ] Player enters 4-character code → instantly joins group if valid and group has space
- [ ] All group members notified: "[Name] joined the group"
- [ ] Player's queue entry merges into the group unit
- [ ] Group position recalculated based on longest-waiting member

**Edge Cases:**
- Invalid code → clear error message, player stays solo in queue
- Group already full (4 players) → error: "This group is full"
- Player not yet in queue → must join queue first, then join group
- Code from a different venue's session → error: "This code is not valid at this venue"

---

### US-011 · Group moves through queue as a unit
**As a** member of a group
**I want to** see my group's position in the queue
**So that** I know when we'll be assigned a court together

**Acceptance Criteria:**
- [ ] Queue screen shows: "🔗 Group of 3 — #4 in line"
- [ ] All members see the same position number
- [ ] Group treated as single queue entry — moves up as one
- [ ] TV queue panel shows group as one entry with member names
- [ ] If group is 2–3, remaining court spots filled by solo players matched by skill

**Edge Cases:**
- One member takes a break → group continues without them, noted as "Group of 2 (1 on break)"
- All members take a break → group position held until at least one returns
- Group shrinks to 1 member → automatically dissolved, player becomes solo at their current position

---

### US-012 · Group is assigned a court
**As a** group member
**I want to** receive a court assignment that includes all group members
**So that** we all play together on the same court

**Acceptance Criteria:**
- [ ] All group members receive push: *"Court A — go play!"* simultaneously
- [ ] Court Assigned screen shows all 4 players — group members with 🔗 icon
- [ ] If group is 2–3 → remaining spots filled with skill-matched solo players, shown clearly
- [ ] Group of 4 → assigned as a complete unit, no solo fill needed
- [ ] Game type (Men / Women / Mixed) shown

**Edge Cases:**
- Group's skill spread exceeds 1 level → staff notified on dashboard, staff approves or breaks group
- Solo fill player is same skill level as weakest group member → preferred

---

### US-013 · Group post-game behavior
**As a** group member after a game
**I want to** choose my next action independently
**So that** I'm not forced to stay grouped if I want to rest or leave

**Acceptance Criteria:**
- [ ] Each group member receives post-game notification independently
- [ ] Each member chooses: Re-queue Now / Take a Break / End Session — individually
- [ ] Members who all tap "Re-queue Now" → automatically re-form as a group in queue
- [ ] Members who split (some re-queue, some break) → group paused, re-forms when break members return
- [ ] If only 1 member re-queues immediately → they become solo until others return
- [ ] No response in 3 min → auto re-queues as solo, group re-evaluates when others respond

**Edge Cases:**
- All members choose "End Session" → group dissolved, no notification needed
- One member ends session → group continues with remaining members (min 2), disbanded member notified

---

### US-014 · Player leaves a group
**As a** group member
**I want to** leave the group without leaving the queue
**So that** I can continue playing solo

**Acceptance Criteria:**
- [ ] "Leave Group" option visible on Queue screen while in a group
- [ ] Confirmation dialog: "You'll become a solo player at your current queue position"
- [ ] On confirm → player becomes solo, keeps queue position
- [ ] Remaining group members notified: "[Name] left the group"
- [ ] If group drops to 1 → dissolved, remaining player becomes solo

---

## EPIC 4 — In-Game Experience

### US-015 · Player views in-game screen
**As a** player whose game has started
**I want to** see a clean in-game screen
**So that** I know the game is active without any required actions

**Acceptance Criteria:**
- [ ] Court label displayed prominently
- [ ] Message: "You're playing — have fun!"
- [ ] Teammates' names visible (with 🔗 if grouped)
- [ ] No action buttons — game ends only when staff taps End Game
- [ ] Screen stays active while game is running

---

### US-016 · Staff ends the game (primary game-end mechanism)
**As a** staff member who sees a court empty
**I want to** end the game in under 3 seconds
**So that** the next rotation triggers immediately with no delay

**Acceptance Criteria:**
- [ ] Staff taps court card → action sheet slides up instantly
- [ ] Single large primary button: "End Game" — no confirmation dialog
- [ ] On tap: court goes idle, all 4 players receive post-game push, rotation algorithm triggers
- [ ] TV card turns Grey "Available" within 1 second
- [ ] Total staff action time: under 3 seconds

**Edge Cases:**
- Staff taps by mistake → no undo for End Game (intentional — speed is priority). Next group will simply be assigned
- Two staff tap End Game simultaneously → system processes first tap only, second is ignored

---

## EPIC 5 — Post-Game & Break Management

### US-017 · Player chooses what to do after a game
**As a** player who just finished
**I want to** choose between re-queuing, taking a break, or leaving
**So that** the system knows my intentions and manages my spot accordingly

**Acceptance Criteria:**
- [ ] Post-game screen shows 3 large equal buttons: Re-queue Now / Take a Break / End Session
- [ ] No response in 3 minutes → auto Re-queue (player stays in system by default)
- [ ] Choice logged for session analytics
- [ ] Screen dismisses once choice is made

---

### US-018 · Player takes a break
**As a** player who wants to rest
**I want to** pause my queue participation for a set time
**So that** I can rest without losing my place unfairly or blocking court spots

**Acceptance Criteria:**
- [ ] Break durations: 5 / 10 / 15 / 20 / 30 min
- [ ] Break timer visible in app with countdown
- [ ] Push 2 min before end: "Break ending soon — tap to re-queue"
- [ ] Tap "I'm Back" → re-enters queue at fair calculated position (not front, not back)
- [ ] No response after break ends → **auto re-queues** (never ends session)
- [ ] "End Break Early" available anytime
- [ ] Player shown with ☕ icon on TV queue panel with return countdown

**Edge Cases:**
- Player wants to extend break → one extension allowed, max +15 min, staff can override
- Player on break when session closes → notified that session ended
- Group member on break → group continues without them, re-forms when they return

---

### US-019 · Player ends their session
**As a** player leaving the venue
**I want to** formally end my session
**So that** I'm cleanly removed and don't hold any queue spots

**Acceptance Criteria:**
- [ ] "End Session" requires double confirmation: "Are you sure? You'll be removed from today's session"
- [ ] On confirm: removed from queue or court assignment immediately
- [ ] If on court → staff notified, remaining 3 players get replacement notification
- [ ] Session stats saved: total games, total time played
- [ ] Player can rejoin same venue same day — starts at back of queue
- [ ] If in a group → group notified, group continues if ≥ 2 remain

**Edge Cases:**
- Player taps End Session by mistake → double confirmation prevents accidental exit
- Player ends session mid-game → treated same as individual player removal by staff

---

### US-020 · Player rates the session
**As a** player finishing a session
**I want to** quickly rate my experience
**So that** staff can monitor quality

**Acceptance Criteria:**
- [ ] 1–5 star rating on post-game / end-session screen
- [ ] Optional free-text comment (max 200 characters)
- [ ] Fully skippable — no friction
- [ ] Ratings visible in staff dashboard aggregated only (not per-player)

---

## EPIC 6 — Staff Court Management

### US-021 · Staff opens a session
**As a** staff member starting the day
**I want to** open a session and activate the right courts
**So that** players can start joining the queue

**Acceptance Criteria:**
- [ ] Staff taps "Open Session" → prompted to select which courts to activate from venue court list
- [ ] Selected courts appear on TV as ⚫ Grey "Available" immediately
- [ ] Queue opens — players can join
- [ ] Unselected courts not shown on TV or in algorithm
- [ ] Session start time logged

**Edge Cases:**
- Staff activates wrong court → can deactivate immediately, before any players assigned

---

### US-022 · Staff adds a court mid-session
**As a** staff member during a busy session
**I want to** add a court that wasn't initially active
**So that** more players can play and wait times reduce

**Acceptance Criteria:**
- [ ] "Add Court" button visible in session management
- [ ] Staff selects court label from venue's court list
- [ ] Court appears on TV as ⚫ Grey "Available" within 1 second
- [ ] Algorithm includes it in next rotation immediately
- [ ] Queue panel updates — players ahead may see their position improve

---

### US-023 · Staff removes a court mid-session
**As a** staff member dealing with a court issue
**I want to** remove a court from the active rotation
**So that** no players are assigned to a court with a problem

**Acceptance Criteria:**
- [ ] Staff taps court → "Remove from Session"
- [ ] If court is idle → disappears from TV and rotation immediately
- [ ] If game in progress → staff chooses:
  - "Wait for current game" → court greys out, no new assignments, removed when game ends naturally
  - "End game now" → players notified, returned to front of queue with priority preserved, court disappears
- [ ] TV grid reflows smoothly in both cases
- [ ] Event logged with staff ID and reason

---

### US-024 · Staff sets a court to maintenance
**As a** staff member with a damaged court
**I want to** mark it out of service
**So that** it's clearly flagged and excluded from all rotation

**Acceptance Criteria:**
- [ ] Tap court → "Set Maintenance" → court turns 🔴 Red "Out of Service" on TV instantly
- [ ] Court removed from rotation immediately
- [ ] If players were assigned → returned to front of queue, priority preserved, notified
- [ ] Staff can restore: tap → "Set Available" → court returns to ⚫ Grey idle
- [ ] Maintenance duration logged

---

### US-025 · Staff ends an individual player's session
**As a** staff member dealing with an injury or incident
**I want to** end a specific player's session
**So that** their spot is freed without affecting the rest of the court

**Acceptance Criteria:**
- [ ] Player accessible from: court card tap → player name, queue list, or player search
- [ ] Tap player → action sheet: "End Player Session" / "Move to Break" / "Adjust Skill Level"
- [ ] "End Player Session" → player removed immediately, push sent: "Your session was ended by staff — hope to see you soon"
- [ ] Event logged with staff ID and reason (injury / personal / other)
- [ ] No double confirmation for staff — intentional by nature

**If player is on a court:**
- [ ] Remaining 3 players notified: "A player has left — a replacement is coming"
- [ ] Single best skill-matched player pulled from queue as replacement
- [ ] Replacement notified: "Court A — go play! (joining a game in progress)"
- [ ] If player was part of a group → group notified, group may dissolve if below 2

**If player is in queue:**
- [ ] Removed silently, queue reorders
- [ ] Group updated (if applicable)

---

### US-026 · Staff moves a player to break
**As a** staff member
**I want to** put a player on break on their behalf
**So that** I can handle situations like injury assessment without removing them entirely

**Acceptance Criteria:**
- [ ] "Move to Break" from player action sheet
- [ ] Staff selects duration or enters custom minutes
- [ ] Player notified: "You've been placed on a break by staff"
- [ ] Player shown with ☕ on TV queue panel
- [ ] Player can return early via app ("I'm Back") or staff can return them manually

---

### US-027 · Staff adjusts player skill level
**As a** staff member
**I want to** correct a player's skill level
**So that** algorithmic mismatches caused by inaccurate self-declaration are fixed

**Acceptance Criteria:**
- [ ] Staff searches player by name
- [ ] Changes skill level with single confirmation
- [ ] Takes effect on next court assignment
- [ ] Player notified: "Your skill level was updated by staff to [level]"
- [ ] Change logged with staff ID

---

### US-028 · Staff manages the queue manually
**As a** staff member
**I want to** bump, remove, or add players manually
**So that** I can handle special cases

**Acceptance Criteria:**
- [ ] Bump player up or down in queue
- [ ] Remove player (player notified)
- [ ] Add manual player (no smartphone): enter name, shown with staff badge on TV and in queue
- [ ] Staff confirms manual player arrivals from dashboard
- [ ] Break up a group: members become solo at their current queue positions, all notified
- [ ] Merge players into a group manually if requested
- [ ] All changes logged with staff ID and timestamp

**Edge Cases:**
- Adding player already in queue → error, no duplicate
- Manual player assigned to court → staff confirms their arrival manually from dashboard

---

### US-029 · Player sets game preference
**As a** player
**I want to** optionally set a game preference (No preference / Same gender)
**So that** I can indicate whether I prefer to play with my gender or don't mind either way

**Acceptance Criteria:**
- [ ] Game preference editable from profile screen: "No preference" (default) or "Same gender"
- [ ] Preference changeable per session via a toggle on the queue screen
- [ ] Players with gender "other" only see "No preference" (same-gender pool too small)
- [ ] Algorithm respects preference as a soft filter — priority is still wait-time-based
- [ ] When in a voluntary group (Play Together), individual preferences are relaxed to match group composition
- [ ] Game type badge on court cards and TV derived from assigned players (all male = MEN, all female = WOMEN, otherwise hidden)

---

### US-030 · Staff closes a session
**As a** staff member ending the day
**I want to** close the session cleanly
**So that** all players are notified and the day's data is saved

**Acceptance Criteria:**
- [ ] "Close Session" with single staff confirmation
- [ ] All queuing players notified: "Today's session is ending — thanks for playing!"
- [ ] Queue locks — no new joins
- [ ] Active games finish naturally (staff ends them individually as courts empty)
- [ ] Session summary generated: total players, games played, avg wait time, court utilization %
- [ ] TV screen shows "Session Closed" state

**Edge Cases:**
- Staff closes session with active games → those courts remain active until staff individually ends each game
- Player tries to join after close → "No active session at this venue"

---

## EPIC 7 — Display Screen (System)

### US-031 · Display screen shows all active courts in real time
**As a** display screen
**I need to** show all active courts and their status
**So that** players can see what's happening without checking their phones

**Acceptance Criteria:**
- [ ] Only active courts shown — grid reflows automatically as courts added/removed
- [ ] Each card: court label (min 72px), status color, player names (🔗 for groups), elapsed timer
- [ ] WebSocket updates — display refreshes within 1 second of any state change
- [ ] Read-only — no interaction required
- [ ] Smooth animation when court cards appear or disappear
- [ ] No hardcoded grid sizes — layout recalculates based on active court count

**Edge Cases:**
- Disconnect → last known state + subtle "Reconnecting..." banner, auto-reconnects
- 15 courts active → compact grid mode
- 3 courts active → large card mode with more detail

---

### US-032 · Display screen shows the elapsed game timer
**As a** display screen
**I need to** show how long each game has been running
**So that** players on court and players waiting have a natural social cue to wrap up

**Acceptance Criteria:**
- [ ] Timer counts up from 0:00 when game starts
- [ ] 0:00–19:59 → White
- [ ] 20:00–29:59 → 🟠 Orange (running long)
- [ ] 30:00+ → 🔴 Red (overdue)
- [ ] Color transition is smooth, not jarring
- [ ] Timer always visible on active court cards
- [ ] No buzzer, no forced end — visual cue only

---

### US-033 · Display screen shows the waiting queue
**As a** display screen
**I need to** show the next players in queue
**So that** players know their position without looking at their phones

**Acceptance Criteria:**
- [ ] Next 8–10 queue entries shown: position number + name
- [ ] Groups shown as single entry: "🔗 Group of 3 — [names]"
- [ ] Players on break: ☕ icon + return countdown
- [ ] Manual players: staff badge
- [ ] Updates in real time

---

### US-034 · Display screen adapts to variable court count
**As a** display screen
**I need to** adapt layout to any number of active courts
**So that** the display looks correct at every venue and at any point during a session

**Acceptance Criteria:**
- [ ] Layout responsive to 3–15 active courts
- [ ] Grid recalculates on every court add/remove during session
- [ ] Court label and player names maintain minimum readable size at all layouts
- [ ] Venue name, time, and session status always visible in top bar regardless of court count

---

## EPIC 8 — Cross-Cutting & System

### US-035 · System handles simultaneous court endings
**As the** backend
**I need to** handle multiple courts ending games at the same time
**So that** queue assignments are fair and race-condition-free

**Acceptance Criteria:**
- [ ] Simultaneous game ends processed sequentially by end timestamp
- [ ] No player or group assigned to two courts at once
- [ ] Priority scores recalculated after each assignment before next court processed
- [ ] Display updates batch cleanly without flickering
- [ ] Groups evaluated as single units throughout concurrent processing

---

### US-036 · System handles single player replacement
**As the** backend
**I need to** replace a single player on an active court
**So that** the other 3 players can continue their game without interruption

**Acceptance Criteria:**
- [ ] Triggered by: staff ending individual player session, or staff marking no-show
- [ ] Algorithm selects single best skill-matched solo player from queue
- [ ] Groups not split to fill a single spot — solo players preferred for replacement
- [ ] Replacement player notified: "Court A — go play! (joining a game in progress)"
- [ ] Remaining 3 players notified: "A player has left — a replacement is coming"
- [ ] TV card stays Green — game continues uninterrupted
- [ ] If no suitable solo player available → staff notified, court continues with 3 players until next natural rotation

---

### US-037 · Player uses app across multiple venues
**As a** player who visits different venues
**I want to** use the same account everywhere
**So that** my profile and history follow me

**Acceptance Criteria:**
- [ ] Single phone number account works at all venues
- [ ] GPS auto-detects current venue
- [ ] Match history aggregated across all venues
- [ ] Skill level global across all venues
- [ ] Cannot be active (queuing or playing) at two venues simultaneously
- [ ] Groups are session-scoped — a group formed at venue A cannot be used at venue B

---

### US-038 · System enforces group skill constraint
**As the** backend
**I need to** validate skill balance within groups and court assignments
**So that** the experience is fair and competitive for all players

**Acceptance Criteria:**
- [ ] If group's internal skill spread exceeds 1 level → staff dashboard alert on assignment
- [ ] Staff can approve the assignment anyway or break the group
- [ ] Algorithm never silently violates skill rule — always surfaces to staff
- [ ] When filling remaining spots on a group court → solo players matched to weakest group member's level
- [ ] Skill constraint configurable per venue in settings

---

**Total: 38 User Stories across 8 Epics**

| Epic | Stories | Primary Role |
|------|---------|-------------|
| 1 – Onboarding | US-001 to 003 | Player |
| 2 – Queue Management | US-004 to 008 | Player |
| 3 – Play Together | US-009 to 014 | Player |
| 4 – In-Game | US-015 to 016 | Player + Staff |
| 5 – Post-Game & Breaks | US-017 to 020 | Player |
| 6 – Staff Management | US-021 to 030 | Staff |
| 7 – Display Screen | US-031 to 034 | System |
| 8 – Cross-Cutting | US-035 to 038 | System |

---

That's the complete rewrite — 38 stories fully aligned with PRD v2.2. Every change from our conversations is reflected: no player confirmation tap, staff-only game end, auto re-queue default, double confirmation for end session, dynamic courts, individual player removal, group system end-to-end, and single player replacement logic.

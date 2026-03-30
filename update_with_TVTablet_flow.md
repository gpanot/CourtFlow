Simplify the player queue flow across the entire 
CourtFlow system. The queue join mechanism is 
now exclusively via face scan at the TV tablet.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CONTEXT — WHAT CHANGED
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

OLD FLOW:
  Check-in → immediately in queue
  After game → auto re-queue or tap break/leave

NEW FLOW:
  Check-in → wristband number only, NOT in queue
  Player ready to play → walks to TV tablet →
  scans face → joins queue instantly
  After game → host empties court →
  player scans again when ready → repeat

This single change eliminates:
  - No-shows (scan = physically present)
  - Break management complexity
  - Auto re-queue logic
  - Post-game choice screen
  - "Left the venue" problem

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PART 1 — KIOSK CHECK-IN CHANGE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


CHANGE:
Check-in now creates the player record
and assigns a queue number (wristband number)
but does NOT add them to the active queue.

Specifically:

BEFORE:
  Successful face scan →
  creates QueueEntry with status "waiting" →
  player immediately in queue

AFTER:
  Successful face scan →
  assigns queueNumber (their wristband number,
  persistent for the session) →
  does NOT create QueueEntry yet →
  player is "checked in" but not "queued"

Add a new player session state:
  "checked_in" → has wristband number, 
                 not yet in queue
  "waiting"    → in queue, scanned at TV
  "playing"    → on a court
  "done"       → finished, left

Update the confirmation screen response to return:
{
  success: true,
  resultType: "checked_in",  // not "matched" 
  playerName,
  queueNumber,               // wristband number
  isReturning: bool,
  skillLevel,
  totalSessions,
  // NO queuePosition — they are not in queue yet
}

Update kiosk confirmation screen:
  Replace text: "#6 in queue" pill
   with: "Head to the TV screen 
                 when you're ready to play"
  

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PART 2 — NEW TV TABLET QUEUE JOIN
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

This is the new primary queue join mechanism.
A tablet mounted near the TV display.
Player scans face → joins queue instantly.

CREATE new route: /app/tv-queue/[venueCode]/page.tsx
(or add a new tab/mode to existing kiosk)

This screen has ONE job:
  Face scan → add player to queue

━━━━━━━━━━━━━━━━
TV TABLET UI
━━━━━━━━━━━━━━━━

Full screen, dark background.
Designed to run unattended.
No staff needed at this station.

IDLE STATE (default):
  Large text centered:
  "Ready to play?"
  
  Subtext:
  "Scan your face to join the queue"
  
  Camera viewfinder active
  Circular face guide, pulsing gently
  
  Small bottom text:
  "Already checked in today? 
   Just look at the camera"

SCANNING STATE:
  Camera active
  "Scanning..." text
  Spinner overlay

SUCCESS STATE (2 seconds then back to idle):
  Green background flash
  Large: "You're in! #47"
  Below: "#8 in queue"
  Player name: "Welcome, James!"
  
  Immediately visible on TV display:
  Player's number appears in waiting list

ALREADY IN QUEUE STATE:
  Amber flash
  "You're already in the queue"
  "#6 ahead of you"
  "No need to scan again"
  Returns to idle after 3 seconds

PLAYING STATE:
  Blue flash
  "You're currently on Court A"
  "Finish your game first!"
  Returns to idle after 3 seconds

NOT CHECKED IN STATE:
  (player never went to check-in desk)
  Red flash
  "Please check in at the front desk first"
  Returns to idle after 3 seconds

FACE NOT RECOGNISED STATE:
  "Face not recognised"
  "Enter your wristband number instead"
  Number input appears
  [Join Queue] button
  Player enters number → joins queue
  Returns to idle after success

━━━━━━━━━━━━━━━━
TV TABLET FLOW LOGIC
━━━━━━━━━━━━━━━━

Auto-scanning loop:
  Camera always active when in idle state
  Attempts face recognition every 2 seconds
  (not continuous — discrete attempts 
   with pause between)
  
  This is different from check-in kiosk:
  Check-in kiosk: manual trigger (staff taps)
  TV tablet: automatic continuous scanning
  Player just walks up and looks at camera

No "Scan next player" button needed here.
No staff present. Fully automated.

━━━━━━━━━━━━━━━━
TV TABLET API
━━━━━━━━━━━━━━━━

CREATE POST /api/tv-queue/join/route.ts

Public endpoint (no staff auth required)
Rate limit: max 1 successful join per 
           player per 10 minutes
           (prevents accidental double joins)

Request:
{
  venueCode: string,
  imageBase64: string,
}

Logic:
1. Run AWS Rekognition face recognition
2. Find player by matched face
3. Check player state:
   
   If not checked in today:
     return { resultType: "not_checked_in" }
   
   If already waiting in queue:
     return { 
       resultType: "already_queued",
       queuePosition: X 
     }
   
   If currently playing:
     return { resultType: "playing", courtLabel }
   
   If checked_in or done (ready to queue):
     Create QueueEntry:
       sessionId: active session
       playerId: matched player
       status: "waiting"
       queueNumber: player's assigned wristband number
       joinedAt: now()
     
     return {
       resultType: "joined",
       playerName,
       queueNumber,
       queuePosition,
     }

4. Emit socket event:
   emitToVenue(venueId, "queue:updated", allEntries)
   
5. TV display updates instantly showing
   new number in waiting list

Wristband number fallback endpoint:
CREATE POST /api/tv-queue/join-by-number/route.ts

Request: { venueCode, queueNumber }
Same logic as above but lookup by 
queueNumber instead of face recognition.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PART 3 — REMOVE BREAK MANAGEMENT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Break management no longer needed.
"Not in queue" IS the break state.
Player simply doesn't scan until ready.

REMOVE from player PWA:
  ❌ "Take a break" button
  ❌ "End break early" button
  ❌ "Break ending soon" push notification
  ❌ Auto re-queue after break expires
  ❌ on_break status handling in UI

REMOVE from staff dashboard:
  ❌ "Move to break" action on player
  ❌ Break timer display in queue list
  ❌ Break return notifications

REMOVE from API/backend:
  ❌ Break timer logic
  ❌ break_until field usage 
     (keep field in DB for now, 
      just stop writing/reading it)
  ❌ Auto re-queue scheduled jobs 
     if any exist

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PART 4 — REMOVE POST-GAME CHOICE SCREEN
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

REMOVE from player PWA entirely:
  ❌ "Good game! What's next?" screen
  ❌ "Re-queue Now" button
  ❌ "Take a Break" button  
  ❌ "End Session" button
  ❌ Post-game choice logic

REPLACE WITH:
When host empties a court
(taps End Game in staff dashboard)
→ affected players receive push notification:

  Title: "Good game!"
  Body: "Head to the TV screen 
         when you're ready to play again"

That's it. No choice required.
Player decides by physically scanning or not.

In the PWA, after game ends:
  Status updates to "checked_in" 
  (no longer "playing")
  
  Home screen shows:
  "Your last game was with 
   Sophie · Alex · Maria"
  
  Below:
  "Ready for another game? 
   Scan your face at the TV screen"
  
We still keep the survey after a game. 

  No buttons. Just information.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PART 5 — UPDATE PLAYER STATUS MODEL
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Player session states (simplified):

checked_in  → has wristband number,
              not in queue yet
              (just arrived or finished a game)

waiting     → in queue, scanned at TV tablet,
              waiting for court assignment

playing     → currently on a court

done        → session over for today
              (staff ended their session,
               or session closed)

REMOVE state:
  on_break  → no longer exists
              "not in queue" = break equivalent

Update QueueEntry status enum in schema:
  Remove: "on_break"
  Keep: "waiting", "playing", "left"
  Add: "checked_in" if not exists

Update any status checks throughout codebase
that reference "on_break" — replace with
"not in queue" logic (no active QueueEntry
with status "waiting")

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PART 6 — UPDATE STAFF DASHBOARD
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Queue tab changes:

REMOVE from queue list:
  ❌ "Move to break" action per player
  ❌ Break timer / return time display
  ❌ Break status indicator

KEEP:
  ✅ Player name + number in queue list
  ✅ "Remove from queue" action
  ✅ "Add manually" for players without phone
  ✅ Bump up/down in queue

Court card changes:

When host taps End Game:
  BEFORE: 
    Players get "Re-queue / Break / Leave" prompt
  
  AFTER:
    Court goes idle immediately
    Players get push: "Head to TV when ready"
    No choice prompt
    No waiting for player response
    Next rotation triggers immediately
    from players already in queue

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PART 7 — UPDATE TV DISPLAY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

No visual changes to the TV display itself.

The waiting list now only shows players
who explicitly scanned at the TV tablet.
No phantom players who are eating or chatting.

This naturally means the waiting list
is always accurate and actionable.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PART 8 — UPDATE PLAYER PWA HOME SCREEN
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Replace break-related UI with 
scan-to-queue instruction.

States and what home screen shows:

STATE: checked_in (not in queue):
  "You are #47"
  "Head to the TV screen 
   to join the queue when ready"
  
  If last game exists:
  "Last game: Sophie · Alex · Maria"
  
  Today's players grid below

STATE: waiting (in queue):
  "You are #47"
  "#6 ahead of you"
  Courts display
  
  Push notification will alert you
  when your court is ready

STATE: playing:
  "You are #47"
  "You're on Court A — enjoy!"
  Green court card

STATE: done:
  "Thanks for playing today!"
  Session stats
  Last game card

REMOVE from PWA entirely:
  ❌ Break button and all break UI
  ❌ Post-game choice buttons
  ❌ "End session" button
  ❌ Re-queue button

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PART 9 — PHYSICAL SETUP NOTE
(for documentation only, no code needed)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

The TV tablet runs /app/tv-queue/[venueCode]
in fullscreen browser mode.

Mounted near the TV display so players:
1. Scan face at tablet
2. Immediately see their number 
   appear on the TV behind it
3. Satisfying instant feedback

Same tablet can show the TV display 
in split view if screen is large enough,
or use two separate devices.

Staff dashboard generates the TV tablet URL:
  courtflow.io/tv-queue/[venueCode]
  
Show as QR code in venue settings 
so staff can quickly open on any tablet.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DO NOT CHANGE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

- Check-in kiosk face scan (Station 2)
  Only change: don't add to queue,
  just assign wristband number
  
- AWS Rekognition integration
- Court assignment algorithm
- Ranking system
- Staff court management (End Game etc)
- Session open/close
- TV display screen
- Socket/real-time infrastructure
- Player browser status page (/q/[venueCode])

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SUMMARY — WHAT CHANGES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

REMOVED:
  Break management (UI + API + logic)
  Post-game choice screen
  Auto re-queue
  Check-in → immediate queue join

ADDED:
  TV tablet queue join screen
  POST /api/tv-queue/join
  POST /api/tv-queue/join-by-number
  "checked_in" player state

SIMPLIFIED:
  Player states: 4 clean states only
  Post-game: push notification only,
             no UI response needed
  Queue: only contains ready players
  Staff dashboard: fewer actions per player

NET RESULT:
  Queue is always accurate
  No-shows eliminated
  Break complexity eliminated
  Player controls their own readiness
  Staff does less, system does more

  
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ADDITION — CHECKED-IN LIST IN STAFF Queue Tab
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Add a "Checked In" section to the Queue tab
in the staff dashboard.

The Queue tab now has a one more section:

  
SECTION — Checked In (new)
  Players who checked in at Station 2
  Have a wristband number
  Have NOT yet scanned at TV tablet
  Not in queue yet

there is a [→] button in the player option befroe the 3 dots player optiom:

Staff uses [→] button for:
  - Player without a phone
  - Player who forgot to scan at TV
  - Elderly player who needs help
  - Player physically told staff 
    they are ready but didn't scan
  - Manual players added by staff 
    at check-in (no face scan)

    ━━━━━━━━━━━━━━━━
DO NOT CHANGE
━━━━━━━━━━━━━━━━

  Existing waiting queue list
  Court cards
  Ranking banner
  Check-in tab
  Any other tabs
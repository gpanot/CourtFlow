Updated March 29th
Modify the existing player PWA. 
DO NOT rebuild from scratch.
The check-in flow has changed fundamentally.

CONTEXT:
Players no longer join the queue via the app.
They check in physically at a kiosk,
get a wristband number, and are already 
in the queue before opening the app.
The app is now an optional enhancement 
for notifications and status tracking only.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CHANGE 1 — REPLACE LOGIN SYSTEM
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

REMOVE:
- Phone number entry screen
- OTP verification screen
- Any SMS sending logic for player auth
- Phone number validation

REPLACE WITH:
Face login screen as the sole entry point.

New login flow:
  App opens → not authenticated
  → Show face login screen:

  Full screen dark background
  Circular camera viewfinder (same as kiosk)
  Text: "Look at camera to sign in"
  Small text below: "Used at [venue] today?"

  Face recognised:
  → Call POST /api/player/face-login
    with { imageBase64, mode: "pwa" }
  → Server returns:
    { 
      success: true,
      playerId,
      playerName,
      queueNumber,     // their wristband number
      sessionToken     // stored in httpOnly cookie
    }
  → Store session
  → Navigate to home screen

  Face not recognised:
  → Show: "Face not recognised"
  → Show fallback input:
    "Enter your wristband number"
    Number input → [Confirm]
  → Finds player by queue number
    in active session
  → If found: creates session, goes to home
  → If not found: "Number not found 
    in today's session"

  Already authenticated (valid session):
  → Skip face scan entirely
  → Go straight to home screen

  Session duration: 24 hours

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CHANGE 2 — REMOVE JOIN QUEUE BUTTON
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

REMOVE entirely:
- "Join Queue" / "Join the Game" button
- Any API call that adds player to queue
- Any UI that lets player join session

REASON:
Player is already in the queue from
physical check-in at the kiosk.
The app only shows their status.

REPLACE home screen primary section with:

If player is in active session:

  ┌─────────────────────────────┐
  │  You are #47                │  ← large, prominent
  │  #6 ahead of you            │  ← queue position
  └─────────────────────────────┘

If player is playing on a court:

  ┌─────────────────────────────┐
  │  You are #47                │
  │  You're on Court A          │  ← green highlight
  └─────────────────────────────┘

If player is on break:
  Keep existing break UI
  Just remove any "rejoin" button that
  calls the queue join API
  Break management (extend/end break)
  can stay — it's read-only status change

If no active session:
  ┌─────────────────────────────┐
  │  No active session          │
  │  at your venue right now    │
  └─────────────────────────────┘

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CHANGE 3 — UPDATE HOME SCREEN LAYOUT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Keep all existing sections that still apply.
Add new sections.
Remove sections that no longer make sense.

KEEP:
  ✅ Queue position display
  ✅ Break management (take break / end break)
  ✅ Courts display / TV mirror
  ✅ Post-game feedback if already built
  ✅ Websocket connection for real-time updates

REMOVE:
  ❌ Join Queue button
  ❌ Skill level selection (already at kiosk)
  ❌ Gender selection (already at kiosk)
  ❌ Any manual session join UI

ADD these new sections to home screen:

NEW SECTION — Wristband number
(add prominently at top, above queue position)

  Label: "Your session number"
  Value: large display of queueNumber
         e.g. "47" in large font
  Subtitle: "Show this if asked by staff"

  This is new — players didn't see their
  wristband number in the old app.
  Source: queueNumber from player session data.

NEW SECTION — Last game
(show below queue status, 
 only if player completed ≥1 game today)

  Label: "Last game"
  
  Row of 3 player avatars:
    Face photo if available (44px circle)
    Initials avatar fallback
    First name below each
  
  Small muted text: "Court B"
  
  If no completed game today: 
    hide this section entirely

NEW SECTION — Today's players
(show at bottom of home screen)

  Label: "Playing today"
  Subtitle: venue name + date

  Grid of avatars — all players in 
  today's session:
    Face photo (40px circle) or initials
    First name below
    Max 24 shown
    "+ X more" if over 24
  
  Data source: 
    GET /api/venue/[venueCode]/courts
    returns all players in session

NEW SECTION — Enable notifications
(one-time banner at top, until accepted)

  ┌──────────────────────────────────┐
  │ Know when your court is ready    │
  │ [Enable notifications] [Later]   │
  └──────────────────────────────────┘
  
  On Enable:
    Request push permission
    POST /api/player/push-subscribe
    Banner disappears permanently
    Store dismissed state in localStorage
    
  On Later:
    Dismiss for this session only
    Show again next app open

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CHANGE 4 — UPDATE WEBSOCKET HANDLER
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Keep existing websocket connection.
Keep existing real-time update logic.

Only change what the updates trigger:

BEFORE:
  queue:updated → refresh queue list
                  show join button state

AFTER:
  queue:updated → refresh queue position
                  refresh courts display
                  refresh today's players
                  NO join button to update

Add handler for new event:
  court:assigned → 
    If assigned player === current player:
      Show in-app alert:
      "Court A is ready — go play!"
      Green banner, auto-dismisses 10 seconds
      (push notification handles 
       background case)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CHANGE 5 — UPDATE ONBOARDING FLOW
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

REMOVE existing onboarding entirely:
  Phone number entry
  OTP verification
  Name input
  Skill level selection
  Gender selection

REPLACE with single screen:

  First time opening PWA:
  
  Screen 1 — Welcome:
    CourtFlow logo
    "Sign in to track your games 
     and get court notifications"
    [Sign in with face scan]
    
    Tapping → goes to face login screen
    (same as returning user login)

  No multi-step onboarding.
  All player data already exists 
  from physical check-in.
  Face scan retrieves it all.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CHANGE 6 — ADD PUSH NOTIFICATIONS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Add to service worker (sw.js):

  Handle push event:
  
  self.addEventListener('push', (event) => {
    const data = event.data.json();
    self.registration.showNotification(
      data.title,
      {
        body: data.body,
        icon: '/icons/icon-192.png',
        badge: '/icons/badge-72.png',
        data: { url: data.url || '/app' },
        vibrate: [200, 100, 200],
      }
    );
  });
  
  self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    event.waitUntil(
      clients.openWindow(
        event.notification.data.url
      )
    );
  });

Create /lib/push-notifications.ts:

  import webpush from 'web-push'
  
  webpush.setVapidDetails(
    'mailto:' + process.env.VAPID_EMAIL,
    process.env.VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!
  )
  
  export async function sendPushToPlayer(
    playerId: string, 
    notification: {
      title: string
      body: string
      url?: string
    }
  ) {
    const player = await prisma.player.findUnique({
      where: { id: playerId },
      select: { pushSubscription: true }
    })
    
    if (!player?.pushSubscription) return
    
    try {
      await webpush.sendNotification(
        JSON.parse(player.pushSubscription),
        JSON.stringify(notification)
      )
    } catch (err) {
      // Subscription expired or invalid
      // Clear it from DB silently
      await prisma.player.update({
        where: { id: playerId },
        data: { pushSubscription: null }
      })
    }
  }

Add to .env:
  VAPID_PUBLIC_KEY=
  VAPID_PRIVATE_KEY=
  VAPID_EMAIL=

Generate VAPID keys with:
  npx web-push generate-vapid-keys

Add pushSubscription String? to 
Player model in schema.prisma.

Trigger push in court assignment logic
alongside existing socket emit:

  // Existing:
  emitToVenue(venueId, "queue:updated", ...)
  
  // Add:
  if (assignedPlayerIds) {
    for (const playerId of assignedPlayerIds) {
      await sendPushToPlayer(playerId, {
        title: "It's your turn!",
        body: `Court ${courtLabel} is ready — go play`,
        url: '/app'
      })
    }
  }

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
NEW API ENDPOINTS NEEDED
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

POST /api/player/face-login
  Already defined in previous prompt
  Add mode param: "pwa" returns session token
  "browser" returns queue number only

POST /api/player/push-subscribe
  Auth: PWA session required
  Body: { subscription: PushSubscription }
  Stores JSON.stringify(subscription) 
  in player.pushSubscription

GET /api/player/me
  Auth: PWA session required
  Returns:
  {
    playerId,
    playerName,
    photo,           // face photo URL or null
    skillLevel,
    queueNumber,     // wristband number
    queuePosition,   // X ahead of you
    status,          // waiting|playing|on_break
    courtLabel,      // if playing
    lastGame,        // last completed game today
    totalSessions,
  }

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DO NOT CHANGE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

- Break management logic and UI
- Courts/TV display screen
- Post-game feedback if already built
- Websocket connection setup
- PWA manifest
- Any staff-facing code
- Face recognition service
- Queue entry removal/management
- Session management server-side

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SUMMARY — WHAT CHANGES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

REMOVED:
  Phone login / OTP
  Join Queue button + API call
  Onboarding skill/gender selection

REPLACED:
  Phone login → face login
  Join Queue → read-only queue status

ADDED:
  Wristband number display (#47)
  Last game card (who you played with)
  Today's players grid
  Enable notifications banner
  Push notification handler in SW
  Face login screen

KEPT:
  Everything else as-is
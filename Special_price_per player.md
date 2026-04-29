Per-player custom session price (staff-scoped)
Add an optional custom session price per player, set by a boss/admin from their Boss Dashboard player profile. Only applies to sessions opened by that specific staff member. Uses a join table so discounts are fully isolated between different clubs and bosses sharing the same player database.
1. Database
Create new model:
prismamodel PlayerCustomPrice {
  id          String      @id @default(cuid())
  playerId    String
  staffId     String
  customFee   Int
  note        String?
  createdAt   DateTime    @default(now())
  updatedAt   DateTime    @updatedAt
  player      Player      @relation(fields: [playerId], references: [id], onDelete: Cascade)
  staff       StaffMember @relation(fields: [staffId], references: [id], onDelete: Cascade)

  @@unique([playerId, staffId])
}
Add reverse relations:
prisma// On Player
customPrices PlayerCustomPrice[]

// On StaffMember  
customPrices PlayerCustomPrice[]
Run migration.
2. New API endpoints
GET /api/boss/players/{playerId}/custom-price — returns the custom price set by the current logged-in staff for this player, or null if none set.
PUT /api/boss/players/{playerId}/custom-price — body { customFee: number, note?: string } — creates or updates the PlayerCustomPrice record for playerId + currentStaffId.
DELETE /api/boss/players/{playerId}/custom-price — removes the custom price record for playerId + currentStaffId. Reverts to venue default.
All three routes: boss/admin role only, uses current authenticated staff ID.
3. Boss Dashboard — player profile detail
In the Players tab player profile detail, add a "Session pricing" section:

Show current venue default fee as context: "Venue default: 140,000 VND"
If no custom price set: show a muted "No custom price — using venue default" line and an "Add custom price" button
If custom price set: show the custom fee amount with a green "Custom" badge, an optional note field, an "Edit" button and a "Remove" link
On save call PUT /api/boss/players/{playerId}/custom-price
On remove call DELETE and revert UI to default state

In the players list table, show a small green "Custom" badge on player cards where the current logged-in boss has a custom price set for that player. Does not show badges for other bosses' custom prices.
4. Apply custom price at payment time
In pay-session and register endpoints, after identifying the player, look up their custom price for the current session's staff:
tsconst customPrice = await prisma.playerCustomPrice.findUnique({
  where: {
    playerId_staffId: {
      playerId: player.id,
      staffId: currentStaffId
    }
  }
})
const sessionFee = customPrice?.customFee ?? venueSessionFee
Use customPrice.customFee if found, otherwise fall back to venueSessionFee from venue payment settings.
5. Display
On the staff payment tab player card, show an amber "Custom price" badge next to the amount when a custom fee was applied so staff can see at a glance.
In session history detail, show the same amber badge next to the payment amount so the boss can audit which discounts were applied in past sessions.
On the tablet QR payment screen, just show the correct amount — no special label visible to the player.
6. Scope

Boss and admin roles only — staff role cannot set or view custom prices
Applies to per-session fees only, not subscription purchases
One custom price per player per boss — updating replaces the previous value
Deleting a boss's account cascades and removes their custom prices
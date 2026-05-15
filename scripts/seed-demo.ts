import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // --- DISCOVER EXISTING DATA ---
  const venues = await prisma.venue.findMany({ select: { id: true, name: true } });
  console.log("Venues:", venues);

  const venue = venues.find((v) => v.name.toLowerCase().includes("002") || v.name.toLowerCase().includes("best"));
  if (!venue) {
    console.log("No venue matching '002' or 'best' found. Available:", venues.map((v) => `${v.name} (${v.id})`));
    return;
  }
  const venueId = venue.id;
  console.log(`\nUsing venue: ${venue.name} (${venueId})`);

  const courts = await prisma.court.findMany({ where: { venueId }, select: { id: true, label: true, isBookable: true } });
  console.log("Courts:", courts);

  const players = await prisma.player.findMany({
    select: { id: true, name: true, phone: true, registrationVenueId: true },
  });
  console.log("Players:", players.map((p) => `${p.name} (${p.id}) regVenue=${p.registrationVenueId}`));

  const staff = await prisma.staffMember.findMany({
    select: { id: true, name: true, isCoach: true, venueAssignments: { select: { venueId: true } } },
  });
  console.log("Staff:", staff.map((s) => `${s.name} (${s.id}) coach=${s.isCoach} venues=${s.venueAssignments.map((a) => a.venueId)}`));

  const tiers = await prisma.membershipTier.findMany({ where: { venueId }, select: { id: true, name: true, priceInCents: true, sessionsIncluded: true, isActive: true } });
  console.log("Membership tiers:", tiers);

  const existingBookings = await prisma.booking.count({ where: { venueId } });
  const existingLessons = await prisma.coachLesson.count({ where: { venueId } });
  const existingMemberships = await prisma.membership.count({ where: { venueId } });
  const existingPayments = await prisma.staffPayment.count();
  console.log(`\nExisting data: ${existingBookings} bookings, ${existingLessons} lessons, ${existingMemberships} memberships, ${existingPayments} staff payments`);

  // --- FIX: Ensure all players have registrationVenueId ---
  const unlinked = players.filter((p) => !p.registrationVenueId);
  if (unlinked.length > 0) {
    console.log(`\nFixing ${unlinked.length} players without registrationVenueId...`);
    await prisma.player.updateMany({
      where: { registrationVenueId: null },
      data: { registrationVenueId: venueId },
    });
  }

  // --- MAKE COURTS BOOKABLE ---
  const nonBookable = courts.filter((c) => !c.isBookable);
  if (nonBookable.length > 0) {
    console.log(`Making ${nonBookable.length} courts bookable...`);
    await prisma.court.updateMany({
      where: { venueId, isBookable: false },
      data: { isBookable: true },
    });
  }

  // Refresh
  const allCourts = await prisma.court.findMany({ where: { venueId }, select: { id: true, label: true } });
  const allPlayers = await prisma.player.findMany({ select: { id: true, name: true } });

  if (allPlayers.length === 0) { console.log("No players found!"); return; }
  if (allCourts.length === 0) { console.log("No courts found!"); return; }

  // Get coaches (staff who are isCoach and assigned to venue)
  const coaches = staff.filter((s) => s.isCoach && s.venueAssignments.some((a) => a.venueId === venueId));
  const allStaffAtVenue = staff.filter((s) => s.venueAssignments.some((a) => a.venueId === venueId));
  console.log(`\nCoaches at venue: ${coaches.map((c) => c.name)}`);
  console.log(`Staff at venue: ${allStaffAtVenue.map((s) => s.name)}`);

  // --- SEED BOOKINGS (last 90 days, 40-50% utilization) ---
  console.log("\n--- Seeding court bookings ---");
  const now = new Date();
  const bookingsToCreate: {
    courtId: string; venueId: string; playerId: string;
    date: Date; startTime: Date; endTime: Date;
    status: "confirmed" | "completed" | "cancelled";
    priceInCents: number; coPlayerIds: string[];
  }[] = [];

  const hoursPerDay = 12; // 6am to 6pm
  const targetUtil = 0.45; // 45% average

  for (let daysAgo = 90; daysAgo >= 0; daysAgo--) {
    const day = new Date(now);
    day.setDate(day.getDate() - daysAgo);
    day.setHours(0, 0, 0, 0);

    const dow = day.getDay();
    // Weekends slightly busier
    const dayUtil = dow === 0 || dow === 6 ? targetUtil + 0.1 : targetUtil - 0.05;
    const slotsToFill = Math.round(allCourts.length * hoursPerDay * dayUtil);

    let filled = 0;
    for (const court of allCourts) {
      if (filled >= slotsToFill) break;
      // Pick random start hours between 6 and 17
      const possibleHours = Array.from({ length: 12 }, (_, i) => 6 + i);
      shuffleArray(possibleHours);
      const slotsForCourt = Math.min(
        Math.ceil(slotsToFill / allCourts.length) + (Math.random() > 0.5 ? 1 : -1),
        possibleHours.length
      );

      const usedHours = new Set<number>();
      for (let s = 0; s < slotsForCourt && filled < slotsToFill; s++) {
        const hr = possibleHours[s];
        if (usedHours.has(hr)) continue;
        usedHours.add(hr);

        const player = allPlayers[Math.floor(Math.random() * allPlayers.length)];
        const startTime = new Date(day);
        startTime.setHours(hr, 0, 0, 0);
        const endTime = new Date(day);
        endTime.setHours(hr + 1, 0, 0, 0);

        const prices = [15000, 18000, 20000, 25000, 30000];
        const price = prices[Math.floor(Math.random() * prices.length)];

        const isCancelled = Math.random() < 0.08;
        const isFuture = daysAgo === 0;

        bookingsToCreate.push({
          courtId: court.id,
          venueId,
          playerId: player.id,
          date: day,
          startTime,
          endTime,
          status: isCancelled ? "cancelled" : (isFuture ? "confirmed" : "completed"),
          priceInCents: price,
          coPlayerIds: [],
        });
        filled++;
      }
    }
  }

  // Batch insert bookings, skip duplicates
  let bookingCount = 0;
  for (const b of bookingsToCreate) {
    try {
      await prisma.booking.create({ data: b });
      bookingCount++;
    } catch {
      // unique constraint violation — skip
    }
  }
  console.log(`Created ${bookingCount} bookings`);

  // --- SEED COACHING LESSONS (~20% of court time) ---
  if (coaches.length > 0) {
    console.log("\n--- Seeding coaching lessons ---");

    // Need a coach package per coach
    let packages = await prisma.coachPackage.findMany({ where: { venueId }, select: { id: true, coachId: true } });
    for (const coach of coaches) {
      if (!packages.some((p) => p.coachId === coach.id)) {
        const pkg = await prisma.coachPackage.create({
          data: {
            coachId: coach.id,
            venueId,
            name: "1-on-1 Session",
            lessonType: "private",
            durationMin: 60,
            priceInCents: 50000,
            sessionsIncluded: 1,
            active: true,
          },
        });
        packages.push({ id: pkg.id, coachId: coach.id });
      }
    }

    let lessonCount = 0;
    const coachUtil = 0.20;

    for (let daysAgo = 90; daysAgo >= 1; daysAgo--) {
      const day = new Date(now);
      day.setDate(day.getDate() - daysAgo);
      day.setHours(0, 0, 0, 0);

      const lessonsToday = Math.round(allCourts.length * hoursPerDay * coachUtil / coaches.length);

      for (const coach of coaches) {
        const coachPkg = packages.find((p) => p.coachId === coach.id);
        if (!coachPkg) continue;

        for (let l = 0; l < lessonsToday; l++) {
          const hr = 7 + Math.floor(Math.random() * 10); // 7am-4pm
          const player = allPlayers[Math.floor(Math.random() * allPlayers.length)];
          const court = allCourts[Math.floor(Math.random() * allCourts.length)];

          const startTime = new Date(day);
          startTime.setHours(hr, 0, 0, 0);
          const endTime = new Date(day);
          endTime.setHours(hr + 1, 0, 0, 0);

          const price = 50000 + Math.floor(Math.random() * 3) * 10000;
          const isPaid = Math.random() < 0.7;

          try {
            await prisma.coachLesson.create({
              data: {
                venueId,
                coachId: coach.id,
                playerId: player.id,
                courtId: court.id,
                packageId: coachPkg.id,
                date: day,
                startTime,
                endTime,
                status: "completed",
                priceInCents: price,
                paymentStatus: isPaid ? "PAID" : "UNPAID",
              },
            });
            lessonCount++;
          } catch {
            // skip conflicts
          }
        }
      }
    }
    console.log(`Created ${lessonCount} coaching lessons`);
  }

  // --- SEED MEMBERSHIPS ---
  console.log("\n--- Seeding memberships ---");
  let activeTiers = tiers.filter((t) => t.isActive);
  if (activeTiers.length === 0) {
    console.log("No membership tiers exist. Creating defaults...");
    const tierData = [
      { name: "Silver", priceInCents: 25000000, sessionsIncluded: 8 },
      { name: "Gold", priceInCents: 40000000, sessionsIncluded: null },
      { name: "Platinum", priceInCents: 60000000, sessionsIncluded: null },
    ];
    const maxSort = await prisma.membershipTier.aggregate({ where: { venueId }, _max: { sortOrder: true } });
    let sort = (maxSort._max.sortOrder ?? 0) + 1;
    for (const td of tierData) {
      await prisma.membershipTier.create({
        data: { venueId, name: td.name, priceInCents: td.priceInCents, sessionsIncluded: td.sessionsIncluded, sortOrder: sort++, isActive: true },
      });
    }
    activeTiers = await prisma.membershipTier.findMany({ where: { venueId, isActive: true }, select: { id: true, name: true, priceInCents: true, sessionsIncluded: true, isActive: true } });
  }

  // Assign ~60% of players a membership
  const playersToMember = allPlayers.slice(0, Math.ceil(allPlayers.length * 0.6));
  let memberCount = 0;
  for (const player of playersToMember) {
    const existing = await prisma.membership.findUnique({ where: { playerId_venueId: { playerId: player.id, venueId } } });
    if (existing) continue;

    const tier = activeTiers[Math.floor(Math.random() * activeTiers.length)];
    const activatedDaysAgo = 10 + Math.floor(Math.random() * 60);
    const activatedAt = new Date(now);
    activatedAt.setDate(activatedAt.getDate() - activatedDaysAgo);

    const renewalDate = new Date(activatedAt);
    renewalDate.setDate(renewalDate.getDate() + 30);

    await prisma.membership.create({
      data: {
        playerId: player.id,
        venueId,
        tierId: tier.id,
        status: "active",
        activatedAt,
        renewalDate,
        sessionsUsed: Math.floor(Math.random() * (tier.sessionsIncluded ?? 5)),
      },
    });
    memberCount++;
  }
  console.log(`Created ${memberCount} memberships`);

  // --- SEED STAFF PAYMENTS (last 12 weeks for up to 3 staff) ---
  console.log("\n--- Seeding staff payments ---");
  const staffForPayroll = allStaffAtVenue.slice(0, 3);
  let payCount = 0;
  for (const s of staffForPayroll) {
    for (let w = 0; w < 12; w++) {
      const weekStart = new Date(now);
      weekStart.setDate(weekStart.getDate() - weekStart.getUTCDay() + 1 - w * 7);
      weekStart.setUTCHours(0, 0, 0, 0);

      const isCoach = s.isCoach;
      const hours = isCoach ? 15 + Math.round(Math.random() * 10) : 30 + Math.round(Math.random() * 10);
      const rate = isCoach ? 150000 : 80000; // per hour in VND (cents representation)
      const amount = hours * rate / 100;

      const existing = await prisma.staffPayment.findUnique({ where: { staffId_weekStart: { staffId: s.id, weekStart } } });
      if (existing) continue;

      await prisma.staffPayment.create({
        data: {
          staffId: s.id,
          weekStart,
          totalHours: hours,
          amount,
          status: w >= 2 ? "PAID" : "UNPAID",
          paidAt: w >= 2 ? new Date() : null,
        },
      });
      payCount++;
    }
  }
  console.log(`Created ${payCount} staff payments`);

  console.log("\n✅ Demo data seeded successfully!");

  // Verify
  const finalBookings = await prisma.booking.count({ where: { venueId } });
  const finalLessons = await prisma.coachLesson.count({ where: { venueId } });
  const finalMembers = await prisma.membership.count({ where: { venueId } });
  const finalPayments = await prisma.staffPayment.count();
  const finalPlayers = await prisma.player.count({ where: { registrationVenueId: venueId } });
  console.log(`\nFinal counts: ${finalBookings} bookings, ${finalLessons} lessons, ${finalMembers} memberships, ${finalPayments} payments, ${finalPlayers} players`);
}

function shuffleArray<T>(arr: T[]) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

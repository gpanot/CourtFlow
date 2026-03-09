import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding database...");

  const venue = await prisma.venue.upsert({
    where: { id: "demo-venue-1" },
    update: {},
    create: {
      id: "demo-venue-1",
      name: "Downtown Pickleball Club",
      location: "123 Main St, Austin TX",
      settings: {
        autoStartDelay: 180,
        postGameTimeout: 180,
        breakOptions: [5, 10, 15, 20, 30],
        gpsRadius: 200,
        maxGroupSize: 4,
        maxSkillGap: 1,
        defaultCourtType: "mixed",
      },
    },
  });

  const courtLabels = ["Court A", "Court B", "Court C", "Court D", "Court E", "Court F"];
  for (const label of courtLabels) {
    await prisma.court.upsert({
      where: { id: `demo-court-${label.replace(/\s/g, "-").toLowerCase()}` },
      update: {},
      create: {
        id: `demo-court-${label.replace(/\s/g, "-").toLowerCase()}`,
        venueId: venue.id,
        label,
        status: "idle",
        activeInSession: false,
      },
    });
  }

  const adminPassword = bcrypt.hashSync("admin123", 10);
  await prisma.staffMember.upsert({
    where: { phone: "+10000000000" },
    update: { venues: { connect: [{ id: venue.id }] } },
    create: {
      id: "demo-superadmin",
      name: "Admin User",
      phone: "+10000000000",
      email: "admin@courtflow.com",
      role: "superadmin",
      passwordHash: adminPassword,
      onboardingCompleted: true,
      venues: { connect: [{ id: venue.id }] },
    },
  });

  await prisma.staffMember.upsert({
    where: { phone: "+10000000001" },
    update: { venues: { connect: [{ id: venue.id }] } },
    create: {
      id: "demo-staff-1",
      name: "Staff Member",
      phone: "+10000000001",
      role: "staff",
      passwordHash: bcrypt.hashSync("staff123", 10),
      venues: { connect: [{ id: venue.id }] },
    },
  });

  console.log("Seed complete:");
  console.log(`  Venue: ${venue.name}`);
  console.log(`  Courts: ${courtLabels.join(", ")}`);
  console.log(`  Super Admin: +10000000000 / admin123`);
  console.log(`  Staff: +10000000001 / staff123`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

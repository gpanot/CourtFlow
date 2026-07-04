-- CreateEnum not needed (string[])

CREATE TABLE "staff_venue_assignments" (
    "id" TEXT NOT NULL,
    "staff_id" TEXT NOT NULL,
    "venue_id" TEXT NOT NULL,
    "app_access" TEXT[] NOT NULL DEFAULT ARRAY['courtflow']::TEXT[],

    CONSTRAINT "staff_venue_assignments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "staff_venue_assignments_staff_id_venue_id_key" ON "staff_venue_assignments"("staff_id", "venue_id");

CREATE INDEX "staff_venue_assignments_staff_id_idx" ON "staff_venue_assignments"("staff_id");
CREATE INDEX "staff_venue_assignments_venue_id_idx" ON "staff_venue_assignments"("venue_id");

ALTER TABLE "staff_venue_assignments" ADD CONSTRAINT "staff_venue_assignments_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "staff_members"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "staff_venue_assignments" ADD CONSTRAINT "staff_venue_assignments_venue_id_fkey" FOREIGN KEY ("venue_id") REFERENCES "venues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Migrate implicit M2M: "_StaffMemberToVenue"."A" = staff_members.id, "B" = venues.id
INSERT INTO "staff_venue_assignments" ("id", "staff_id", "venue_id", "app_access")
SELECT gen_random_uuid()::text, "A", "B", ARRAY['courtflow']::TEXT[]
FROM "_StaffMemberToVenue";

DROP TABLE "_StaffMemberToVenue";

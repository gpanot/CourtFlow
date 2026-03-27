-- Normalize legacy warm-up rows after code no longer uses warm-up phase.
UPDATE "courts" SET "status" = 'active' WHERE "status" = 'warmup';
UPDATE "court_assignments" SET "is_warmup" = false WHERE "is_warmup" = true;

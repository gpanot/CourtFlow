-- Intro warm-up phase ends permanently for a session once any real game starts.
ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "intro_warmup_complete" BOOLEAN NOT NULL DEFAULT false;

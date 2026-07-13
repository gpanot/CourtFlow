-- migrate:up

-- Enums (idempotent)
DO $$ BEGIN
  CREATE TYPE public."PromoDiscountType" AS ENUM ('percent', 'fixed', 'free');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public."PromoAppliesTo" AS ENUM ('court_booking', 'coaching', 'open_play', 'all');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public."PromoBookingType" AS ENUM ('court_booking', 'coaching', 'open_play');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- promo_codes table
CREATE TABLE IF NOT EXISTS public.promo_codes (
  id                       TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  venue_id                 TEXT NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE ON UPDATE NO ACTION,
  name                     TEXT NOT NULL,
  code                     TEXT NOT NULL,
  discount_type            public."PromoDiscountType" NOT NULL,
  discount_value           INTEGER,
  applies_to               public."PromoAppliesTo" NOT NULL DEFAULT 'all',
  max_redemptions          INTEGER,
  redemption_count         INTEGER NOT NULL DEFAULT 0,
  max_redemptions_per_player INTEGER DEFAULT 1,
  starts_at                TIMESTAMP(6) WITHOUT TIME ZONE NOT NULL,
  ends_at                  TIMESTAMP(6) WITHOUT TIME ZONE,
  is_active                BOOLEAN NOT NULL DEFAULT true,
  post_text                TEXT,
  headline                 TEXT,
  created_at               TIMESTAMP(6) WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMP(6) WITHOUT TIME ZONE NOT NULL DEFAULT NOW()
);

-- Unique code per venue (case-insensitive via functional index)
CREATE UNIQUE INDEX IF NOT EXISTS promo_codes_venue_code_unique
  ON public.promo_codes (venue_id, UPPER(code));

CREATE INDEX IF NOT EXISTS promo_codes_venue_id_idx ON public.promo_codes (venue_id);
CREATE INDEX IF NOT EXISTS promo_codes_is_active_idx ON public.promo_codes (is_active);

-- promo_link_clicks table
CREATE TABLE IF NOT EXISTS public.promo_link_clicks (
  id                TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  promo_code_id     TEXT NOT NULL REFERENCES public.promo_codes(id) ON DELETE CASCADE ON UPDATE NO ACTION,
  player_id         TEXT REFERENCES public.players(id) ON DELETE SET NULL ON UPDATE NO ACTION,
  utm_source        TEXT,
  device_session_id TEXT NOT NULL,
  clicked_at        TIMESTAMP(6) WITHOUT TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS promo_link_clicks_promo_code_id_idx ON public.promo_link_clicks (promo_code_id);
CREATE INDEX IF NOT EXISTS promo_link_clicks_device_session_id_idx ON public.promo_link_clicks (device_session_id);
CREATE INDEX IF NOT EXISTS promo_link_clicks_player_id_idx ON public.promo_link_clicks (player_id);

-- promo_redemptions table
CREATE TABLE IF NOT EXISTS public.promo_redemptions (
  id                TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  promo_code_id     TEXT NOT NULL REFERENCES public.promo_codes(id) ON DELETE RESTRICT ON UPDATE NO ACTION,
  player_id         TEXT NOT NULL REFERENCES public.players(id) ON DELETE RESTRICT ON UPDATE NO ACTION,
  booking_id        TEXT,
  booking_type      public."PromoBookingType" NOT NULL,
  utm_source        TEXT,
  discount_amount   INTEGER NOT NULL,
  original_price    INTEGER NOT NULL,
  final_price       INTEGER NOT NULL,
  first_click_id    TEXT REFERENCES public.promo_link_clicks(id) ON DELETE SET NULL ON UPDATE NO ACTION,
  redeemed_at       TIMESTAMP(6) WITHOUT TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS promo_redemptions_promo_code_id_idx ON public.promo_redemptions (promo_code_id);
CREATE INDEX IF NOT EXISTS promo_redemptions_player_id_idx ON public.promo_redemptions (player_id);
CREATE INDEX IF NOT EXISTS promo_redemptions_booking_id_idx ON public.promo_redemptions (booking_id);

-- migrate:down
DROP TABLE IF EXISTS public.promo_redemptions;
DROP TABLE IF EXISTS public.promo_link_clicks;
DROP TABLE IF EXISTS public.promo_codes;
DROP TYPE IF EXISTS public."PromoBookingType";
DROP TYPE IF EXISTS public."PromoAppliesTo";
DROP TYPE IF EXISTS public."PromoDiscountType";

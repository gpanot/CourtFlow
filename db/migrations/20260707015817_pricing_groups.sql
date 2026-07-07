-- migrate:up

-- ─── 1. pricing_groups table ──────────────────────────────────────────────────

CREATE TABLE public.pricing_groups (
    id text NOT NULL,
    venue_id text NOT NULL,
    name text NOT NULL,
    sort_order integer NOT NULL DEFAULT 0,
    is_default boolean NOT NULL DEFAULT false,
    is_unconfigured boolean NOT NULL DEFAULT false,
    default_price_value integer NOT NULL DEFAULT 0,
    pricing_rules jsonb NOT NULL DEFAULT '[]'::jsonb,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL,
    CONSTRAINT pricing_groups_pkey PRIMARY KEY (id),
    CONSTRAINT pricing_groups_venue_id_fkey FOREIGN KEY (venue_id) REFERENCES public.venues(id) ON DELETE CASCADE
);

CREATE INDEX pricing_groups_venue_id_idx ON public.pricing_groups (venue_id);

-- Hard constraint: exactly one default per venue at the DB level.
-- API code still does the transactional swap (unset old → set new),
-- but this index is the final guard against drift from bugs or manual edits.
CREATE UNIQUE INDEX pricing_groups_one_default_per_venue
    ON public.pricing_groups (venue_id)
    WHERE is_default = true;

-- ─── 2. courts additions ──────────────────────────────────────────────────────

ALTER TABLE public.courts
    ADD COLUMN IF NOT EXISTS pricing_group_id text REFERENCES public.pricing_groups(id) ON DELETE SET NULL;

ALTER TABLE public.courts
    ADD COLUMN IF NOT EXISTS price_override jsonb;

CREATE INDEX courts_pricing_group_id_idx ON public.courts (pricing_group_id);

-- ─── 3. Backfill: one "Standard" group per venue from existing bookingConfig ──

DO $$
DECLARE
    v_rec RECORD;
    v_group_id text;
    v_default_price integer;
    v_pricing_rules jsonb;
    v_is_unconfigured boolean;
BEGIN
    FOR v_rec IN
        SELECT id, name, settings FROM public.venues
    LOOP
        -- Extract pricing values, handling both current and legacy key names.
        v_default_price := COALESCE(
            (v_rec.settings -> 'bookingConfig' ->> 'defaultPriceValue')::integer,
            (v_rec.settings -> 'bookingConfig' ->> 'defaultPriceInCents')::integer,
            (v_rec.settings -> 'bookingConfig' ->> 'pricePerSlotCents')::integer,
            0
        );

        v_pricing_rules := COALESCE(
            (v_rec.settings -> 'bookingConfig' -> 'pricingRules'),
            '[]'::jsonb
        );

        -- Normalise legacy priceInCents key inside each rule to priceValue.
        -- This handles old JSON that used priceInCents instead of priceValue.
        SELECT jsonb_agg(
            CASE
                WHEN rule ? 'priceValue' THEN rule
                WHEN rule ? 'priceInCents' THEN
                    jsonb_set(rule - 'priceInCents', '{priceValue}', rule -> 'priceInCents')
                ELSE rule
            END
        )
        INTO v_pricing_rules
        FROM jsonb_array_elements(v_pricing_rules) AS rule;

        v_pricing_rules := COALESCE(v_pricing_rules, '[]'::jsonb);

        -- Flag venues that had no real pricing configured.
        v_is_unconfigured := (v_default_price = 0 AND jsonb_array_length(v_pricing_rules) = 0);

        IF v_is_unconfigured THEN
            RAISE NOTICE 'PRICING BACKFILL WARNING: Venue "%" (id=%) has zero/missing pricing — created unconfigured default group. Review before going to production.',
                v_rec.name, v_rec.id;
        END IF;

        -- Generate a cuid-like ID using gen_random_uuid as base (sufficient for our FK).
        v_group_id := 'pg_' || replace(gen_random_uuid()::text, '-', '');

        INSERT INTO public.pricing_groups (
            id, venue_id, name, sort_order, is_default,
            is_unconfigured, default_price_value, pricing_rules,
            created_at, updated_at
        ) VALUES (
            v_group_id,
            v_rec.id,
            'Standard',
            0,
            true,
            v_is_unconfigured,
            v_default_price,
            v_pricing_rules,
            CURRENT_TIMESTAMP,
            CURRENT_TIMESTAMP
        );

        -- Assign all courts of this venue to the new default group.
        UPDATE public.courts
        SET pricing_group_id = v_group_id
        WHERE venue_id = v_rec.id;

    END LOOP;
END $$;

-- ─── migrate:down ─────────────────────────────────────────────────────────────

-- migrate:down
-- Drop new court columns first (they reference pricing_groups).
ALTER TABLE public.courts DROP COLUMN IF EXISTS pricing_group_id;
ALTER TABLE public.courts DROP COLUMN IF EXISTS price_override;

-- Drop the table (cascades indexes and constraints).
DROP TABLE IF EXISTS public.pricing_groups;

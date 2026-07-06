-- migrate:up
-- Backfill venue slugs from name for invoice number prefixes (e.g. THEHUB-BK-2026-0001)
UPDATE venues
SET slug = TRIM(BOTH '-' FROM REGEXP_REPLACE(LOWER(name), '[^a-z0-9]+', '-', 'g'))
WHERE slug IS NULL OR slug = '';

-- Resolve duplicate slugs by appending a short id suffix
UPDATE venues v
SET slug = v.slug || '-' || RIGHT(v.id, 6)
WHERE v.id IN (
  SELECT id FROM (
    SELECT id,
      ROW_NUMBER() OVER (PARTITION BY slug ORDER BY created_at) AS rn
    FROM venues
  ) ranked
  WHERE rn > 1
);

-- migrate:down
-- Data backfill — no reversal

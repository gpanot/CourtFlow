-- migrate:up

-- ─── 1. company_accounts ─────────────────────────────────────────────────────
-- Top-level billing entity for Open Bill (B2B business accounts and solo players).

CREATE TABLE public.company_accounts (
    id                      text        NOT NULL,
    venue_id                text        NOT NULL,
    name                    text        NOT NULL,
    billing_email           text,
    tax_id                  text,
    billing_address         text,
    vat_percent             integer     NOT NULL DEFAULT 10,
    -- 'excluded': VAT added on top of subtotal; 'included': VAT derived from gross
    price_vat_mode          text        NOT NULL DEFAULT 'excluded',
    fixed_discount_amount   integer     NOT NULL DEFAULT 0,
    -- Nullable: per-account override; falls back to venue.settings.openBill.defaultDueDays
    payment_terms_days      integer,
    open_bill_credit_limit  integer,
    -- 'warn_only' | 'block'
    credit_limit_mode       text        NOT NULL DEFAULT 'warn_only',
    -- FK to the primary/contact player for this account (auto-set from player profile)
    primary_player_id       text,
    contact_phone           text,
    -- Suppresses company/VAT fields on PDF and admin UI for solo (single-player) accounts
    is_solo                 boolean     NOT NULL DEFAULT false,
    is_active               boolean     NOT NULL DEFAULT true,
    created_at              timestamp(3) without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at              timestamp(3) without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT company_accounts_pkey PRIMARY KEY (id),
    CONSTRAINT company_accounts_venue_id_fkey
        FOREIGN KEY (venue_id) REFERENCES public.venues(id) ON DELETE CASCADE,
    CONSTRAINT company_accounts_primary_player_id_fkey
        FOREIGN KEY (primary_player_id) REFERENCES public.players(id) ON DELETE SET NULL,
    CONSTRAINT company_accounts_price_vat_mode_check
        CHECK (price_vat_mode IN ('excluded', 'included')),
    CONSTRAINT company_accounts_credit_limit_mode_check
        CHECK (credit_limit_mode IN ('warn_only', 'block'))
);

CREATE INDEX company_accounts_venue_id_idx ON public.company_accounts (venue_id);
CREATE INDEX company_accounts_primary_player_id_idx ON public.company_accounts (primary_player_id);

-- ─── 2. company_account_players ──────────────────────────────────────────────
-- Join table: many players → one company account (manager-controlled).

CREATE TABLE public.company_account_players (
    id                  text        NOT NULL,
    company_account_id  text        NOT NULL,
    player_id           text        NOT NULL,
    -- staff_id of the manager who linked this player
    added_by            text        NOT NULL,
    added_at            timestamp(3) without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT company_account_players_pkey PRIMARY KEY (id),
    CONSTRAINT company_account_players_company_fkey
        FOREIGN KEY (company_account_id) REFERENCES public.company_accounts(id) ON DELETE CASCADE,
    CONSTRAINT company_account_players_player_fkey
        FOREIGN KEY (player_id) REFERENCES public.players(id) ON DELETE CASCADE,
    CONSTRAINT company_account_players_unique
        UNIQUE (company_account_id, player_id)
);

CREATE INDEX company_account_players_company_id_idx ON public.company_account_players (company_account_id);
CREATE INDEX company_account_players_player_id_idx ON public.company_account_players (player_id);

-- ─── 3. company_open_bills ───────────────────────────────────────────────────
-- Monthly statement owned by a company_account.

CREATE TABLE public.company_open_bills (
    id                  text        NOT NULL,
    venue_id            text        NOT NULL,
    company_account_id  text        NOT NULL,
    -- Calendar period for this bill
    period_start        date        NOT NULL,
    period_end          date,
    -- 'open' | 'issued' | 'paid' | 'overdue' | 'void'
    status              text        NOT NULL DEFAULT 'open',
    -- Financials (all in VND, smallest unit integer)
    subtotal            integer     NOT NULL DEFAULT 0,
    discount_amount     integer     NOT NULL DEFAULT 0,
    taxable_base        integer     NOT NULL DEFAULT 0,
    vat_amount          integer     NOT NULL DEFAULT 0,
    total_amount        integer     NOT NULL DEFAULT 0,
    -- Snapshot of VAT settings at time of issue
    vat_percent         integer     NOT NULL DEFAULT 0,
    price_vat_mode      text        NOT NULL DEFAULT 'excluded',
    notes               text,
    -- Payment tracking
    payment_ref         text        UNIQUE,
    invoice_number      text        UNIQUE,
    pdf_url             text,
    due_date            date,
    issued_at           timestamp(3) without time zone,
    issued_by           text,
    paid_at             timestamp(3) without time zone,
    paid_by             text,
    paid_method         text,
    -- Void tracking
    voided_at           timestamp(3) without time zone,
    voided_by           text,
    void_reason         text,
    created_at          timestamp(3) without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          timestamp(3) without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT company_open_bills_pkey PRIMARY KEY (id),
    CONSTRAINT company_open_bills_venue_fkey
        FOREIGN KEY (venue_id) REFERENCES public.venues(id) ON DELETE CASCADE,
    CONSTRAINT company_open_bills_company_fkey
        FOREIGN KEY (company_account_id) REFERENCES public.company_accounts(id) ON DELETE CASCADE,
    CONSTRAINT company_open_bills_status_check
        CHECK (status IN ('open', 'issued', 'paid', 'overdue', 'void')),
    -- One bill per company account per period start
    CONSTRAINT company_open_bills_period_unique
        UNIQUE (company_account_id, period_start)
);

CREATE INDEX company_open_bills_venue_id_idx      ON public.company_open_bills (venue_id);
CREATE INDEX company_open_bills_company_id_idx    ON public.company_open_bills (company_account_id);
CREATE INDEX company_open_bills_status_idx        ON public.company_open_bills (status);
CREATE INDEX company_open_bills_period_start_idx  ON public.company_open_bills (period_start);

-- ─── 4. company_open_bill_events ─────────────────────────────────────────────
-- Append-only audit log for bill lifecycle events.

CREATE TABLE public.company_open_bill_events (
    id          text        NOT NULL,
    bill_id     text        NOT NULL,
    -- 'created' | 'issued' | 'paid' | 'overdue' | 'void' | 'reminder_sent' | 'proof_submitted' | 'note_added'
    event       text        NOT NULL,
    actor_id    text,
    -- 'staff' | 'system' | 'sepay'
    actor_type  text,
    note        text,
    meta        jsonb,
    created_at  timestamp(3) without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT company_open_bill_events_pkey PRIMARY KEY (id),
    CONSTRAINT company_open_bill_events_bill_fkey
        FOREIGN KEY (bill_id) REFERENCES public.company_open_bills(id) ON DELETE CASCADE
);

CREATE INDEX company_open_bill_events_bill_id_idx ON public.company_open_bill_events (bill_id);
CREATE INDEX company_open_bill_events_created_at_idx ON public.company_open_bill_events (created_at);

-- ─── 5. bookings — add company_open_bill_id ──────────────────────────────────
-- Links a booking to its open bill when paymentStatus = 'open_bill'.

ALTER TABLE public.bookings
    ADD COLUMN IF NOT EXISTS company_open_bill_id text
    REFERENCES public.company_open_bills(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS bookings_company_open_bill_id_idx
    ON public.bookings (company_open_bill_id);

-- ─── 6. invoice_sequences — add OB type ──────────────────────────────────────
-- No DDL needed; allocateInvoiceNumber handles it dynamically.
-- The OB type will be inserted into invoice_sequences on first use.

-- migrate:down

-- Remove column from bookings first (FK reference)
ALTER TABLE public.bookings DROP COLUMN IF EXISTS company_open_bill_id;

DROP TABLE IF EXISTS public.company_open_bill_events;
DROP TABLE IF EXISTS public.company_open_bills;
DROP TABLE IF EXISTS public.company_account_players;
DROP TABLE IF EXISTS public.company_accounts;

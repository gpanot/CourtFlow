\restrict dbmate

-- Dumped from database version 17.9 (Homebrew)
-- Dumped by pg_dump version 18.3

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

-- *not* creating schema, since initdb creates it


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS '';


--
-- Name: shadow_temp; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA shadow_temp;


--
-- Name: BookingStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."BookingStatus" AS ENUM (
    'confirmed',
    'cancelled',
    'completed',
    'no_show',
    'expired_hold'
);


--
-- Name: ClassPassPaymentStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."ClassPassPaymentStatus" AS ENUM (
    'UNPAID',
    'PAID',
    'OVERDUE'
);


--
-- Name: ClassPassStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."ClassPassStatus" AS ENUM (
    'active',
    'paused',
    'expired',
    'cancelled'
);


--
-- Name: CoachLessonStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."CoachLessonStatus" AS ENUM (
    'confirmed',
    'completed',
    'cancelled',
    'no_show',
    'pending_approval'
);


--
-- Name: CourtBlockType; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."CourtBlockType" AS ENUM (
    'private_competition',
    'private_event',
    'maintenance',
    'open_play',
    'competition',
    'alobo'
);


--
-- Name: CourtStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."CourtStatus" AS ENUM (
    'idle',
    'warmup',
    'active',
    'maintenance'
);


--
-- Name: GamePreference; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."GamePreference" AS ENUM (
    'no_preference',
    'same_gender'
);


--
-- Name: GameType; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."GameType" AS ENUM (
    'men',
    'women',
    'mixed'
);


--
-- Name: Gender; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."Gender" AS ENUM (
    'male',
    'female',
    'other'
);


--
-- Name: GroupStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."GroupStatus" AS ENUM (
    'forming',
    'active',
    'disbanded'
);


--
-- Name: LessonType; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."LessonType" AS ENUM (
    'private',
    'group'
);


--
-- Name: MembershipPaymentStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."MembershipPaymentStatus" AS ENUM (
    'UNPAID',
    'PAID',
    'OVERDUE'
);


--
-- Name: MembershipStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."MembershipStatus" AS ENUM (
    'active',
    'suspended',
    'expired',
    'cancelled'
);


--
-- Name: PaymentStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."PaymentStatus" AS ENUM (
    'UNPAID',
    'PAID'
);


--
-- Name: PlayerAppAuthMethod; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."PlayerAppAuthMethod" AS ENUM (
    'face_pwa',
    'wristband',
    'phone_otp'
);


--
-- Name: PromoAppliesTo; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."PromoAppliesTo" AS ENUM (
    'court_booking',
    'coaching',
    'open_play',
    'all'
);


--
-- Name: PromoBookingType; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."PromoBookingType" AS ENUM (
    'court_booking',
    'coaching',
    'open_play'
);


--
-- Name: PromoDiscountType; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."PromoDiscountType" AS ENUM (
    'percent',
    'fixed',
    'free'
);


--
-- Name: QueueStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."QueueStatus" AS ENUM (
    'waiting',
    'assigned',
    'playing',
    'on_break',
    'left'
);


--
-- Name: SessionStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."SessionStatus" AS ENUM (
    'open',
    'closed'
);


--
-- Name: SessionType; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."SessionType" AS ENUM (
    'open_play',
    'competition'
);


--
-- Name: SkillLevel; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."SkillLevel" AS ENUM (
    'beginner',
    'intermediate',
    'advanced',
    'pro'
);


--
-- Name: StaffRole; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."StaffRole" AS ENUM (
    'staff',
    'manager',
    'superadmin'
);


--
-- Name: SubscriptionStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."SubscriptionStatus" AS ENUM (
    'active',
    'exhausted',
    'expired',
    'cancelled'
);


--
-- Name: BookingStatus; Type: TYPE; Schema: shadow_temp; Owner: -
--

CREATE TYPE shadow_temp."BookingStatus" AS ENUM (
    'confirmed',
    'cancelled',
    'completed',
    'no_show'
);


--
-- Name: CoachLessonStatus; Type: TYPE; Schema: shadow_temp; Owner: -
--

CREATE TYPE shadow_temp."CoachLessonStatus" AS ENUM (
    'confirmed',
    'completed',
    'cancelled',
    'no_show'
);


--
-- Name: CourtBlockType; Type: TYPE; Schema: shadow_temp; Owner: -
--

CREATE TYPE shadow_temp."CourtBlockType" AS ENUM (
    'private_competition',
    'private_event',
    'maintenance',
    'open_play',
    'competition'
);


--
-- Name: CourtStatus; Type: TYPE; Schema: shadow_temp; Owner: -
--

CREATE TYPE shadow_temp."CourtStatus" AS ENUM (
    'idle',
    'warmup',
    'active',
    'maintenance'
);


--
-- Name: GamePreference; Type: TYPE; Schema: shadow_temp; Owner: -
--

CREATE TYPE shadow_temp."GamePreference" AS ENUM (
    'no_preference',
    'same_gender'
);


--
-- Name: GameType; Type: TYPE; Schema: shadow_temp; Owner: -
--

CREATE TYPE shadow_temp."GameType" AS ENUM (
    'men',
    'women',
    'mixed'
);


--
-- Name: Gender; Type: TYPE; Schema: shadow_temp; Owner: -
--

CREATE TYPE shadow_temp."Gender" AS ENUM (
    'male',
    'female',
    'other'
);


--
-- Name: GroupStatus; Type: TYPE; Schema: shadow_temp; Owner: -
--

CREATE TYPE shadow_temp."GroupStatus" AS ENUM (
    'forming',
    'active',
    'disbanded'
);


--
-- Name: LessonType; Type: TYPE; Schema: shadow_temp; Owner: -
--

CREATE TYPE shadow_temp."LessonType" AS ENUM (
    'private',
    'group'
);


--
-- Name: MembershipPaymentStatus; Type: TYPE; Schema: shadow_temp; Owner: -
--

CREATE TYPE shadow_temp."MembershipPaymentStatus" AS ENUM (
    'UNPAID',
    'PAID',
    'OVERDUE'
);


--
-- Name: MembershipStatus; Type: TYPE; Schema: shadow_temp; Owner: -
--

CREATE TYPE shadow_temp."MembershipStatus" AS ENUM (
    'active',
    'suspended',
    'expired',
    'cancelled'
);


--
-- Name: PaymentStatus; Type: TYPE; Schema: shadow_temp; Owner: -
--

CREATE TYPE shadow_temp."PaymentStatus" AS ENUM (
    'UNPAID',
    'PAID'
);


--
-- Name: PlayerAppAuthMethod; Type: TYPE; Schema: shadow_temp; Owner: -
--

CREATE TYPE shadow_temp."PlayerAppAuthMethod" AS ENUM (
    'face_pwa',
    'wristband',
    'phone_otp'
);


--
-- Name: QueueStatus; Type: TYPE; Schema: shadow_temp; Owner: -
--

CREATE TYPE shadow_temp."QueueStatus" AS ENUM (
    'waiting',
    'assigned',
    'playing',
    'on_break',
    'left'
);


--
-- Name: SessionStatus; Type: TYPE; Schema: shadow_temp; Owner: -
--

CREATE TYPE shadow_temp."SessionStatus" AS ENUM (
    'open',
    'closed'
);


--
-- Name: SessionType; Type: TYPE; Schema: shadow_temp; Owner: -
--

CREATE TYPE shadow_temp."SessionType" AS ENUM (
    'open_play',
    'competition'
);


--
-- Name: SkillLevel; Type: TYPE; Schema: shadow_temp; Owner: -
--

CREATE TYPE shadow_temp."SkillLevel" AS ENUM (
    'beginner',
    'intermediate',
    'advanced',
    'pro'
);


--
-- Name: StaffRole; Type: TYPE; Schema: shadow_temp; Owner: -
--

CREATE TYPE shadow_temp."StaffRole" AS ENUM (
    'staff',
    'superadmin'
);


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: _prisma_migrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public._prisma_migrations (
    id character varying(36) NOT NULL,
    checksum character varying(64) NOT NULL,
    finished_at timestamp with time zone,
    migration_name character varying(255) NOT NULL,
    logs text,
    rolled_back_at timestamp with time zone,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    applied_steps_count integer DEFAULT 0 NOT NULL
);


--
-- Name: audit_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_logs (
    id text NOT NULL,
    venue_id text NOT NULL,
    staff_id text,
    action text NOT NULL,
    target_id text,
    reason text,
    metadata jsonb,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: billing_config; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.billing_config (
    id text DEFAULT 'default'::text NOT NULL,
    bank_bin text DEFAULT ''::text NOT NULL,
    bank_account text DEFAULT ''::text NOT NULL,
    bank_owner text DEFAULT ''::text NOT NULL,
    default_base_rate integer DEFAULT 5000 NOT NULL,
    default_sub_addon integer DEFAULT 1000 NOT NULL,
    default_sepay_addon integer DEFAULT 1000 NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL,
    payment_gateway text DEFAULT 'payos'::text NOT NULL,
    notification_email text
);


--
-- Name: billing_invoices; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.billing_invoices (
    id text NOT NULL,
    venue_id text NOT NULL,
    week_start_date timestamp(3) without time zone NOT NULL,
    week_end_date timestamp(3) without time zone NOT NULL,
    total_checkins integer DEFAULT 0 NOT NULL,
    subscription_checkins integer DEFAULT 0 NOT NULL,
    sepay_checkins integer DEFAULT 0 NOT NULL,
    base_amount integer DEFAULT 0 NOT NULL,
    subscription_amount integer DEFAULT 0 NOT NULL,
    sepay_amount integer DEFAULT 0 NOT NULL,
    total_amount integer DEFAULT 0 NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    payment_ref text,
    paid_at timestamp(3) without time zone,
    confirmed_by text,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL,
    comment text,
    paid_amount integer,
    payos_order_code text,
    invoice_type text DEFAULT 'weekly'::text NOT NULL
);


--
-- Name: billing_line_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.billing_line_items (
    id text NOT NULL,
    invoice_id text NOT NULL,
    check_in_record_id text NOT NULL,
    player_id text NOT NULL,
    checked_in_at timestamp(3) without time zone NOT NULL,
    base_rate integer NOT NULL,
    subscription_addon integer DEFAULT 0 NOT NULL,
    sepay_addon integer DEFAULT 0 NOT NULL,
    line_total integer NOT NULL
);


--
-- Name: booking_groups; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.booking_groups (
    id text NOT NULL,
    venue_id text NOT NULL,
    player_id text NOT NULL,
    date date NOT NULL,
    start_time timestamp without time zone NOT NULL,
    end_time timestamp without time zone NOT NULL,
    total_price_value integer DEFAULT 0 NOT NULL,
    payment_ref text,
    payment_status text,
    hold_expires_at timestamp without time zone,
    status text DEFAULT 'confirmed'::text NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    cancelled_at timestamp without time zone,
    invoice_number text,
    invoiced_at timestamp with time zone,
    cancellation_reason text
);


--
-- Name: bookings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bookings (
    id text NOT NULL,
    court_id text NOT NULL,
    venue_id text NOT NULL,
    player_id text NOT NULL,
    date date NOT NULL,
    start_time timestamp(3) without time zone NOT NULL,
    end_time timestamp(3) without time zone NOT NULL,
    status public."BookingStatus" DEFAULT 'confirmed'::public."BookingStatus" NOT NULL,
    price_value integer NOT NULL,
    co_player_ids text[],
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    cancelled_at timestamp(3) without time zone,
    payment_status text,
    payment_proof_url text,
    hold_expires_at timestamp(3) without time zone,
    payment_ref text,
    rejected_at timestamp(3) without time zone,
    rejected_by text,
    rejection_reason text,
    booking_group_id text,
    payment_method text,
    invoice_number text,
    invoiced_at timestamp with time zone,
    cancellation_reason text,
    company_open_bill_id text
);


--
-- Name: check_in_players; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.check_in_players (
    id text NOT NULL,
    venue_id text NOT NULL,
    name text NOT NULL,
    phone text NOT NULL,
    gender text,
    skill_level text,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    player_identity_id text
);


--
-- Name: check_in_records; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.check_in_records (
    id text NOT NULL,
    player_id text NOT NULL,
    venue_id text NOT NULL,
    checked_in_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    payment_id text,
    source text NOT NULL
);


--
-- Name: class_check_ins; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.class_check_ins (
    id text NOT NULL,
    class_pass_id text NOT NULL,
    class_instance_id text NOT NULL,
    checked_in_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: class_instances; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.class_instances (
    id text NOT NULL,
    venue_id text NOT NULL,
    coach_id text NOT NULL,
    court_id text,
    pass_type_id text NOT NULL,
    start_at timestamp(3) without time zone NOT NULL,
    end_at timestamp(3) without time zone NOT NULL,
    max_players integer NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL
);


--
-- Name: class_pass_payments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.class_pass_payments (
    id text NOT NULL,
    class_pass_id text NOT NULL,
    period_start timestamp(3) without time zone NOT NULL,
    period_end timestamp(3) without time zone NOT NULL,
    amount_value integer NOT NULL,
    status public."ClassPassPaymentStatus" DEFAULT 'UNPAID'::public."ClassPassPaymentStatus" NOT NULL,
    payment_method text,
    paid_at timestamp(3) without time zone,
    proof_url text,
    note text,
    void_reason text,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL
);


--
-- Name: class_passes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.class_passes (
    id text NOT NULL,
    player_id text NOT NULL,
    venue_id text NOT NULL,
    pass_type_id text NOT NULL,
    status public."ClassPassStatus" DEFAULT 'active'::public."ClassPassStatus" NOT NULL,
    activated_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deferred_start_date timestamp(3) without time zone,
    cycle_start timestamp(3) without time zone NOT NULL,
    cycle_end timestamp(3) without time zone NOT NULL,
    sessions_used integer DEFAULT 0 NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL
);


--
-- Name: coach_availabilities; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.coach_availabilities (
    id text NOT NULL,
    coach_id text NOT NULL,
    day_of_week integer NOT NULL,
    start_time text NOT NULL,
    end_time text NOT NULL,
    enabled boolean DEFAULT true NOT NULL
);


--
-- Name: coach_holidays; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.coach_holidays (
    id text NOT NULL,
    coach_id text NOT NULL,
    start_date date NOT NULL,
    end_date date NOT NULL,
    note text
);


--
-- Name: coach_lessons; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.coach_lessons (
    id text NOT NULL,
    venue_id text NOT NULL,
    coach_id text NOT NULL,
    player_id text NOT NULL,
    court_id text,
    package_id text NOT NULL,
    date date NOT NULL,
    start_time timestamp(3) without time zone NOT NULL,
    end_time timestamp(3) without time zone NOT NULL,
    status public."CoachLessonStatus" DEFAULT 'confirmed'::public."CoachLessonStatus" NOT NULL,
    price_value integer NOT NULL,
    note text,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    cancelled_at timestamp(3) without time zone,
    paid_at timestamp(3) without time zone,
    payment_method text,
    payment_note text,
    proof_url text,
    payment_status text DEFAULT 'UNPAID'::text NOT NULL,
    player_count integer,
    payment_ref text,
    rejected_at timestamp(3) without time zone,
    rejected_by text,
    rejection_reason text,
    google_event_id text,
    invoice_number text,
    invoiced_at timestamp with time zone,
    cancellation_reason text
);


--
-- Name: coach_packages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.coach_packages (
    id text NOT NULL,
    coach_id text NOT NULL,
    venue_id text NOT NULL,
    name text NOT NULL,
    description text,
    lesson_type public."LessonType" NOT NULL,
    duration_min integer NOT NULL,
    price_value integer NOT NULL,
    sessions_included integer DEFAULT 1 NOT NULL,
    active boolean DEFAULT true NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    min_players integer,
    max_players integer,
    price_per_additional_player integer
);


--
-- Name: company_account_players; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.company_account_players (
    id text NOT NULL,
    company_account_id text NOT NULL,
    player_id text NOT NULL,
    added_by text NOT NULL,
    added_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: company_accounts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.company_accounts (
    id text NOT NULL,
    venue_id text NOT NULL,
    name text NOT NULL,
    billing_email text,
    tax_id text,
    billing_address text,
    vat_percent integer DEFAULT 10 NOT NULL,
    price_vat_mode text DEFAULT 'excluded'::text NOT NULL,
    fixed_discount_percent integer DEFAULT 0 NOT NULL,
    payment_terms_days integer,
    open_bill_credit_limit integer,
    credit_limit_mode text DEFAULT 'warn_only'::text NOT NULL,
    primary_player_id text,
    contact_phone text,
    is_solo boolean DEFAULT false NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT company_accounts_credit_limit_mode_check CHECK ((credit_limit_mode = ANY (ARRAY['warn_only'::text, 'block'::text]))),
    CONSTRAINT company_accounts_fixed_discount_percent_check CHECK (((fixed_discount_percent >= 0) AND (fixed_discount_percent <= 100))),
    CONSTRAINT company_accounts_price_vat_mode_check CHECK ((price_vat_mode = ANY (ARRAY['excluded'::text, 'included'::text])))
);


--
-- Name: company_open_bill_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.company_open_bill_events (
    id text NOT NULL,
    bill_id text NOT NULL,
    event text NOT NULL,
    actor_id text,
    actor_type text,
    note text,
    meta jsonb,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: company_open_bills; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.company_open_bills (
    id text NOT NULL,
    venue_id text NOT NULL,
    company_account_id text NOT NULL,
    period_start date NOT NULL,
    period_end date,
    status text DEFAULT 'open'::text NOT NULL,
    subtotal integer DEFAULT 0 NOT NULL,
    discount_amount integer DEFAULT 0 NOT NULL,
    taxable_base integer DEFAULT 0 NOT NULL,
    vat_amount integer DEFAULT 0 NOT NULL,
    total_amount integer DEFAULT 0 NOT NULL,
    vat_percent integer DEFAULT 0 NOT NULL,
    price_vat_mode text DEFAULT 'excluded'::text NOT NULL,
    notes text,
    payment_ref text,
    invoice_number text,
    pdf_url text,
    due_date date,
    issued_at timestamp(3) without time zone,
    issued_by text,
    paid_at timestamp(3) without time zone,
    paid_by text,
    paid_method text,
    voided_at timestamp(3) without time zone,
    voided_by text,
    void_reason text,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT company_open_bills_status_check CHECK ((status = ANY (ARRAY['open'::text, 'issued'::text, 'paid'::text, 'overdue'::text, 'void'::text])))
);


--
-- Name: court_assignments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.court_assignments (
    id text NOT NULL,
    court_id text NOT NULL,
    session_id text NOT NULL,
    player_ids text[],
    group_ids text[],
    game_type public."GameType" DEFAULT 'mixed'::public."GameType" NOT NULL,
    is_warmup boolean DEFAULT false NOT NULL,
    started_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    ended_at timestamp(3) without time zone,
    ended_by text
);


--
-- Name: court_blocks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.court_blocks (
    id text NOT NULL,
    venue_id text NOT NULL,
    type public."CourtBlockType" NOT NULL,
    title text,
    note text,
    court_ids text[],
    date date NOT NULL,
    start_time timestamp(3) without time zone NOT NULL,
    end_time timestamp(3) without time zone NOT NULL,
    created_by text,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: courts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.courts (
    id text NOT NULL,
    venue_id text NOT NULL,
    label text NOT NULL,
    status public."CourtStatus" DEFAULT 'idle'::public."CourtStatus" NOT NULL,
    active_in_session boolean DEFAULT false NOT NULL,
    is_bookable boolean DEFAULT false NOT NULL,
    skip_warmup_after_maintenance boolean DEFAULT false NOT NULL,
    pricing_group_id text,
    price_override jsonb
);


--
-- Name: credit_transactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.credit_transactions (
    id text NOT NULL,
    credit_id text NOT NULL,
    lesson_id text,
    amount integer NOT NULL,
    reason text NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: email_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_logs (
    id text NOT NULL,
    player_id text NOT NULL,
    booking_type text NOT NULL,
    booking_id text NOT NULL,
    email_type text NOT NULL,
    resend_message_id text,
    sent_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    status text DEFAULT 'sent'::text NOT NULL,
    recipient_role text DEFAULT 'student'::text NOT NULL
);


--
-- Name: face_attempts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.face_attempts (
    id text NOT NULL,
    event_id text NOT NULL,
    matched_player_id text,
    result_type text NOT NULL,
    confidence double precision,
    image_url text,
    created_new_player boolean DEFAULT false NOT NULL,
    host_reviewed boolean DEFAULT false NOT NULL,
    queue_number_assigned integer,
    kiosk_device_id text,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    phone_number text
);


--
-- Name: face_recognition_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.face_recognition_logs (
    id text NOT NULL,
    venue_id text NOT NULL,
    player_id text,
    staff_id text,
    similarity_score double precision,
    threshold double precision NOT NULL,
    passed boolean NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: invoice_sequences; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.invoice_sequences (
    id integer NOT NULL,
    venue_id text NOT NULL,
    type text NOT NULL,
    year integer NOT NULL,
    last_seq integer DEFAULT 0 NOT NULL
);


--
-- Name: invoice_sequences_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.invoice_sequences_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: invoice_sequences_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.invoice_sequences_id_seq OWNED BY public.invoice_sequences.id;


--
-- Name: kiosk_devices; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.kiosk_devices (
    id text NOT NULL,
    name text NOT NULL,
    location text,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: kiosk_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.kiosk_settings (
    id text DEFAULT 'global'::text NOT NULL,
    sticker_price integer DEFAULT 30000 NOT NULL,
    bank_bin text DEFAULT ''::text NOT NULL,
    bank_account text DEFAULT ''::text NOT NULL,
    bank_owner_name text DEFAULT ''::text NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL,
    chroma_tolerance integer DEFAULT 65 NOT NULL,
    feather_radius double precision DEFAULT 0.8 NOT NULL
);


--
-- Name: manual_billing_invoices; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.manual_billing_invoices (
    id text NOT NULL,
    venue_id text NOT NULL,
    amount integer NOT NULL,
    due_date timestamp(3) without time zone NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    pdf_url text,
    paid_at timestamp(3) without time zone,
    paid_method text,
    paid_ref text,
    notes text,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    proof_url text,
    proof_submitted_at timestamp(3) without time zone,
    proof_method text,
    proof_ref text
);


--
-- Name: membership_payments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.membership_payments (
    id text NOT NULL,
    membership_id text NOT NULL,
    period_start timestamp(3) without time zone NOT NULL,
    period_end timestamp(3) without time zone NOT NULL,
    amount_value integer NOT NULL,
    status public."MembershipPaymentStatus" DEFAULT 'UNPAID'::public."MembershipPaymentStatus" NOT NULL,
    paid_at timestamp(3) without time zone,
    payment_method text,
    note text,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    proof_url text
);


--
-- Name: membership_tiers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.membership_tiers (
    id text NOT NULL,
    venue_id text NOT NULL,
    sort_order integer NOT NULL,
    name text NOT NULL,
    price_value integer NOT NULL,
    sessions_included integer,
    show_badge boolean DEFAULT false NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    perks jsonb DEFAULT '[]'::jsonb NOT NULL
);


--
-- Name: memberships; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.memberships (
    id text NOT NULL,
    player_id text NOT NULL,
    venue_id text NOT NULL,
    tier_id text NOT NULL,
    status public."MembershipStatus" DEFAULT 'active'::public."MembershipStatus" NOT NULL,
    activated_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    renewal_date timestamp(3) without time zone NOT NULL,
    sessions_used integer DEFAULT 0 NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL
);


--
-- Name: open_play_registrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.open_play_registrations (
    id text NOT NULL,
    venue_id text NOT NULL,
    schedule_entry_id text NOT NULL,
    date date NOT NULL,
    start_time timestamp(3) without time zone NOT NULL,
    end_time timestamp(3) without time zone NOT NULL,
    player_id text NOT NULL,
    price_value integer NOT NULL,
    payment_status text DEFAULT 'pending'::text NOT NULL,
    hold_expires_at timestamp(3) without time zone,
    payment_proof_url text,
    payment_ref text,
    status text DEFAULT 'confirmed'::text NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    cancelled_at timestamp(3) without time zone,
    rejected_at timestamp(3) without time zone,
    rejected_by text,
    rejection_reason text,
    expired_at timestamp with time zone,
    payment_method text,
    invoice_number text,
    invoiced_at timestamp with time zone,
    cancellation_reason text
);


--
-- Name: organizations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.organizations (
    id text NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    country text NOT NULL,
    payment_region text DEFAULT 'SEA'::text NOT NULL,
    currency text DEFAULT 'VND'::text NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL,
    legal_company_name text,
    registration_number text,
    tax_id text,
    registered_address text
);


--
-- Name: otp_codes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.otp_codes (
    id text NOT NULL,
    phone text NOT NULL,
    code text NOT NULL,
    expires_at timestamp(3) without time zone NOT NULL,
    verified boolean DEFAULT false NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: pending_payments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pending_payments (
    id text NOT NULL,
    venue_id text NOT NULL,
    session_id text,
    player_id text,
    amount integer NOT NULL,
    payment_method text DEFAULT 'vietqr'::text NOT NULL,
    type text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    expires_at timestamp(3) without time zone NOT NULL,
    confirmed_at timestamp(3) without time zone,
    confirmed_by text,
    check_in_player_id text,
    payment_ref text,
    cancel_reason text,
    cancelled_at timestamp(3) without time zone,
    party_count integer DEFAULT 1 NOT NULL,
    group_paid_by_name text,
    group_paid_by_payment_id text,
    confirmed_on_device text
);


--
-- Name: player_accounts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.player_accounts (
    id text NOT NULL,
    player_id text NOT NULL,
    provider text NOT NULL,
    provider_account_id text NOT NULL,
    email text,
    name text,
    image text,
    password_hash text,
    email_verified boolean DEFAULT false NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    country text
);


--
-- Name: player_app_auth_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.player_app_auth_logs (
    id text NOT NULL,
    player_id text NOT NULL,
    method public."PlayerAppAuthMethod" NOT NULL,
    session_id text,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: player_coach_credits; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.player_coach_credits (
    id text NOT NULL,
    player_id text NOT NULL,
    coach_id text NOT NULL,
    venue_id text NOT NULL,
    package_id text NOT NULL,
    total_sessions integer NOT NULL,
    used_sessions integer DEFAULT 0 NOT NULL,
    price_value integer NOT NULL,
    payment_ref text,
    payment_status text DEFAULT 'pending'::text NOT NULL,
    proof_url text,
    confirmed_by text,
    confirmed_at timestamp(3) without time zone,
    expires_at timestamp(3) without time zone NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL
);


--
-- Name: player_custom_prices; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.player_custom_prices (
    id text NOT NULL,
    player_id text NOT NULL,
    staff_id text NOT NULL,
    discount_type text NOT NULL,
    custom_fee integer,
    discount_pct integer,
    note text,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL
);


--
-- Name: player_groups; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.player_groups (
    id text NOT NULL,
    session_id text NOT NULL,
    code text NOT NULL,
    status public."GroupStatus" DEFAULT 'forming'::public."GroupStatus" NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: player_identities; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.player_identities (
    id text NOT NULL,
    name text NOT NULL,
    email text,
    phone text,
    skill_level text,
    gender text,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL
);


--
-- Name: player_magic_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.player_magic_tokens (
    id text NOT NULL,
    player_id text NOT NULL,
    jti text NOT NULL,
    expires_at timestamp(3) without time zone NOT NULL,
    used_at timestamp(3) without time zone,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: player_notes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.player_notes (
    id text NOT NULL,
    player_id text NOT NULL,
    venue_id text NOT NULL,
    content text NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL,
    updated_by text
);


--
-- Name: player_password_reset_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.player_password_reset_tokens (
    id text NOT NULL,
    player_id text NOT NULL,
    jti text NOT NULL,
    expires_at timestamp(3) without time zone NOT NULL,
    used_at timestamp(3) without time zone,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: player_rankings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.player_rankings (
    id text NOT NULL,
    player_id text NOT NULL,
    court_id text NOT NULL,
    session_id text NOT NULL,
    staff_id text NOT NULL,
    "position" integer NOT NULL,
    score_delta integer NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: player_sticker_packs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.player_sticker_packs (
    id text NOT NULL,
    player_id text NOT NULL,
    result_id text NOT NULL,
    sticker_1_url text,
    sticker_2_url text,
    sticker_3_url text,
    sticker_4_url text,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL,
    is_paid boolean DEFAULT false NOT NULL,
    paid_at timestamp(3) without time zone,
    payment_code text,
    payos_order_code text,
    how_to_card_url text
);


--
-- Name: player_sticker_photos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.player_sticker_photos (
    id text NOT NULL,
    player_id text NOT NULL,
    image_url text NOT NULL,
    slot_index integer NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT player_sticker_photos_slot_index_check CHECK (((slot_index >= 2) AND (slot_index <= 4)))
);


--
-- Name: player_sticker_results; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.player_sticker_results (
    id text NOT NULL,
    player_id text NOT NULL,
    image_url text NOT NULL,
    prompt text NOT NULL,
    model text DEFAULT 'gpt-image-1'::character varying NOT NULL,
    size text DEFAULT '1024x1024'::character varying NOT NULL,
    cost_usd numeric(6,4) DEFAULT 0.04 NOT NULL,
    generation_time_seconds numeric(6,2),
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL
);


--
-- Name: player_subscriptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.player_subscriptions (
    id text NOT NULL,
    player_id text NOT NULL,
    package_id text NOT NULL,
    venue_id text NOT NULL,
    status public."SubscriptionStatus" DEFAULT 'active'::public."SubscriptionStatus" NOT NULL,
    sessions_remaining integer,
    activated_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    expires_at timestamp(3) without time zone NOT NULL,
    payment_ref text,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL
);


--
-- Name: players; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.players (
    id text NOT NULL,
    name text NOT NULL,
    phone text NOT NULL,
    avatar text DEFAULT '🏓'::text NOT NULL,
    skill_level public."SkillLevel" DEFAULT 'beginner'::public."SkillLevel" NOT NULL,
    gender public."Gender" NOT NULL,
    game_preference public."GamePreference" DEFAULT 'no_preference'::public."GamePreference" NOT NULL,
    notifications_enabled boolean DEFAULT false NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    face_subject_id text,
    face_photo_path text,
    ranking_score integer DEFAULT 200 NOT NULL,
    ranking_count integer DEFAULT 0 NOT NULL,
    last_ranked_at timestamp(3) without time zone,
    avatar_photo_path text,
    is_walk_in boolean DEFAULT false NOT NULL,
    reclub_user_id integer,
    registration_at timestamp(3) without time zone,
    registration_venue_id text,
    coach_staff_id text,
    email text,
    password_hash text,
    player_identity_id text,
    blurred_face_photo_path text
);


--
-- Name: pricing_groups; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pricing_groups (
    id text NOT NULL,
    venue_id text NOT NULL,
    name text NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    is_default boolean DEFAULT false NOT NULL,
    is_unconfigured boolean DEFAULT false NOT NULL,
    default_price_value integer DEFAULT 0 NOT NULL,
    pricing_rules jsonb DEFAULT '[]'::jsonb NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL
);


--
-- Name: program_pass_type_coaches; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.program_pass_type_coaches (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    pass_type_id text NOT NULL,
    coach_id text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: program_pass_types; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.program_pass_types (
    id text NOT NULL,
    venue_id text NOT NULL,
    name text NOT NULL,
    price integer NOT NULL,
    sessions_included integer DEFAULT 12 NOT NULL,
    cycle_length_days integer DEFAULT 30 NOT NULL,
    linked_coach_id text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL
);


--
-- Name: promo_codes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.promo_codes (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    venue_id text NOT NULL,
    name text NOT NULL,
    code text NOT NULL,
    discount_type public."PromoDiscountType" NOT NULL,
    discount_value integer,
    applies_to public."PromoAppliesTo" DEFAULT 'all'::public."PromoAppliesTo" NOT NULL,
    max_redemptions integer,
    redemption_count integer DEFAULT 0 NOT NULL,
    max_redemptions_per_player integer DEFAULT 1,
    starts_at timestamp(6) without time zone NOT NULL,
    ends_at timestamp(6) without time zone,
    is_active boolean DEFAULT true NOT NULL,
    post_text text,
    headline text,
    created_at timestamp(6) without time zone DEFAULT now() NOT NULL,
    updated_at timestamp(6) without time zone DEFAULT now() NOT NULL
);


--
-- Name: promo_link_clicks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.promo_link_clicks (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    promo_code_id text NOT NULL,
    player_id text,
    utm_source text,
    device_session_id text NOT NULL,
    clicked_at timestamp(6) without time zone DEFAULT now() NOT NULL
);


--
-- Name: promo_redemptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.promo_redemptions (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    promo_code_id text NOT NULL,
    player_id text NOT NULL,
    booking_id text,
    booking_type public."PromoBookingType" NOT NULL,
    utm_source text,
    discount_amount integer NOT NULL,
    original_price integer NOT NULL,
    final_price integer NOT NULL,
    first_click_id text,
    redeemed_at timestamp(6) without time zone DEFAULT now() NOT NULL
);


--
-- Name: push_subscriptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.push_subscriptions (
    id text NOT NULL,
    player_id text NOT NULL,
    endpoint text NOT NULL,
    p256dh text NOT NULL,
    auth text NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: queue_entries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.queue_entries (
    id text NOT NULL,
    session_id text NOT NULL,
    player_id text NOT NULL,
    group_id text,
    joined_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    status public."QueueStatus" DEFAULT 'waiting'::public."QueueStatus" NOT NULL,
    break_until timestamp(3) without time zone,
    total_play_minutes_today integer DEFAULT 0 NOT NULL,
    game_preference public."GamePreference" DEFAULT 'no_preference'::public."GamePreference" NOT NULL,
    queue_number integer
);


--
-- Name: schema_migrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.schema_migrations (
    version character varying NOT NULL
);


--
-- Name: sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sessions (
    id text NOT NULL,
    venue_id text NOT NULL,
    date timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    opened_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    closed_at timestamp(3) without time zone,
    status public."SessionStatus" DEFAULT 'open'::public."SessionStatus" NOT NULL,
    game_type_mix jsonb,
    max_players integer,
    staff_id text,
    warmup_mode text DEFAULT 'manual'::text NOT NULL,
    title text,
    type public."SessionType" DEFAULT 'open_play'::public."SessionType" NOT NULL,
    intro_warmup_complete boolean DEFAULT false NOT NULL,
    session_fee integer DEFAULT 0 NOT NULL,
    reclub_event_name text,
    reclub_reference_code text,
    reclub_roster jsonb,
    reclub_snapshot jsonb,
    opened_on_device text
);


--
-- Name: signup_duplicate_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.signup_duplicate_logs (
    id text NOT NULL,
    new_player_photo_path text,
    new_player_name text,
    new_player_phone text,
    matched_player_id text NOT NULL,
    similarity_score double precision,
    threshold double precision,
    aws_face_id text,
    aws_detail jsonb,
    source text DEFAULT 'unknown'::text NOT NULL,
    venue_id text,
    reviewed boolean DEFAULT false NOT NULL,
    reviewed_at timestamp(3) without time zone,
    review_note text,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: staff_auth_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.staff_auth_logs (
    id text NOT NULL,
    staff_id text,
    action text NOT NULL,
    phone text,
    ip_address text,
    country text,
    city text,
    user_agent text,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    fingerprint_id text,
    fingerprint_confidence double precision,
    is_vpn boolean,
    is_threat boolean
);


--
-- Name: staff_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.staff_members (
    id text NOT NULL,
    name text NOT NULL,
    phone text NOT NULL,
    email text,
    role public."StaffRole" DEFAULT 'staff'::public."StaffRole" NOT NULL,
    password_hash text NOT NULL,
    onboarding_completed boolean DEFAULT false NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    coach_bio text,
    coach_photo text,
    is_coach boolean DEFAULT false NOT NULL,
    push_notifications_enabled boolean DEFAULT false NOT NULL,
    reclub_group_id integer,
    coach_dupr text,
    coach_gender text,
    coach_languages text[] DEFAULT ARRAY[]::text[],
    coach_specialties text[] DEFAULT ARRAY[]::text[],
    coach_focus_levels text[] DEFAULT ARRAY[]::text[],
    coach_years_experience text,
    coach_group_sizes text[] DEFAULT ARRAY[]::text[],
    google_refresh_token text,
    google_calendar_id text,
    calendar_sync_enabled boolean DEFAULT false NOT NULL,
    credit_package_validity_days integer DEFAULT 90 NOT NULL
);


--
-- Name: staff_payments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.staff_payments (
    id text NOT NULL,
    staff_id text NOT NULL,
    week_start timestamp(3) without time zone NOT NULL,
    total_hours numeric(6,1) NOT NULL,
    amount numeric(10,0),
    payment_method text,
    status public."PaymentStatus" DEFAULT 'UNPAID'::public."PaymentStatus" NOT NULL,
    paid_at timestamp(3) without time zone,
    paid_date timestamp(3) without time zone,
    paid_by_id text,
    note text,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL
);


--
-- Name: staff_push_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.staff_push_tokens (
    id text NOT NULL,
    staff_id text NOT NULL,
    venue_id text,
    token text NOT NULL,
    platform text DEFAULT 'android'::text NOT NULL,
    device_id text,
    active boolean DEFAULT true NOT NULL,
    last_seen_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL
);


--
-- Name: staff_venue_assignments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.staff_venue_assignments (
    id text NOT NULL,
    staff_id text NOT NULL,
    venue_id text NOT NULL,
    app_access text[] DEFAULT ARRAY['courtflow'::text] NOT NULL
);


--
-- Name: sticker_job_queue; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sticker_job_queue (
    id text NOT NULL,
    player_id text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    error text,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL
);


--
-- Name: sticker_payment_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sticker_payment_logs (
    id text NOT NULL,
    payos_order_code text NOT NULL,
    payment_code text NOT NULL,
    transfer_amount integer NOT NULL,
    content text DEFAULT ''::text NOT NULL,
    processed_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: sticker_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sticker_sessions (
    id text NOT NULL,
    player_id text NOT NULL,
    token text NOT NULL,
    expires_at timestamp(3) without time zone NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: sticker_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sticker_templates (
    id text NOT NULL,
    name text NOT NULL,
    male_prompt text NOT NULL,
    female_prompt text NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL
);


--
-- Name: subscription_packages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.subscription_packages (
    id text NOT NULL,
    venue_id text NOT NULL,
    name text NOT NULL,
    sessions integer,
    duration_days integer NOT NULL,
    price integer NOT NULL,
    perks text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL,
    discount_pct integer,
    is_best_choice boolean DEFAULT false NOT NULL,
    show_in_check_in boolean DEFAULT true NOT NULL,
    is_free_pass boolean DEFAULT false NOT NULL
);


--
-- Name: subscription_usages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.subscription_usages (
    id text NOT NULL,
    subscription_id text NOT NULL,
    checked_in_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: venue_billing_rates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.venue_billing_rates (
    id text NOT NULL,
    venue_id text NOT NULL,
    base_rate_per_checkin integer DEFAULT 5000 NOT NULL,
    subscription_addon integer DEFAULT 1000 NOT NULL,
    sepay_addon integer DEFAULT 1000 NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL,
    is_free_base boolean DEFAULT false NOT NULL,
    is_free_sub_addon boolean DEFAULT false NOT NULL,
    is_free_sepay_addon boolean DEFAULT false NOT NULL,
    billing_model text DEFAULT 'per_payment'::text NOT NULL,
    monthly_rate integer DEFAULT 0 NOT NULL,
    monthly_period_start timestamp(3) without time zone,
    monthly_end_date timestamp(3) without time zone,
    monthly_status text DEFAULT 'inactive'::text NOT NULL
);


--
-- Name: venues; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.venues (
    id text NOT NULL,
    name text NOT NULL,
    location text,
    settings jsonb DEFAULT '{}'::jsonb NOT NULL,
    active boolean DEFAULT true NOT NULL,
    expected_max_players integer,
    play_frequency text,
    play_types text[] DEFAULT ARRAY[]::text[],
    pain_points text[] DEFAULT ARRAY[]::text[],
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    logo_url text,
    tv_text text,
    bank_account text,
    bank_name text,
    bank_owner_name text,
    billing_status text DEFAULT 'active'::text NOT NULL,
    owner_id text,
    slug text,
    portal_enabled boolean DEFAULT false NOT NULL,
    contact_phone text,
    contact_whatsapp text,
    contact_zalo text,
    contact_line text,
    timezone text DEFAULT 'Asia/Ho_Chi_Minh'::text NOT NULL,
    organization_id text,
    sport_type text DEFAULT 'pickleball'::text NOT NULL
);


--
-- Name: _StaffMemberToVenue; Type: TABLE; Schema: shadow_temp; Owner: -
--

CREATE TABLE shadow_temp."_StaffMemberToVenue" (
    "A" text NOT NULL,
    "B" text NOT NULL
);


--
-- Name: audit_logs; Type: TABLE; Schema: shadow_temp; Owner: -
--

CREATE TABLE shadow_temp.audit_logs (
    id text NOT NULL,
    venue_id text NOT NULL,
    staff_id text,
    action text NOT NULL,
    target_id text,
    reason text,
    metadata jsonb,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: bookings; Type: TABLE; Schema: shadow_temp; Owner: -
--

CREATE TABLE shadow_temp.bookings (
    id text NOT NULL,
    court_id text NOT NULL,
    venue_id text NOT NULL,
    player_id text NOT NULL,
    date date NOT NULL,
    start_time timestamp(3) without time zone NOT NULL,
    end_time timestamp(3) without time zone NOT NULL,
    status shadow_temp."BookingStatus" DEFAULT 'confirmed'::shadow_temp."BookingStatus" NOT NULL,
    price_in_cents integer NOT NULL,
    co_player_ids text[],
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    cancelled_at timestamp(3) without time zone
);


--
-- Name: coach_lessons; Type: TABLE; Schema: shadow_temp; Owner: -
--

CREATE TABLE shadow_temp.coach_lessons (
    id text NOT NULL,
    venue_id text NOT NULL,
    coach_id text NOT NULL,
    player_id text NOT NULL,
    court_id text,
    package_id text NOT NULL,
    date date NOT NULL,
    start_time timestamp(3) without time zone NOT NULL,
    end_time timestamp(3) without time zone NOT NULL,
    status shadow_temp."CoachLessonStatus" DEFAULT 'confirmed'::shadow_temp."CoachLessonStatus" NOT NULL,
    price_in_cents integer NOT NULL,
    note text,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    cancelled_at timestamp(3) without time zone,
    paid_at timestamp(3) without time zone,
    payment_method text,
    payment_note text,
    proof_url text,
    payment_status text DEFAULT 'UNPAID'::text NOT NULL
);


--
-- Name: coach_packages; Type: TABLE; Schema: shadow_temp; Owner: -
--

CREATE TABLE shadow_temp.coach_packages (
    id text NOT NULL,
    coach_id text NOT NULL,
    venue_id text NOT NULL,
    name text NOT NULL,
    description text,
    lesson_type shadow_temp."LessonType" NOT NULL,
    duration_min integer NOT NULL,
    price_in_cents integer NOT NULL,
    sessions_included integer DEFAULT 1 NOT NULL,
    active boolean DEFAULT true NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: court_assignments; Type: TABLE; Schema: shadow_temp; Owner: -
--

CREATE TABLE shadow_temp.court_assignments (
    id text NOT NULL,
    court_id text NOT NULL,
    session_id text NOT NULL,
    player_ids text[],
    group_ids text[],
    game_type shadow_temp."GameType" DEFAULT 'mixed'::shadow_temp."GameType" NOT NULL,
    is_warmup boolean DEFAULT false NOT NULL,
    started_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    ended_at timestamp(3) without time zone,
    ended_by text
);


--
-- Name: court_blocks; Type: TABLE; Schema: shadow_temp; Owner: -
--

CREATE TABLE shadow_temp.court_blocks (
    id text NOT NULL,
    venue_id text NOT NULL,
    type shadow_temp."CourtBlockType" NOT NULL,
    title text,
    note text,
    court_ids text[],
    date date NOT NULL,
    start_time timestamp(3) without time zone NOT NULL,
    end_time timestamp(3) without time zone NOT NULL,
    created_by text,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: courts; Type: TABLE; Schema: shadow_temp; Owner: -
--

CREATE TABLE shadow_temp.courts (
    id text NOT NULL,
    venue_id text NOT NULL,
    label text NOT NULL,
    status shadow_temp."CourtStatus" DEFAULT 'idle'::shadow_temp."CourtStatus" NOT NULL,
    active_in_session boolean DEFAULT false NOT NULL,
    is_bookable boolean DEFAULT false NOT NULL,
    skip_warmup_after_maintenance boolean DEFAULT false NOT NULL
);


--
-- Name: face_attempts; Type: TABLE; Schema: shadow_temp; Owner: -
--

CREATE TABLE shadow_temp.face_attempts (
    id text NOT NULL,
    event_id text NOT NULL,
    matched_player_id text,
    result_type text NOT NULL,
    confidence double precision,
    image_url text,
    created_new_player boolean DEFAULT false NOT NULL,
    host_reviewed boolean DEFAULT false NOT NULL,
    queue_number_assigned integer,
    kiosk_device_id text,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    phone_number text
);


--
-- Name: kiosk_devices; Type: TABLE; Schema: shadow_temp; Owner: -
--

CREATE TABLE shadow_temp.kiosk_devices (
    id text NOT NULL,
    name text NOT NULL,
    location text,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: membership_payments; Type: TABLE; Schema: shadow_temp; Owner: -
--

CREATE TABLE shadow_temp.membership_payments (
    id text NOT NULL,
    membership_id text NOT NULL,
    period_start timestamp(3) without time zone NOT NULL,
    period_end timestamp(3) without time zone NOT NULL,
    amount_in_cents integer NOT NULL,
    status shadow_temp."MembershipPaymentStatus" DEFAULT 'UNPAID'::shadow_temp."MembershipPaymentStatus" NOT NULL,
    paid_at timestamp(3) without time zone,
    payment_method text,
    note text,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    proof_url text
);


--
-- Name: membership_tiers; Type: TABLE; Schema: shadow_temp; Owner: -
--

CREATE TABLE shadow_temp.membership_tiers (
    id text NOT NULL,
    venue_id text NOT NULL,
    sort_order integer NOT NULL,
    name text NOT NULL,
    price_in_cents integer NOT NULL,
    sessions_included integer,
    show_badge boolean DEFAULT false NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    perks jsonb DEFAULT '[]'::jsonb NOT NULL
);


--
-- Name: memberships; Type: TABLE; Schema: shadow_temp; Owner: -
--

CREATE TABLE shadow_temp.memberships (
    id text NOT NULL,
    player_id text NOT NULL,
    venue_id text NOT NULL,
    tier_id text NOT NULL,
    status shadow_temp."MembershipStatus" DEFAULT 'active'::shadow_temp."MembershipStatus" NOT NULL,
    activated_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    renewal_date timestamp(3) without time zone NOT NULL,
    sessions_used integer DEFAULT 0 NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL
);


--
-- Name: otp_codes; Type: TABLE; Schema: shadow_temp; Owner: -
--

CREATE TABLE shadow_temp.otp_codes (
    id text NOT NULL,
    phone text NOT NULL,
    code text NOT NULL,
    expires_at timestamp(3) without time zone NOT NULL,
    verified boolean DEFAULT false NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: pending_payments; Type: TABLE; Schema: shadow_temp; Owner: -
--

CREATE TABLE shadow_temp.pending_payments (
    id text NOT NULL,
    venue_id text NOT NULL,
    session_id text NOT NULL,
    player_id text NOT NULL,
    amount integer NOT NULL,
    payment_method text DEFAULT 'vietqr'::text NOT NULL,
    type text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    expires_at timestamp(3) without time zone NOT NULL,
    confirmed_at timestamp(3) without time zone,
    confirmed_by text
);


--
-- Name: player_app_auth_logs; Type: TABLE; Schema: shadow_temp; Owner: -
--

CREATE TABLE shadow_temp.player_app_auth_logs (
    id text NOT NULL,
    player_id text NOT NULL,
    method shadow_temp."PlayerAppAuthMethod" NOT NULL,
    session_id text,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: player_groups; Type: TABLE; Schema: shadow_temp; Owner: -
--

CREATE TABLE shadow_temp.player_groups (
    id text NOT NULL,
    session_id text NOT NULL,
    code text NOT NULL,
    status shadow_temp."GroupStatus" DEFAULT 'forming'::shadow_temp."GroupStatus" NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: player_rankings; Type: TABLE; Schema: shadow_temp; Owner: -
--

CREATE TABLE shadow_temp.player_rankings (
    id text NOT NULL,
    player_id text NOT NULL,
    court_id text NOT NULL,
    session_id text NOT NULL,
    staff_id text NOT NULL,
    "position" integer NOT NULL,
    score_delta integer NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: players; Type: TABLE; Schema: shadow_temp; Owner: -
--

CREATE TABLE shadow_temp.players (
    id text NOT NULL,
    name text NOT NULL,
    phone text NOT NULL,
    avatar text DEFAULT '🏓'::text NOT NULL,
    skill_level shadow_temp."SkillLevel" DEFAULT 'beginner'::shadow_temp."SkillLevel" NOT NULL,
    gender shadow_temp."Gender" NOT NULL,
    game_preference shadow_temp."GamePreference" DEFAULT 'no_preference'::shadow_temp."GamePreference" NOT NULL,
    notifications_enabled boolean DEFAULT false NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    face_subject_id text,
    face_photo_path text,
    ranking_score integer DEFAULT 200 NOT NULL,
    ranking_count integer DEFAULT 0 NOT NULL,
    last_ranked_at timestamp(3) without time zone,
    avatar_photo_path text
);


--
-- Name: push_subscriptions; Type: TABLE; Schema: shadow_temp; Owner: -
--

CREATE TABLE shadow_temp.push_subscriptions (
    id text NOT NULL,
    player_id text NOT NULL,
    endpoint text NOT NULL,
    p256dh text NOT NULL,
    auth text NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: queue_entries; Type: TABLE; Schema: shadow_temp; Owner: -
--

CREATE TABLE shadow_temp.queue_entries (
    id text NOT NULL,
    session_id text NOT NULL,
    player_id text NOT NULL,
    group_id text,
    joined_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    status shadow_temp."QueueStatus" DEFAULT 'waiting'::shadow_temp."QueueStatus" NOT NULL,
    break_until timestamp(3) without time zone,
    total_play_minutes_today integer DEFAULT 0 NOT NULL,
    game_preference shadow_temp."GamePreference" DEFAULT 'no_preference'::shadow_temp."GamePreference" NOT NULL,
    queue_number integer
);


--
-- Name: sessions; Type: TABLE; Schema: shadow_temp; Owner: -
--

CREATE TABLE shadow_temp.sessions (
    id text NOT NULL,
    venue_id text NOT NULL,
    date timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    opened_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    closed_at timestamp(3) without time zone,
    status shadow_temp."SessionStatus" DEFAULT 'open'::shadow_temp."SessionStatus" NOT NULL,
    game_type_mix jsonb,
    max_players integer,
    staff_id text,
    warmup_mode text DEFAULT 'manual'::text NOT NULL,
    title text,
    type shadow_temp."SessionType" DEFAULT 'open_play'::shadow_temp."SessionType" NOT NULL,
    intro_warmup_complete boolean DEFAULT false NOT NULL,
    session_fee integer DEFAULT 0 NOT NULL
);


--
-- Name: staff_members; Type: TABLE; Schema: shadow_temp; Owner: -
--

CREATE TABLE shadow_temp.staff_members (
    id text NOT NULL,
    name text NOT NULL,
    phone text NOT NULL,
    email text,
    role shadow_temp."StaffRole" DEFAULT 'staff'::shadow_temp."StaffRole" NOT NULL,
    password_hash text NOT NULL,
    onboarding_completed boolean DEFAULT false NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    coach_bio text,
    coach_photo text,
    is_coach boolean DEFAULT false NOT NULL
);


--
-- Name: staff_payments; Type: TABLE; Schema: shadow_temp; Owner: -
--

CREATE TABLE shadow_temp.staff_payments (
    id text NOT NULL,
    staff_id text NOT NULL,
    week_start timestamp(3) without time zone NOT NULL,
    total_hours numeric(6,1) NOT NULL,
    amount numeric(10,0),
    payment_method text,
    status shadow_temp."PaymentStatus" DEFAULT 'UNPAID'::shadow_temp."PaymentStatus" NOT NULL,
    paid_at timestamp(3) without time zone,
    paid_date timestamp(3) without time zone,
    paid_by_id text,
    note text,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL
);


--
-- Name: venues; Type: TABLE; Schema: shadow_temp; Owner: -
--

CREATE TABLE shadow_temp.venues (
    id text NOT NULL,
    name text NOT NULL,
    location text,
    settings jsonb DEFAULT '{}'::jsonb NOT NULL,
    active boolean DEFAULT true NOT NULL,
    expected_max_players integer,
    play_frequency text,
    play_types text[] DEFAULT ARRAY[]::text[],
    pain_points text[] DEFAULT ARRAY[]::text[],
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    logo_url text,
    tv_text text,
    bank_account text,
    bank_name text,
    bank_owner_name text
);


--
-- Name: invoice_sequences id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice_sequences ALTER COLUMN id SET DEFAULT nextval('public.invoice_sequences_id_seq'::regclass);


--
-- Name: _prisma_migrations _prisma_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public._prisma_migrations
    ADD CONSTRAINT _prisma_migrations_pkey PRIMARY KEY (id);


--
-- Name: audit_logs audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_pkey PRIMARY KEY (id);


--
-- Name: billing_config billing_config_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_config
    ADD CONSTRAINT billing_config_pkey PRIMARY KEY (id);


--
-- Name: billing_invoices billing_invoices_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_invoices
    ADD CONSTRAINT billing_invoices_pkey PRIMARY KEY (id);


--
-- Name: billing_line_items billing_line_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_line_items
    ADD CONSTRAINT billing_line_items_pkey PRIMARY KEY (id);


--
-- Name: booking_groups booking_groups_invoice_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.booking_groups
    ADD CONSTRAINT booking_groups_invoice_number_key UNIQUE (invoice_number);


--
-- Name: booking_groups booking_groups_payment_ref_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.booking_groups
    ADD CONSTRAINT booking_groups_payment_ref_key UNIQUE (payment_ref);


--
-- Name: booking_groups booking_groups_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.booking_groups
    ADD CONSTRAINT booking_groups_pkey PRIMARY KEY (id);


--
-- Name: bookings bookings_invoice_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bookings
    ADD CONSTRAINT bookings_invoice_number_key UNIQUE (invoice_number);


--
-- Name: bookings bookings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bookings
    ADD CONSTRAINT bookings_pkey PRIMARY KEY (id);


--
-- Name: check_in_players check_in_players_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.check_in_players
    ADD CONSTRAINT check_in_players_pkey PRIMARY KEY (id);


--
-- Name: check_in_records check_in_records_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.check_in_records
    ADD CONSTRAINT check_in_records_pkey PRIMARY KEY (id);


--
-- Name: class_check_ins class_check_ins_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.class_check_ins
    ADD CONSTRAINT class_check_ins_pkey PRIMARY KEY (id);


--
-- Name: class_instances class_instances_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.class_instances
    ADD CONSTRAINT class_instances_pkey PRIMARY KEY (id);


--
-- Name: class_pass_payments class_pass_payments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.class_pass_payments
    ADD CONSTRAINT class_pass_payments_pkey PRIMARY KEY (id);


--
-- Name: class_passes class_passes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.class_passes
    ADD CONSTRAINT class_passes_pkey PRIMARY KEY (id);


--
-- Name: coach_availabilities coach_availabilities_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coach_availabilities
    ADD CONSTRAINT coach_availabilities_pkey PRIMARY KEY (id);


--
-- Name: coach_holidays coach_holidays_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coach_holidays
    ADD CONSTRAINT coach_holidays_pkey PRIMARY KEY (id);


--
-- Name: coach_lessons coach_lessons_invoice_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coach_lessons
    ADD CONSTRAINT coach_lessons_invoice_number_key UNIQUE (invoice_number);


--
-- Name: coach_lessons coach_lessons_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coach_lessons
    ADD CONSTRAINT coach_lessons_pkey PRIMARY KEY (id);


--
-- Name: coach_packages coach_packages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coach_packages
    ADD CONSTRAINT coach_packages_pkey PRIMARY KEY (id);


--
-- Name: company_account_players company_account_players_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_account_players
    ADD CONSTRAINT company_account_players_pkey PRIMARY KEY (id);


--
-- Name: company_account_players company_account_players_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_account_players
    ADD CONSTRAINT company_account_players_unique UNIQUE (company_account_id, player_id);


--
-- Name: company_accounts company_accounts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_accounts
    ADD CONSTRAINT company_accounts_pkey PRIMARY KEY (id);


--
-- Name: company_open_bill_events company_open_bill_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_open_bill_events
    ADD CONSTRAINT company_open_bill_events_pkey PRIMARY KEY (id);


--
-- Name: company_open_bills company_open_bills_invoice_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_open_bills
    ADD CONSTRAINT company_open_bills_invoice_number_key UNIQUE (invoice_number);


--
-- Name: company_open_bills company_open_bills_payment_ref_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_open_bills
    ADD CONSTRAINT company_open_bills_payment_ref_key UNIQUE (payment_ref);


--
-- Name: company_open_bills company_open_bills_period_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_open_bills
    ADD CONSTRAINT company_open_bills_period_unique UNIQUE (company_account_id, period_start);


--
-- Name: company_open_bills company_open_bills_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_open_bills
    ADD CONSTRAINT company_open_bills_pkey PRIMARY KEY (id);


--
-- Name: court_assignments court_assignments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.court_assignments
    ADD CONSTRAINT court_assignments_pkey PRIMARY KEY (id);


--
-- Name: court_blocks court_blocks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.court_blocks
    ADD CONSTRAINT court_blocks_pkey PRIMARY KEY (id);


--
-- Name: courts courts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.courts
    ADD CONSTRAINT courts_pkey PRIMARY KEY (id);


--
-- Name: credit_transactions credit_transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.credit_transactions
    ADD CONSTRAINT credit_transactions_pkey PRIMARY KEY (id);


--
-- Name: email_logs email_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_logs
    ADD CONSTRAINT email_logs_pkey PRIMARY KEY (id);


--
-- Name: face_attempts face_attempts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.face_attempts
    ADD CONSTRAINT face_attempts_pkey PRIMARY KEY (id);


--
-- Name: face_recognition_logs face_recognition_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.face_recognition_logs
    ADD CONSTRAINT face_recognition_logs_pkey PRIMARY KEY (id);


--
-- Name: invoice_sequences invoice_sequences_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice_sequences
    ADD CONSTRAINT invoice_sequences_pkey PRIMARY KEY (id);


--
-- Name: invoice_sequences invoice_sequences_venue_id_type_year_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice_sequences
    ADD CONSTRAINT invoice_sequences_venue_id_type_year_key UNIQUE (venue_id, type, year);


--
-- Name: kiosk_devices kiosk_devices_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kiosk_devices
    ADD CONSTRAINT kiosk_devices_pkey PRIMARY KEY (id);


--
-- Name: kiosk_settings kiosk_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kiosk_settings
    ADD CONSTRAINT kiosk_settings_pkey PRIMARY KEY (id);


--
-- Name: manual_billing_invoices manual_billing_invoices_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.manual_billing_invoices
    ADD CONSTRAINT manual_billing_invoices_pkey PRIMARY KEY (id);


--
-- Name: membership_payments membership_payments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.membership_payments
    ADD CONSTRAINT membership_payments_pkey PRIMARY KEY (id);


--
-- Name: membership_tiers membership_tiers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.membership_tiers
    ADD CONSTRAINT membership_tiers_pkey PRIMARY KEY (id);


--
-- Name: memberships memberships_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.memberships
    ADD CONSTRAINT memberships_pkey PRIMARY KEY (id);


--
-- Name: open_play_registrations open_play_registrations_invoice_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.open_play_registrations
    ADD CONSTRAINT open_play_registrations_invoice_number_key UNIQUE (invoice_number);


--
-- Name: open_play_registrations open_play_registrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.open_play_registrations
    ADD CONSTRAINT open_play_registrations_pkey PRIMARY KEY (id);


--
-- Name: organizations organizations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organizations
    ADD CONSTRAINT organizations_pkey PRIMARY KEY (id);


--
-- Name: otp_codes otp_codes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.otp_codes
    ADD CONSTRAINT otp_codes_pkey PRIMARY KEY (id);


--
-- Name: pending_payments pending_payments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pending_payments
    ADD CONSTRAINT pending_payments_pkey PRIMARY KEY (id);


--
-- Name: player_accounts player_accounts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.player_accounts
    ADD CONSTRAINT player_accounts_pkey PRIMARY KEY (id);


--
-- Name: player_app_auth_logs player_app_auth_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.player_app_auth_logs
    ADD CONSTRAINT player_app_auth_logs_pkey PRIMARY KEY (id);


--
-- Name: player_coach_credits player_coach_credits_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.player_coach_credits
    ADD CONSTRAINT player_coach_credits_pkey PRIMARY KEY (id);


--
-- Name: player_custom_prices player_custom_prices_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.player_custom_prices
    ADD CONSTRAINT player_custom_prices_pkey PRIMARY KEY (id);


--
-- Name: player_groups player_groups_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.player_groups
    ADD CONSTRAINT player_groups_pkey PRIMARY KEY (id);


--
-- Name: player_identities player_identities_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.player_identities
    ADD CONSTRAINT player_identities_pkey PRIMARY KEY (id);


--
-- Name: player_magic_tokens player_magic_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.player_magic_tokens
    ADD CONSTRAINT player_magic_tokens_pkey PRIMARY KEY (id);


--
-- Name: player_notes player_notes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.player_notes
    ADD CONSTRAINT player_notes_pkey PRIMARY KEY (id);


--
-- Name: player_password_reset_tokens player_password_reset_tokens_jti_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.player_password_reset_tokens
    ADD CONSTRAINT player_password_reset_tokens_jti_key UNIQUE (jti);


--
-- Name: player_password_reset_tokens player_password_reset_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.player_password_reset_tokens
    ADD CONSTRAINT player_password_reset_tokens_pkey PRIMARY KEY (id);


--
-- Name: player_rankings player_rankings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.player_rankings
    ADD CONSTRAINT player_rankings_pkey PRIMARY KEY (id);


--
-- Name: player_sticker_packs player_sticker_packs_payment_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.player_sticker_packs
    ADD CONSTRAINT player_sticker_packs_payment_code_key UNIQUE (payment_code);


--
-- Name: player_sticker_packs player_sticker_packs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.player_sticker_packs
    ADD CONSTRAINT player_sticker_packs_pkey PRIMARY KEY (id);


--
-- Name: player_sticker_photos player_sticker_photos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.player_sticker_photos
    ADD CONSTRAINT player_sticker_photos_pkey PRIMARY KEY (id);


--
-- Name: player_sticker_results player_sticker_results_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.player_sticker_results
    ADD CONSTRAINT player_sticker_results_pkey PRIMARY KEY (id);


--
-- Name: player_subscriptions player_subscriptions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.player_subscriptions
    ADD CONSTRAINT player_subscriptions_pkey PRIMARY KEY (id);


--
-- Name: players players_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.players
    ADD CONSTRAINT players_pkey PRIMARY KEY (id);


--
-- Name: pricing_groups pricing_groups_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pricing_groups
    ADD CONSTRAINT pricing_groups_pkey PRIMARY KEY (id);


--
-- Name: program_pass_type_coaches program_pass_type_coaches_pass_type_id_coach_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.program_pass_type_coaches
    ADD CONSTRAINT program_pass_type_coaches_pass_type_id_coach_id_key UNIQUE (pass_type_id, coach_id);


--
-- Name: program_pass_type_coaches program_pass_type_coaches_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.program_pass_type_coaches
    ADD CONSTRAINT program_pass_type_coaches_pkey PRIMARY KEY (id);


--
-- Name: program_pass_types program_pass_types_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.program_pass_types
    ADD CONSTRAINT program_pass_types_pkey PRIMARY KEY (id);


--
-- Name: promo_codes promo_codes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.promo_codes
    ADD CONSTRAINT promo_codes_pkey PRIMARY KEY (id);


--
-- Name: promo_link_clicks promo_link_clicks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.promo_link_clicks
    ADD CONSTRAINT promo_link_clicks_pkey PRIMARY KEY (id);


--
-- Name: promo_redemptions promo_redemptions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.promo_redemptions
    ADD CONSTRAINT promo_redemptions_pkey PRIMARY KEY (id);


--
-- Name: push_subscriptions push_subscriptions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.push_subscriptions
    ADD CONSTRAINT push_subscriptions_pkey PRIMARY KEY (id);


--
-- Name: queue_entries queue_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.queue_entries
    ADD CONSTRAINT queue_entries_pkey PRIMARY KEY (id);


--
-- Name: schema_migrations schema_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schema_migrations
    ADD CONSTRAINT schema_migrations_pkey PRIMARY KEY (version);


--
-- Name: sessions sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_pkey PRIMARY KEY (id);


--
-- Name: signup_duplicate_logs signup_duplicate_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.signup_duplicate_logs
    ADD CONSTRAINT signup_duplicate_logs_pkey PRIMARY KEY (id);


--
-- Name: staff_auth_logs staff_auth_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_auth_logs
    ADD CONSTRAINT staff_auth_logs_pkey PRIMARY KEY (id);


--
-- Name: staff_members staff_members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_members
    ADD CONSTRAINT staff_members_pkey PRIMARY KEY (id);


--
-- Name: staff_payments staff_payments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_payments
    ADD CONSTRAINT staff_payments_pkey PRIMARY KEY (id);


--
-- Name: staff_push_tokens staff_push_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_push_tokens
    ADD CONSTRAINT staff_push_tokens_pkey PRIMARY KEY (id);


--
-- Name: staff_venue_assignments staff_venue_assignments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_venue_assignments
    ADD CONSTRAINT staff_venue_assignments_pkey PRIMARY KEY (id);


--
-- Name: sticker_job_queue sticker_job_queue_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sticker_job_queue
    ADD CONSTRAINT sticker_job_queue_pkey PRIMARY KEY (id);


--
-- Name: sticker_payment_logs sticker_payment_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sticker_payment_logs
    ADD CONSTRAINT sticker_payment_logs_pkey PRIMARY KEY (id);


--
-- Name: sticker_sessions sticker_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sticker_sessions
    ADD CONSTRAINT sticker_sessions_pkey PRIMARY KEY (id);


--
-- Name: sticker_templates sticker_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sticker_templates
    ADD CONSTRAINT sticker_templates_pkey PRIMARY KEY (id);


--
-- Name: subscription_packages subscription_packages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscription_packages
    ADD CONSTRAINT subscription_packages_pkey PRIMARY KEY (id);


--
-- Name: subscription_usages subscription_usages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscription_usages
    ADD CONSTRAINT subscription_usages_pkey PRIMARY KEY (id);


--
-- Name: venue_billing_rates venue_billing_rates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.venue_billing_rates
    ADD CONSTRAINT venue_billing_rates_pkey PRIMARY KEY (id);


--
-- Name: venues venues_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.venues
    ADD CONSTRAINT venues_pkey PRIMARY KEY (id);


--
-- Name: _StaffMemberToVenue _StaffMemberToVenue_AB_pkey; Type: CONSTRAINT; Schema: shadow_temp; Owner: -
--

ALTER TABLE ONLY shadow_temp."_StaffMemberToVenue"
    ADD CONSTRAINT "_StaffMemberToVenue_AB_pkey" PRIMARY KEY ("A", "B");


--
-- Name: audit_logs audit_logs_pkey; Type: CONSTRAINT; Schema: shadow_temp; Owner: -
--

ALTER TABLE ONLY shadow_temp.audit_logs
    ADD CONSTRAINT audit_logs_pkey PRIMARY KEY (id);


--
-- Name: bookings bookings_pkey; Type: CONSTRAINT; Schema: shadow_temp; Owner: -
--

ALTER TABLE ONLY shadow_temp.bookings
    ADD CONSTRAINT bookings_pkey PRIMARY KEY (id);


--
-- Name: coach_lessons coach_lessons_pkey; Type: CONSTRAINT; Schema: shadow_temp; Owner: -
--

ALTER TABLE ONLY shadow_temp.coach_lessons
    ADD CONSTRAINT coach_lessons_pkey PRIMARY KEY (id);


--
-- Name: coach_packages coach_packages_pkey; Type: CONSTRAINT; Schema: shadow_temp; Owner: -
--

ALTER TABLE ONLY shadow_temp.coach_packages
    ADD CONSTRAINT coach_packages_pkey PRIMARY KEY (id);


--
-- Name: court_assignments court_assignments_pkey; Type: CONSTRAINT; Schema: shadow_temp; Owner: -
--

ALTER TABLE ONLY shadow_temp.court_assignments
    ADD CONSTRAINT court_assignments_pkey PRIMARY KEY (id);


--
-- Name: court_blocks court_blocks_pkey; Type: CONSTRAINT; Schema: shadow_temp; Owner: -
--

ALTER TABLE ONLY shadow_temp.court_blocks
    ADD CONSTRAINT court_blocks_pkey PRIMARY KEY (id);


--
-- Name: courts courts_pkey; Type: CONSTRAINT; Schema: shadow_temp; Owner: -
--

ALTER TABLE ONLY shadow_temp.courts
    ADD CONSTRAINT courts_pkey PRIMARY KEY (id);


--
-- Name: face_attempts face_attempts_pkey; Type: CONSTRAINT; Schema: shadow_temp; Owner: -
--

ALTER TABLE ONLY shadow_temp.face_attempts
    ADD CONSTRAINT face_attempts_pkey PRIMARY KEY (id);


--
-- Name: kiosk_devices kiosk_devices_pkey; Type: CONSTRAINT; Schema: shadow_temp; Owner: -
--

ALTER TABLE ONLY shadow_temp.kiosk_devices
    ADD CONSTRAINT kiosk_devices_pkey PRIMARY KEY (id);


--
-- Name: membership_payments membership_payments_pkey; Type: CONSTRAINT; Schema: shadow_temp; Owner: -
--

ALTER TABLE ONLY shadow_temp.membership_payments
    ADD CONSTRAINT membership_payments_pkey PRIMARY KEY (id);


--
-- Name: membership_tiers membership_tiers_pkey; Type: CONSTRAINT; Schema: shadow_temp; Owner: -
--

ALTER TABLE ONLY shadow_temp.membership_tiers
    ADD CONSTRAINT membership_tiers_pkey PRIMARY KEY (id);


--
-- Name: memberships memberships_pkey; Type: CONSTRAINT; Schema: shadow_temp; Owner: -
--

ALTER TABLE ONLY shadow_temp.memberships
    ADD CONSTRAINT memberships_pkey PRIMARY KEY (id);


--
-- Name: otp_codes otp_codes_pkey; Type: CONSTRAINT; Schema: shadow_temp; Owner: -
--

ALTER TABLE ONLY shadow_temp.otp_codes
    ADD CONSTRAINT otp_codes_pkey PRIMARY KEY (id);


--
-- Name: pending_payments pending_payments_pkey; Type: CONSTRAINT; Schema: shadow_temp; Owner: -
--

ALTER TABLE ONLY shadow_temp.pending_payments
    ADD CONSTRAINT pending_payments_pkey PRIMARY KEY (id);


--
-- Name: player_app_auth_logs player_app_auth_logs_pkey; Type: CONSTRAINT; Schema: shadow_temp; Owner: -
--

ALTER TABLE ONLY shadow_temp.player_app_auth_logs
    ADD CONSTRAINT player_app_auth_logs_pkey PRIMARY KEY (id);


--
-- Name: player_groups player_groups_pkey; Type: CONSTRAINT; Schema: shadow_temp; Owner: -
--

ALTER TABLE ONLY shadow_temp.player_groups
    ADD CONSTRAINT player_groups_pkey PRIMARY KEY (id);


--
-- Name: player_rankings player_rankings_pkey; Type: CONSTRAINT; Schema: shadow_temp; Owner: -
--

ALTER TABLE ONLY shadow_temp.player_rankings
    ADD CONSTRAINT player_rankings_pkey PRIMARY KEY (id);


--
-- Name: players players_pkey; Type: CONSTRAINT; Schema: shadow_temp; Owner: -
--

ALTER TABLE ONLY shadow_temp.players
    ADD CONSTRAINT players_pkey PRIMARY KEY (id);


--
-- Name: push_subscriptions push_subscriptions_pkey; Type: CONSTRAINT; Schema: shadow_temp; Owner: -
--

ALTER TABLE ONLY shadow_temp.push_subscriptions
    ADD CONSTRAINT push_subscriptions_pkey PRIMARY KEY (id);


--
-- Name: queue_entries queue_entries_pkey; Type: CONSTRAINT; Schema: shadow_temp; Owner: -
--

ALTER TABLE ONLY shadow_temp.queue_entries
    ADD CONSTRAINT queue_entries_pkey PRIMARY KEY (id);


--
-- Name: sessions sessions_pkey; Type: CONSTRAINT; Schema: shadow_temp; Owner: -
--

ALTER TABLE ONLY shadow_temp.sessions
    ADD CONSTRAINT sessions_pkey PRIMARY KEY (id);


--
-- Name: staff_members staff_members_pkey; Type: CONSTRAINT; Schema: shadow_temp; Owner: -
--

ALTER TABLE ONLY shadow_temp.staff_members
    ADD CONSTRAINT staff_members_pkey PRIMARY KEY (id);


--
-- Name: staff_payments staff_payments_pkey; Type: CONSTRAINT; Schema: shadow_temp; Owner: -
--

ALTER TABLE ONLY shadow_temp.staff_payments
    ADD CONSTRAINT staff_payments_pkey PRIMARY KEY (id);


--
-- Name: venues venues_pkey; Type: CONSTRAINT; Schema: shadow_temp; Owner: -
--

ALTER TABLE ONLY shadow_temp.venues
    ADD CONSTRAINT venues_pkey PRIMARY KEY (id);


--
-- Name: billing_invoices_payment_ref_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX billing_invoices_payment_ref_key ON public.billing_invoices USING btree (payment_ref);


--
-- Name: billing_invoices_payos_order_code_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX billing_invoices_payos_order_code_key ON public.billing_invoices USING btree (payos_order_code);


--
-- Name: billing_invoices_venue_id_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX billing_invoices_venue_id_status_idx ON public.billing_invoices USING btree (venue_id, status);


--
-- Name: billing_invoices_venue_id_week_start_date_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX billing_invoices_venue_id_week_start_date_key ON public.billing_invoices USING btree (venue_id, week_start_date);


--
-- Name: billing_line_items_invoice_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX billing_line_items_invoice_id_idx ON public.billing_line_items USING btree (invoice_id);


--
-- Name: booking_groups_payment_ref; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX booking_groups_payment_ref ON public.booking_groups USING btree (payment_ref) WHERE (payment_ref IS NOT NULL);


--
-- Name: booking_groups_player; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX booking_groups_player ON public.booking_groups USING btree (player_id);


--
-- Name: booking_groups_venue_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX booking_groups_venue_date ON public.booking_groups USING btree (venue_id, date);


--
-- Name: bookings_active_slot_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX bookings_active_slot_unique ON public.bookings USING btree (court_id, date, start_time) WHERE (status = ANY (ARRAY['confirmed'::public."BookingStatus", 'completed'::public."BookingStatus", 'no_show'::public."BookingStatus"]));


--
-- Name: bookings_booking_group_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX bookings_booking_group_id ON public.bookings USING btree (booking_group_id) WHERE (booking_group_id IS NOT NULL);


--
-- Name: bookings_company_open_bill_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX bookings_company_open_bill_id_idx ON public.bookings USING btree (company_open_bill_id);


--
-- Name: bookings_payment_ref_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX bookings_payment_ref_key ON public.bookings USING btree (payment_ref);


--
-- Name: bookings_player_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX bookings_player_id_idx ON public.bookings USING btree (player_id);


--
-- Name: bookings_venue_id_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX bookings_venue_id_date_idx ON public.bookings USING btree (venue_id, date);


--
-- Name: check_in_players_phone_venue_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX check_in_players_phone_venue_id_key ON public.check_in_players USING btree (phone, venue_id);


--
-- Name: check_in_players_player_identity_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX check_in_players_player_identity_id_idx ON public.check_in_players USING btree (player_identity_id);


--
-- Name: check_in_players_venue_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX check_in_players_venue_id_idx ON public.check_in_players USING btree (venue_id);


--
-- Name: check_in_records_player_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX check_in_records_player_id_idx ON public.check_in_records USING btree (player_id);


--
-- Name: check_in_records_venue_id_checked_in_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX check_in_records_venue_id_checked_in_at_idx ON public.check_in_records USING btree (venue_id, checked_in_at);


--
-- Name: class_check_ins_class_instance_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX class_check_ins_class_instance_id_idx ON public.class_check_ins USING btree (class_instance_id);


--
-- Name: class_check_ins_class_pass_id_class_instance_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX class_check_ins_class_pass_id_class_instance_id_key ON public.class_check_ins USING btree (class_pass_id, class_instance_id);


--
-- Name: class_instances_coach_id_start_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX class_instances_coach_id_start_at_idx ON public.class_instances USING btree (coach_id, start_at);


--
-- Name: class_instances_tier_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX class_instances_tier_id_idx ON public.class_instances USING btree (pass_type_id);


--
-- Name: class_instances_venue_id_start_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX class_instances_venue_id_start_at_idx ON public.class_instances USING btree (venue_id, start_at);


--
-- Name: class_pass_payments_class_pass_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX class_pass_payments_class_pass_id_idx ON public.class_pass_payments USING btree (class_pass_id);


--
-- Name: class_pass_payments_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX class_pass_payments_status_idx ON public.class_pass_payments USING btree (status);


--
-- Name: class_pass_tiers_linked_coach_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX class_pass_tiers_linked_coach_id_idx ON public.program_pass_types USING btree (linked_coach_id);


--
-- Name: class_pass_tiers_venue_id_is_active_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX class_pass_tiers_venue_id_is_active_idx ON public.program_pass_types USING btree (venue_id, is_active);


--
-- Name: class_passes_player_id_venue_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX class_passes_player_id_venue_id_idx ON public.class_passes USING btree (player_id, venue_id);


--
-- Name: class_passes_tier_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX class_passes_tier_id_idx ON public.class_passes USING btree (pass_type_id);


--
-- Name: class_passes_venue_id_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX class_passes_venue_id_status_idx ON public.class_passes USING btree (venue_id, status);


--
-- Name: coach_availabilities_coach_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX coach_availabilities_coach_id_idx ON public.coach_availabilities USING btree (coach_id);


--
-- Name: coach_holidays_coach_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX coach_holidays_coach_id_idx ON public.coach_holidays USING btree (coach_id);


--
-- Name: coach_lessons_coach_id_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX coach_lessons_coach_id_date_idx ON public.coach_lessons USING btree (coach_id, date);


--
-- Name: coach_lessons_payment_ref_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX coach_lessons_payment_ref_key ON public.coach_lessons USING btree (payment_ref);


--
-- Name: coach_lessons_player_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX coach_lessons_player_id_idx ON public.coach_lessons USING btree (player_id);


--
-- Name: coach_lessons_venue_id_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX coach_lessons_venue_id_date_idx ON public.coach_lessons USING btree (venue_id, date);


--
-- Name: coach_packages_coach_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX coach_packages_coach_id_idx ON public.coach_packages USING btree (coach_id);


--
-- Name: coach_packages_venue_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX coach_packages_venue_id_idx ON public.coach_packages USING btree (venue_id);


--
-- Name: company_account_players_company_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX company_account_players_company_id_idx ON public.company_account_players USING btree (company_account_id);


--
-- Name: company_account_players_player_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX company_account_players_player_id_idx ON public.company_account_players USING btree (player_id);


--
-- Name: company_accounts_primary_player_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX company_accounts_primary_player_id_idx ON public.company_accounts USING btree (primary_player_id);


--
-- Name: company_accounts_venue_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX company_accounts_venue_id_idx ON public.company_accounts USING btree (venue_id);


--
-- Name: company_open_bill_events_bill_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX company_open_bill_events_bill_id_idx ON public.company_open_bill_events USING btree (bill_id);


--
-- Name: company_open_bill_events_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX company_open_bill_events_created_at_idx ON public.company_open_bill_events USING btree (created_at);


--
-- Name: company_open_bills_company_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX company_open_bills_company_id_idx ON public.company_open_bills USING btree (company_account_id);


--
-- Name: company_open_bills_period_start_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX company_open_bills_period_start_idx ON public.company_open_bills USING btree (period_start);


--
-- Name: company_open_bills_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX company_open_bills_status_idx ON public.company_open_bills USING btree (status);


--
-- Name: company_open_bills_venue_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX company_open_bills_venue_id_idx ON public.company_open_bills USING btree (venue_id);


--
-- Name: court_blocks_venue_id_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX court_blocks_venue_id_date_idx ON public.court_blocks USING btree (venue_id, date);


--
-- Name: courts_pricing_group_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX courts_pricing_group_id_idx ON public.courts USING btree (pricing_group_id);


--
-- Name: credit_transactions_credit_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX credit_transactions_credit_id_idx ON public.credit_transactions USING btree (credit_id);


--
-- Name: email_logs_booking_id_email_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX email_logs_booking_id_email_type_idx ON public.email_logs USING btree (booking_id, email_type);


--
-- Name: face_attempts_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX face_attempts_created_at_idx ON public.face_attempts USING btree (created_at);


--
-- Name: face_attempts_event_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX face_attempts_event_id_idx ON public.face_attempts USING btree (event_id);


--
-- Name: face_recognition_logs_venue_id_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX face_recognition_logs_venue_id_created_at_idx ON public.face_recognition_logs USING btree (venue_id, created_at);


--
-- Name: manual_billing_invoices_venue_id_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX manual_billing_invoices_venue_id_status_idx ON public.manual_billing_invoices USING btree (venue_id, status);


--
-- Name: membership_payments_membership_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX membership_payments_membership_id_idx ON public.membership_payments USING btree (membership_id);


--
-- Name: membership_payments_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX membership_payments_status_idx ON public.membership_payments USING btree (status);


--
-- Name: membership_tiers_venue_id_sort_order_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX membership_tiers_venue_id_sort_order_key ON public.membership_tiers USING btree (venue_id, sort_order);


--
-- Name: memberships_player_id_venue_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX memberships_player_id_venue_id_key ON public.memberships USING btree (player_id, venue_id);


--
-- Name: memberships_tier_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX memberships_tier_id_idx ON public.memberships USING btree (tier_id);


--
-- Name: memberships_venue_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX memberships_venue_id_idx ON public.memberships USING btree (venue_id);


--
-- Name: open_play_registrations_payment_ref_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX open_play_registrations_payment_ref_key ON public.open_play_registrations USING btree (payment_ref);


--
-- Name: open_play_registrations_player_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX open_play_registrations_player_id_idx ON public.open_play_registrations USING btree (player_id);


--
-- Name: open_play_registrations_schedule_entry_id_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX open_play_registrations_schedule_entry_id_date_idx ON public.open_play_registrations USING btree (schedule_entry_id, date);


--
-- Name: open_play_registrations_schedule_entry_id_date_player_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX open_play_registrations_schedule_entry_id_date_player_id_key ON public.open_play_registrations USING btree (schedule_entry_id, date, player_id);


--
-- Name: open_play_registrations_venue_id_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX open_play_registrations_venue_id_date_idx ON public.open_play_registrations USING btree (venue_id, date);


--
-- Name: organizations_slug_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX organizations_slug_key ON public.organizations USING btree (slug);


--
-- Name: pending_payments_group_paid_by_payment_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pending_payments_group_paid_by_payment_id_idx ON public.pending_payments USING btree (group_paid_by_payment_id);


--
-- Name: pending_payments_payment_ref_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pending_payments_payment_ref_idx ON public.pending_payments USING btree (payment_ref);


--
-- Name: pending_payments_payment_ref_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX pending_payments_payment_ref_key ON public.pending_payments USING btree (payment_ref);


--
-- Name: pending_payments_session_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pending_payments_session_id_idx ON public.pending_payments USING btree (session_id);


--
-- Name: pending_payments_venue_id_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pending_payments_venue_id_status_idx ON public.pending_payments USING btree (venue_id, status);


--
-- Name: player_accounts_player_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX player_accounts_player_id_idx ON public.player_accounts USING btree (player_id);


--
-- Name: player_accounts_provider_provider_account_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX player_accounts_provider_provider_account_id_key ON public.player_accounts USING btree (provider, provider_account_id);


--
-- Name: player_app_auth_logs_player_id_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX player_app_auth_logs_player_id_created_at_idx ON public.player_app_auth_logs USING btree (player_id, created_at);


--
-- Name: player_coach_credits_payment_ref_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX player_coach_credits_payment_ref_key ON public.player_coach_credits USING btree (payment_ref);


--
-- Name: player_coach_credits_player_id_coach_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX player_coach_credits_player_id_coach_id_idx ON public.player_coach_credits USING btree (player_id, coach_id);


--
-- Name: player_coach_credits_venue_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX player_coach_credits_venue_id_idx ON public.player_coach_credits USING btree (venue_id);


--
-- Name: player_custom_prices_player_id_staff_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX player_custom_prices_player_id_staff_id_key ON public.player_custom_prices USING btree (player_id, staff_id);


--
-- Name: player_groups_session_id_code_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX player_groups_session_id_code_key ON public.player_groups USING btree (session_id, code);


--
-- Name: player_identities_email_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX player_identities_email_key ON public.player_identities USING btree (email);


--
-- Name: player_magic_tokens_jti_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX player_magic_tokens_jti_key ON public.player_magic_tokens USING btree (jti);


--
-- Name: player_magic_tokens_player_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX player_magic_tokens_player_id_idx ON public.player_magic_tokens USING btree (player_id);


--
-- Name: player_notes_player_id_venue_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX player_notes_player_id_venue_id_key ON public.player_notes USING btree (player_id, venue_id);


--
-- Name: player_notes_venue_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX player_notes_venue_id_idx ON public.player_notes USING btree (venue_id);


--
-- Name: player_password_reset_tokens_player_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX player_password_reset_tokens_player_id_idx ON public.player_password_reset_tokens USING btree (player_id);


--
-- Name: player_rankings_session_id_court_id_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX player_rankings_session_id_court_id_created_at_idx ON public.player_rankings USING btree (session_id, court_id, created_at);


--
-- Name: player_rankings_session_id_court_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX player_rankings_session_id_court_id_idx ON public.player_rankings USING btree (session_id, court_id);


--
-- Name: player_sticker_packs_payos_order_code_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX player_sticker_packs_payos_order_code_key ON public.player_sticker_packs USING btree (payos_order_code);


--
-- Name: player_sticker_packs_player_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX player_sticker_packs_player_id_idx ON public.player_sticker_packs USING btree (player_id);


--
-- Name: player_sticker_photos_player_id_slot_index_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX player_sticker_photos_player_id_slot_index_key ON public.player_sticker_photos USING btree (player_id, slot_index);


--
-- Name: player_sticker_results_player_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX player_sticker_results_player_id_idx ON public.player_sticker_results USING btree (player_id);


--
-- Name: player_subscriptions_player_id_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX player_subscriptions_player_id_status_idx ON public.player_subscriptions USING btree (player_id, status);


--
-- Name: player_subscriptions_venue_id_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX player_subscriptions_venue_id_status_idx ON public.player_subscriptions USING btree (venue_id, status);


--
-- Name: players_coach_staff_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX players_coach_staff_id_idx ON public.players USING btree (coach_staff_id);


--
-- Name: players_email_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX players_email_key ON public.players USING btree (email);


--
-- Name: players_phone_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX players_phone_key ON public.players USING btree (phone);


--
-- Name: players_player_identity_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX players_player_identity_id_idx ON public.players USING btree (player_identity_id);


--
-- Name: players_registration_venue_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX players_registration_venue_id_idx ON public.players USING btree (registration_venue_id);


--
-- Name: pricing_groups_one_default_per_venue; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX pricing_groups_one_default_per_venue ON public.pricing_groups USING btree (venue_id) WHERE (is_default = true);


--
-- Name: pricing_groups_venue_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pricing_groups_venue_id_idx ON public.pricing_groups USING btree (venue_id);


--
-- Name: program_pass_type_coaches_pass_type_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX program_pass_type_coaches_pass_type_id_idx ON public.program_pass_type_coaches USING btree (pass_type_id);


--
-- Name: promo_codes_is_active_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX promo_codes_is_active_idx ON public.promo_codes USING btree (is_active);


--
-- Name: promo_codes_venue_code_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX promo_codes_venue_code_unique ON public.promo_codes USING btree (venue_id, upper(code));


--
-- Name: promo_codes_venue_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX promo_codes_venue_id_idx ON public.promo_codes USING btree (venue_id);


--
-- Name: promo_link_clicks_device_session_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX promo_link_clicks_device_session_id_idx ON public.promo_link_clicks USING btree (device_session_id);


--
-- Name: promo_link_clicks_player_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX promo_link_clicks_player_id_idx ON public.promo_link_clicks USING btree (player_id);


--
-- Name: promo_link_clicks_promo_code_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX promo_link_clicks_promo_code_id_idx ON public.promo_link_clicks USING btree (promo_code_id);


--
-- Name: promo_redemptions_booking_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX promo_redemptions_booking_id_idx ON public.promo_redemptions USING btree (booking_id);


--
-- Name: promo_redemptions_player_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX promo_redemptions_player_id_idx ON public.promo_redemptions USING btree (player_id);


--
-- Name: promo_redemptions_promo_code_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX promo_redemptions_promo_code_id_idx ON public.promo_redemptions USING btree (promo_code_id);


--
-- Name: push_subscriptions_endpoint_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX push_subscriptions_endpoint_key ON public.push_subscriptions USING btree (endpoint);


--
-- Name: queue_entries_session_id_player_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX queue_entries_session_id_player_id_key ON public.queue_entries USING btree (session_id, player_id);


--
-- Name: signup_duplicate_logs_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX signup_duplicate_logs_created_at_idx ON public.signup_duplicate_logs USING btree (created_at);


--
-- Name: signup_duplicate_logs_matched_player_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX signup_duplicate_logs_matched_player_id_idx ON public.signup_duplicate_logs USING btree (matched_player_id);


--
-- Name: signup_duplicate_logs_venue_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX signup_duplicate_logs_venue_id_idx ON public.signup_duplicate_logs USING btree (venue_id);


--
-- Name: staff_auth_logs_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX staff_auth_logs_created_at_idx ON public.staff_auth_logs USING btree (created_at);


--
-- Name: staff_auth_logs_fingerprint_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX staff_auth_logs_fingerprint_id_idx ON public.staff_auth_logs USING btree (fingerprint_id);


--
-- Name: staff_auth_logs_staff_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX staff_auth_logs_staff_id_idx ON public.staff_auth_logs USING btree (staff_id);


--
-- Name: staff_members_email_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX staff_members_email_key ON public.staff_members USING btree (email);


--
-- Name: staff_members_phone_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX staff_members_phone_key ON public.staff_members USING btree (phone);


--
-- Name: staff_payments_staff_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX staff_payments_staff_id_idx ON public.staff_payments USING btree (staff_id);


--
-- Name: staff_payments_staff_id_week_start_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX staff_payments_staff_id_week_start_key ON public.staff_payments USING btree (staff_id, week_start);


--
-- Name: staff_payments_week_start_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX staff_payments_week_start_idx ON public.staff_payments USING btree (week_start);


--
-- Name: staff_push_tokens_staff_id_token_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX staff_push_tokens_staff_id_token_key ON public.staff_push_tokens USING btree (staff_id, token);


--
-- Name: staff_push_tokens_venue_id_active_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX staff_push_tokens_venue_id_active_idx ON public.staff_push_tokens USING btree (venue_id, active);


--
-- Name: staff_venue_assignments_staff_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX staff_venue_assignments_staff_id_idx ON public.staff_venue_assignments USING btree (staff_id);


--
-- Name: staff_venue_assignments_staff_id_venue_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX staff_venue_assignments_staff_id_venue_id_key ON public.staff_venue_assignments USING btree (staff_id, venue_id);


--
-- Name: staff_venue_assignments_venue_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX staff_venue_assignments_venue_id_idx ON public.staff_venue_assignments USING btree (venue_id);


--
-- Name: sticker_job_queue_status_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sticker_job_queue_status_created_at_idx ON public.sticker_job_queue USING btree (status, created_at);


--
-- Name: sticker_payment_logs_payos_order_code_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX sticker_payment_logs_payos_order_code_key ON public.sticker_payment_logs USING btree (payos_order_code);


--
-- Name: sticker_sessions_token_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX sticker_sessions_token_key ON public.sticker_sessions USING btree (token);


--
-- Name: subscription_packages_venue_id_is_active_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX subscription_packages_venue_id_is_active_idx ON public.subscription_packages USING btree (venue_id, is_active);


--
-- Name: subscription_usages_subscription_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX subscription_usages_subscription_id_idx ON public.subscription_usages USING btree (subscription_id);


--
-- Name: venue_billing_rates_venue_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX venue_billing_rates_venue_id_key ON public.venue_billing_rates USING btree (venue_id);


--
-- Name: venues_organization_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX venues_organization_id_idx ON public.venues USING btree (organization_id);


--
-- Name: venues_slug_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX venues_slug_key ON public.venues USING btree (slug);


--
-- Name: _StaffMemberToVenue_B_index; Type: INDEX; Schema: shadow_temp; Owner: -
--

CREATE INDEX "_StaffMemberToVenue_B_index" ON shadow_temp."_StaffMemberToVenue" USING btree ("B");


--
-- Name: bookings_court_id_date_start_time_key; Type: INDEX; Schema: shadow_temp; Owner: -
--

CREATE UNIQUE INDEX bookings_court_id_date_start_time_key ON shadow_temp.bookings USING btree (court_id, date, start_time);


--
-- Name: bookings_player_id_idx; Type: INDEX; Schema: shadow_temp; Owner: -
--

CREATE INDEX bookings_player_id_idx ON shadow_temp.bookings USING btree (player_id);


--
-- Name: bookings_venue_id_date_idx; Type: INDEX; Schema: shadow_temp; Owner: -
--

CREATE INDEX bookings_venue_id_date_idx ON shadow_temp.bookings USING btree (venue_id, date);


--
-- Name: coach_lessons_coach_id_date_idx; Type: INDEX; Schema: shadow_temp; Owner: -
--

CREATE INDEX coach_lessons_coach_id_date_idx ON shadow_temp.coach_lessons USING btree (coach_id, date);


--
-- Name: coach_lessons_player_id_idx; Type: INDEX; Schema: shadow_temp; Owner: -
--

CREATE INDEX coach_lessons_player_id_idx ON shadow_temp.coach_lessons USING btree (player_id);


--
-- Name: coach_lessons_venue_id_date_idx; Type: INDEX; Schema: shadow_temp; Owner: -
--

CREATE INDEX coach_lessons_venue_id_date_idx ON shadow_temp.coach_lessons USING btree (venue_id, date);


--
-- Name: coach_packages_coach_id_idx; Type: INDEX; Schema: shadow_temp; Owner: -
--

CREATE INDEX coach_packages_coach_id_idx ON shadow_temp.coach_packages USING btree (coach_id);


--
-- Name: coach_packages_venue_id_idx; Type: INDEX; Schema: shadow_temp; Owner: -
--

CREATE INDEX coach_packages_venue_id_idx ON shadow_temp.coach_packages USING btree (venue_id);


--
-- Name: court_blocks_venue_id_date_idx; Type: INDEX; Schema: shadow_temp; Owner: -
--

CREATE INDEX court_blocks_venue_id_date_idx ON shadow_temp.court_blocks USING btree (venue_id, date);


--
-- Name: face_attempts_created_at_idx; Type: INDEX; Schema: shadow_temp; Owner: -
--

CREATE INDEX face_attempts_created_at_idx ON shadow_temp.face_attempts USING btree (created_at);


--
-- Name: face_attempts_event_id_idx; Type: INDEX; Schema: shadow_temp; Owner: -
--

CREATE INDEX face_attempts_event_id_idx ON shadow_temp.face_attempts USING btree (event_id);


--
-- Name: membership_payments_membership_id_idx; Type: INDEX; Schema: shadow_temp; Owner: -
--

CREATE INDEX membership_payments_membership_id_idx ON shadow_temp.membership_payments USING btree (membership_id);


--
-- Name: membership_payments_status_idx; Type: INDEX; Schema: shadow_temp; Owner: -
--

CREATE INDEX membership_payments_status_idx ON shadow_temp.membership_payments USING btree (status);


--
-- Name: membership_tiers_venue_id_sort_order_key; Type: INDEX; Schema: shadow_temp; Owner: -
--

CREATE UNIQUE INDEX membership_tiers_venue_id_sort_order_key ON shadow_temp.membership_tiers USING btree (venue_id, sort_order);


--
-- Name: memberships_player_id_venue_id_key; Type: INDEX; Schema: shadow_temp; Owner: -
--

CREATE UNIQUE INDEX memberships_player_id_venue_id_key ON shadow_temp.memberships USING btree (player_id, venue_id);


--
-- Name: memberships_tier_id_idx; Type: INDEX; Schema: shadow_temp; Owner: -
--

CREATE INDEX memberships_tier_id_idx ON shadow_temp.memberships USING btree (tier_id);


--
-- Name: memberships_venue_id_idx; Type: INDEX; Schema: shadow_temp; Owner: -
--

CREATE INDEX memberships_venue_id_idx ON shadow_temp.memberships USING btree (venue_id);


--
-- Name: pending_payments_session_id_idx; Type: INDEX; Schema: shadow_temp; Owner: -
--

CREATE INDEX pending_payments_session_id_idx ON shadow_temp.pending_payments USING btree (session_id);


--
-- Name: pending_payments_venue_id_status_idx; Type: INDEX; Schema: shadow_temp; Owner: -
--

CREATE INDEX pending_payments_venue_id_status_idx ON shadow_temp.pending_payments USING btree (venue_id, status);


--
-- Name: player_app_auth_logs_player_id_created_at_idx; Type: INDEX; Schema: shadow_temp; Owner: -
--

CREATE INDEX player_app_auth_logs_player_id_created_at_idx ON shadow_temp.player_app_auth_logs USING btree (player_id, created_at);


--
-- Name: player_groups_session_id_code_key; Type: INDEX; Schema: shadow_temp; Owner: -
--

CREATE UNIQUE INDEX player_groups_session_id_code_key ON shadow_temp.player_groups USING btree (session_id, code);


--
-- Name: player_rankings_session_id_court_id_created_at_idx; Type: INDEX; Schema: shadow_temp; Owner: -
--

CREATE INDEX player_rankings_session_id_court_id_created_at_idx ON shadow_temp.player_rankings USING btree (session_id, court_id, created_at);


--
-- Name: player_rankings_session_id_court_id_idx; Type: INDEX; Schema: shadow_temp; Owner: -
--

CREATE INDEX player_rankings_session_id_court_id_idx ON shadow_temp.player_rankings USING btree (session_id, court_id);


--
-- Name: players_phone_key; Type: INDEX; Schema: shadow_temp; Owner: -
--

CREATE UNIQUE INDEX players_phone_key ON shadow_temp.players USING btree (phone);


--
-- Name: push_subscriptions_endpoint_key; Type: INDEX; Schema: shadow_temp; Owner: -
--

CREATE UNIQUE INDEX push_subscriptions_endpoint_key ON shadow_temp.push_subscriptions USING btree (endpoint);


--
-- Name: queue_entries_session_id_player_id_key; Type: INDEX; Schema: shadow_temp; Owner: -
--

CREATE UNIQUE INDEX queue_entries_session_id_player_id_key ON shadow_temp.queue_entries USING btree (session_id, player_id);


--
-- Name: staff_members_email_key; Type: INDEX; Schema: shadow_temp; Owner: -
--

CREATE UNIQUE INDEX staff_members_email_key ON shadow_temp.staff_members USING btree (email);


--
-- Name: staff_members_phone_key; Type: INDEX; Schema: shadow_temp; Owner: -
--

CREATE UNIQUE INDEX staff_members_phone_key ON shadow_temp.staff_members USING btree (phone);


--
-- Name: staff_payments_staff_id_idx; Type: INDEX; Schema: shadow_temp; Owner: -
--

CREATE INDEX staff_payments_staff_id_idx ON shadow_temp.staff_payments USING btree (staff_id);


--
-- Name: staff_payments_staff_id_week_start_key; Type: INDEX; Schema: shadow_temp; Owner: -
--

CREATE UNIQUE INDEX staff_payments_staff_id_week_start_key ON shadow_temp.staff_payments USING btree (staff_id, week_start);


--
-- Name: staff_payments_week_start_idx; Type: INDEX; Schema: shadow_temp; Owner: -
--

CREATE INDEX staff_payments_week_start_idx ON shadow_temp.staff_payments USING btree (week_start);


--
-- Name: audit_logs audit_logs_staff_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES public.staff_members(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: audit_logs audit_logs_venue_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_venue_id_fkey FOREIGN KEY (venue_id) REFERENCES public.venues(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: billing_invoices billing_invoices_venue_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_invoices
    ADD CONSTRAINT billing_invoices_venue_id_fkey FOREIGN KEY (venue_id) REFERENCES public.venues(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: billing_line_items billing_line_items_invoice_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_line_items
    ADD CONSTRAINT billing_line_items_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES public.billing_invoices(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: booking_groups booking_groups_player_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.booking_groups
    ADD CONSTRAINT booking_groups_player_id_fkey FOREIGN KEY (player_id) REFERENCES public.players(id);


--
-- Name: booking_groups booking_groups_venue_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.booking_groups
    ADD CONSTRAINT booking_groups_venue_id_fkey FOREIGN KEY (venue_id) REFERENCES public.venues(id);


--
-- Name: bookings bookings_booking_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bookings
    ADD CONSTRAINT bookings_booking_group_id_fkey FOREIGN KEY (booking_group_id) REFERENCES public.booking_groups(id);


--
-- Name: bookings bookings_company_open_bill_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bookings
    ADD CONSTRAINT bookings_company_open_bill_id_fkey FOREIGN KEY (company_open_bill_id) REFERENCES public.company_open_bills(id) ON DELETE SET NULL;


--
-- Name: bookings bookings_court_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bookings
    ADD CONSTRAINT bookings_court_id_fkey FOREIGN KEY (court_id) REFERENCES public.courts(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: bookings bookings_player_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bookings
    ADD CONSTRAINT bookings_player_id_fkey FOREIGN KEY (player_id) REFERENCES public.players(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: bookings bookings_venue_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bookings
    ADD CONSTRAINT bookings_venue_id_fkey FOREIGN KEY (venue_id) REFERENCES public.venues(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: check_in_players check_in_players_player_identity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.check_in_players
    ADD CONSTRAINT check_in_players_player_identity_id_fkey FOREIGN KEY (player_identity_id) REFERENCES public.player_identities(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: check_in_players check_in_players_venue_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.check_in_players
    ADD CONSTRAINT check_in_players_venue_id_fkey FOREIGN KEY (venue_id) REFERENCES public.venues(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: check_in_records check_in_records_player_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.check_in_records
    ADD CONSTRAINT check_in_records_player_id_fkey FOREIGN KEY (player_id) REFERENCES public.check_in_players(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: check_in_records check_in_records_venue_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.check_in_records
    ADD CONSTRAINT check_in_records_venue_id_fkey FOREIGN KEY (venue_id) REFERENCES public.venues(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: class_check_ins class_check_ins_class_instance_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.class_check_ins
    ADD CONSTRAINT class_check_ins_class_instance_id_fkey FOREIGN KEY (class_instance_id) REFERENCES public.class_instances(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: class_check_ins class_check_ins_class_pass_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.class_check_ins
    ADD CONSTRAINT class_check_ins_class_pass_id_fkey FOREIGN KEY (class_pass_id) REFERENCES public.class_passes(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: class_instances class_instances_coach_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.class_instances
    ADD CONSTRAINT class_instances_coach_id_fkey FOREIGN KEY (coach_id) REFERENCES public.staff_members(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: class_instances class_instances_court_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.class_instances
    ADD CONSTRAINT class_instances_court_id_fkey FOREIGN KEY (court_id) REFERENCES public.courts(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: class_instances class_instances_tier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.class_instances
    ADD CONSTRAINT class_instances_tier_id_fkey FOREIGN KEY (pass_type_id) REFERENCES public.program_pass_types(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: class_instances class_instances_venue_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.class_instances
    ADD CONSTRAINT class_instances_venue_id_fkey FOREIGN KEY (venue_id) REFERENCES public.venues(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: class_pass_payments class_pass_payments_class_pass_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.class_pass_payments
    ADD CONSTRAINT class_pass_payments_class_pass_id_fkey FOREIGN KEY (class_pass_id) REFERENCES public.class_passes(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: program_pass_types class_pass_tiers_linked_coach_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.program_pass_types
    ADD CONSTRAINT class_pass_tiers_linked_coach_id_fkey FOREIGN KEY (linked_coach_id) REFERENCES public.staff_members(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: program_pass_types class_pass_tiers_venue_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.program_pass_types
    ADD CONSTRAINT class_pass_tiers_venue_id_fkey FOREIGN KEY (venue_id) REFERENCES public.venues(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: class_passes class_passes_player_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.class_passes
    ADD CONSTRAINT class_passes_player_id_fkey FOREIGN KEY (player_id) REFERENCES public.players(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: class_passes class_passes_tier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.class_passes
    ADD CONSTRAINT class_passes_tier_id_fkey FOREIGN KEY (pass_type_id) REFERENCES public.program_pass_types(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: class_passes class_passes_venue_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.class_passes
    ADD CONSTRAINT class_passes_venue_id_fkey FOREIGN KEY (venue_id) REFERENCES public.venues(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: coach_availabilities coach_availabilities_coach_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coach_availabilities
    ADD CONSTRAINT coach_availabilities_coach_id_fkey FOREIGN KEY (coach_id) REFERENCES public.staff_members(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: coach_holidays coach_holidays_coach_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coach_holidays
    ADD CONSTRAINT coach_holidays_coach_id_fkey FOREIGN KEY (coach_id) REFERENCES public.staff_members(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: coach_lessons coach_lessons_coach_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coach_lessons
    ADD CONSTRAINT coach_lessons_coach_id_fkey FOREIGN KEY (coach_id) REFERENCES public.staff_members(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: coach_lessons coach_lessons_court_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coach_lessons
    ADD CONSTRAINT coach_lessons_court_id_fkey FOREIGN KEY (court_id) REFERENCES public.courts(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: coach_lessons coach_lessons_package_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coach_lessons
    ADD CONSTRAINT coach_lessons_package_id_fkey FOREIGN KEY (package_id) REFERENCES public.coach_packages(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: coach_lessons coach_lessons_player_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coach_lessons
    ADD CONSTRAINT coach_lessons_player_id_fkey FOREIGN KEY (player_id) REFERENCES public.players(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: coach_lessons coach_lessons_venue_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coach_lessons
    ADD CONSTRAINT coach_lessons_venue_id_fkey FOREIGN KEY (venue_id) REFERENCES public.venues(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: coach_packages coach_packages_coach_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coach_packages
    ADD CONSTRAINT coach_packages_coach_id_fkey FOREIGN KEY (coach_id) REFERENCES public.staff_members(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: coach_packages coach_packages_venue_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coach_packages
    ADD CONSTRAINT coach_packages_venue_id_fkey FOREIGN KEY (venue_id) REFERENCES public.venues(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: company_account_players company_account_players_company_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_account_players
    ADD CONSTRAINT company_account_players_company_fkey FOREIGN KEY (company_account_id) REFERENCES public.company_accounts(id) ON DELETE CASCADE;


--
-- Name: company_account_players company_account_players_player_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_account_players
    ADD CONSTRAINT company_account_players_player_fkey FOREIGN KEY (player_id) REFERENCES public.players(id) ON DELETE CASCADE;


--
-- Name: company_accounts company_accounts_primary_player_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_accounts
    ADD CONSTRAINT company_accounts_primary_player_id_fkey FOREIGN KEY (primary_player_id) REFERENCES public.players(id) ON DELETE SET NULL;


--
-- Name: company_accounts company_accounts_venue_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_accounts
    ADD CONSTRAINT company_accounts_venue_id_fkey FOREIGN KEY (venue_id) REFERENCES public.venues(id) ON DELETE CASCADE;


--
-- Name: company_open_bill_events company_open_bill_events_bill_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_open_bill_events
    ADD CONSTRAINT company_open_bill_events_bill_fkey FOREIGN KEY (bill_id) REFERENCES public.company_open_bills(id) ON DELETE CASCADE;


--
-- Name: company_open_bills company_open_bills_company_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_open_bills
    ADD CONSTRAINT company_open_bills_company_fkey FOREIGN KEY (company_account_id) REFERENCES public.company_accounts(id) ON DELETE CASCADE;


--
-- Name: company_open_bills company_open_bills_venue_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_open_bills
    ADD CONSTRAINT company_open_bills_venue_fkey FOREIGN KEY (venue_id) REFERENCES public.venues(id) ON DELETE CASCADE;


--
-- Name: court_assignments court_assignments_court_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.court_assignments
    ADD CONSTRAINT court_assignments_court_id_fkey FOREIGN KEY (court_id) REFERENCES public.courts(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: court_assignments court_assignments_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.court_assignments
    ADD CONSTRAINT court_assignments_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.sessions(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: court_blocks court_blocks_venue_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.court_blocks
    ADD CONSTRAINT court_blocks_venue_id_fkey FOREIGN KEY (venue_id) REFERENCES public.venues(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: courts courts_pricing_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.courts
    ADD CONSTRAINT courts_pricing_group_id_fkey FOREIGN KEY (pricing_group_id) REFERENCES public.pricing_groups(id) ON DELETE SET NULL;


--
-- Name: courts courts_venue_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.courts
    ADD CONSTRAINT courts_venue_id_fkey FOREIGN KEY (venue_id) REFERENCES public.venues(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: credit_transactions credit_transactions_credit_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.credit_transactions
    ADD CONSTRAINT credit_transactions_credit_id_fkey FOREIGN KEY (credit_id) REFERENCES public.player_coach_credits(id) ON DELETE CASCADE;


--
-- Name: face_attempts face_attempts_matched_player_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.face_attempts
    ADD CONSTRAINT face_attempts_matched_player_id_fkey FOREIGN KEY (matched_player_id) REFERENCES public.players(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: face_recognition_logs face_recognition_logs_player_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.face_recognition_logs
    ADD CONSTRAINT face_recognition_logs_player_id_fkey FOREIGN KEY (player_id) REFERENCES public.players(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: face_recognition_logs face_recognition_logs_staff_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.face_recognition_logs
    ADD CONSTRAINT face_recognition_logs_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES public.staff_members(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: face_recognition_logs face_recognition_logs_venue_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.face_recognition_logs
    ADD CONSTRAINT face_recognition_logs_venue_id_fkey FOREIGN KEY (venue_id) REFERENCES public.venues(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: manual_billing_invoices manual_billing_invoices_venue_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.manual_billing_invoices
    ADD CONSTRAINT manual_billing_invoices_venue_id_fkey FOREIGN KEY (venue_id) REFERENCES public.venues(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: membership_payments membership_payments_membership_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.membership_payments
    ADD CONSTRAINT membership_payments_membership_id_fkey FOREIGN KEY (membership_id) REFERENCES public.memberships(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: membership_tiers membership_tiers_venue_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.membership_tiers
    ADD CONSTRAINT membership_tiers_venue_id_fkey FOREIGN KEY (venue_id) REFERENCES public.venues(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: memberships memberships_player_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.memberships
    ADD CONSTRAINT memberships_player_id_fkey FOREIGN KEY (player_id) REFERENCES public.players(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: memberships memberships_tier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.memberships
    ADD CONSTRAINT memberships_tier_id_fkey FOREIGN KEY (tier_id) REFERENCES public.membership_tiers(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: memberships memberships_venue_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.memberships
    ADD CONSTRAINT memberships_venue_id_fkey FOREIGN KEY (venue_id) REFERENCES public.venues(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: open_play_registrations open_play_registrations_player_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.open_play_registrations
    ADD CONSTRAINT open_play_registrations_player_id_fkey FOREIGN KEY (player_id) REFERENCES public.players(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: open_play_registrations open_play_registrations_venue_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.open_play_registrations
    ADD CONSTRAINT open_play_registrations_venue_id_fkey FOREIGN KEY (venue_id) REFERENCES public.venues(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: pending_payments pending_payments_check_in_player_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pending_payments
    ADD CONSTRAINT pending_payments_check_in_player_id_fkey FOREIGN KEY (check_in_player_id) REFERENCES public.check_in_players(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: pending_payments pending_payments_player_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pending_payments
    ADD CONSTRAINT pending_payments_player_id_fkey FOREIGN KEY (player_id) REFERENCES public.players(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: pending_payments pending_payments_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pending_payments
    ADD CONSTRAINT pending_payments_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.sessions(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: pending_payments pending_payments_venue_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pending_payments
    ADD CONSTRAINT pending_payments_venue_id_fkey FOREIGN KEY (venue_id) REFERENCES public.venues(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: player_accounts player_accounts_player_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.player_accounts
    ADD CONSTRAINT player_accounts_player_id_fkey FOREIGN KEY (player_id) REFERENCES public.players(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: player_app_auth_logs player_app_auth_logs_player_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.player_app_auth_logs
    ADD CONSTRAINT player_app_auth_logs_player_id_fkey FOREIGN KEY (player_id) REFERENCES public.players(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: player_coach_credits player_coach_credits_coach_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.player_coach_credits
    ADD CONSTRAINT player_coach_credits_coach_id_fkey FOREIGN KEY (coach_id) REFERENCES public.staff_members(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: player_coach_credits player_coach_credits_package_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.player_coach_credits
    ADD CONSTRAINT player_coach_credits_package_id_fkey FOREIGN KEY (package_id) REFERENCES public.coach_packages(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: player_coach_credits player_coach_credits_player_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.player_coach_credits
    ADD CONSTRAINT player_coach_credits_player_id_fkey FOREIGN KEY (player_id) REFERENCES public.players(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: player_coach_credits player_coach_credits_venue_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.player_coach_credits
    ADD CONSTRAINT player_coach_credits_venue_id_fkey FOREIGN KEY (venue_id) REFERENCES public.venues(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: player_custom_prices player_custom_prices_player_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.player_custom_prices
    ADD CONSTRAINT player_custom_prices_player_id_fkey FOREIGN KEY (player_id) REFERENCES public.players(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: player_custom_prices player_custom_prices_staff_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.player_custom_prices
    ADD CONSTRAINT player_custom_prices_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES public.staff_members(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: player_groups player_groups_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.player_groups
    ADD CONSTRAINT player_groups_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.sessions(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: player_magic_tokens player_magic_tokens_player_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.player_magic_tokens
    ADD CONSTRAINT player_magic_tokens_player_id_fkey FOREIGN KEY (player_id) REFERENCES public.players(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: player_notes player_notes_player_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.player_notes
    ADD CONSTRAINT player_notes_player_id_fkey FOREIGN KEY (player_id) REFERENCES public.players(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: player_notes player_notes_venue_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.player_notes
    ADD CONSTRAINT player_notes_venue_id_fkey FOREIGN KEY (venue_id) REFERENCES public.venues(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: player_password_reset_tokens player_password_reset_tokens_player_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.player_password_reset_tokens
    ADD CONSTRAINT player_password_reset_tokens_player_id_fkey FOREIGN KEY (player_id) REFERENCES public.players(id) ON DELETE CASCADE;


--
-- Name: player_rankings player_rankings_court_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.player_rankings
    ADD CONSTRAINT player_rankings_court_id_fkey FOREIGN KEY (court_id) REFERENCES public.courts(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: player_rankings player_rankings_player_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.player_rankings
    ADD CONSTRAINT player_rankings_player_id_fkey FOREIGN KEY (player_id) REFERENCES public.players(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: player_rankings player_rankings_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.player_rankings
    ADD CONSTRAINT player_rankings_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.sessions(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: player_rankings player_rankings_staff_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.player_rankings
    ADD CONSTRAINT player_rankings_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES public.staff_members(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: player_sticker_packs player_sticker_packs_player_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.player_sticker_packs
    ADD CONSTRAINT player_sticker_packs_player_id_fkey FOREIGN KEY (player_id) REFERENCES public.players(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: player_sticker_packs player_sticker_packs_result_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.player_sticker_packs
    ADD CONSTRAINT player_sticker_packs_result_id_fkey FOREIGN KEY (result_id) REFERENCES public.player_sticker_results(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: player_sticker_photos player_sticker_photos_player_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.player_sticker_photos
    ADD CONSTRAINT player_sticker_photos_player_id_fkey FOREIGN KEY (player_id) REFERENCES public.players(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: player_sticker_results player_sticker_results_player_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.player_sticker_results
    ADD CONSTRAINT player_sticker_results_player_id_fkey FOREIGN KEY (player_id) REFERENCES public.players(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: player_subscriptions player_subscriptions_package_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.player_subscriptions
    ADD CONSTRAINT player_subscriptions_package_id_fkey FOREIGN KEY (package_id) REFERENCES public.subscription_packages(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: player_subscriptions player_subscriptions_player_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.player_subscriptions
    ADD CONSTRAINT player_subscriptions_player_id_fkey FOREIGN KEY (player_id) REFERENCES public.check_in_players(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: players players_coach_staff_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.players
    ADD CONSTRAINT players_coach_staff_id_fkey FOREIGN KEY (coach_staff_id) REFERENCES public.staff_members(id) ON DELETE SET NULL;


--
-- Name: players players_player_identity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.players
    ADD CONSTRAINT players_player_identity_id_fkey FOREIGN KEY (player_identity_id) REFERENCES public.player_identities(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: players players_registration_venue_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.players
    ADD CONSTRAINT players_registration_venue_id_fkey FOREIGN KEY (registration_venue_id) REFERENCES public.venues(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: pricing_groups pricing_groups_venue_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pricing_groups
    ADD CONSTRAINT pricing_groups_venue_id_fkey FOREIGN KEY (venue_id) REFERENCES public.venues(id) ON DELETE CASCADE;


--
-- Name: program_pass_type_coaches program_pass_type_coaches_coach_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.program_pass_type_coaches
    ADD CONSTRAINT program_pass_type_coaches_coach_id_fkey FOREIGN KEY (coach_id) REFERENCES public.staff_members(id) ON DELETE CASCADE;


--
-- Name: program_pass_type_coaches program_pass_type_coaches_pass_type_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.program_pass_type_coaches
    ADD CONSTRAINT program_pass_type_coaches_pass_type_id_fkey FOREIGN KEY (pass_type_id) REFERENCES public.program_pass_types(id) ON DELETE CASCADE;


--
-- Name: promo_codes promo_codes_venue_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.promo_codes
    ADD CONSTRAINT promo_codes_venue_id_fkey FOREIGN KEY (venue_id) REFERENCES public.venues(id) ON DELETE CASCADE;


--
-- Name: promo_link_clicks promo_link_clicks_player_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.promo_link_clicks
    ADD CONSTRAINT promo_link_clicks_player_id_fkey FOREIGN KEY (player_id) REFERENCES public.players(id) ON DELETE SET NULL;


--
-- Name: promo_link_clicks promo_link_clicks_promo_code_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.promo_link_clicks
    ADD CONSTRAINT promo_link_clicks_promo_code_id_fkey FOREIGN KEY (promo_code_id) REFERENCES public.promo_codes(id) ON DELETE CASCADE;


--
-- Name: promo_redemptions promo_redemptions_first_click_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.promo_redemptions
    ADD CONSTRAINT promo_redemptions_first_click_id_fkey FOREIGN KEY (first_click_id) REFERENCES public.promo_link_clicks(id) ON DELETE SET NULL;


--
-- Name: promo_redemptions promo_redemptions_player_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.promo_redemptions
    ADD CONSTRAINT promo_redemptions_player_id_fkey FOREIGN KEY (player_id) REFERENCES public.players(id) ON DELETE RESTRICT;


--
-- Name: promo_redemptions promo_redemptions_promo_code_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.promo_redemptions
    ADD CONSTRAINT promo_redemptions_promo_code_id_fkey FOREIGN KEY (promo_code_id) REFERENCES public.promo_codes(id) ON DELETE RESTRICT;


--
-- Name: push_subscriptions push_subscriptions_player_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.push_subscriptions
    ADD CONSTRAINT push_subscriptions_player_id_fkey FOREIGN KEY (player_id) REFERENCES public.players(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: queue_entries queue_entries_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.queue_entries
    ADD CONSTRAINT queue_entries_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.player_groups(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: queue_entries queue_entries_player_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.queue_entries
    ADD CONSTRAINT queue_entries_player_id_fkey FOREIGN KEY (player_id) REFERENCES public.players(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: queue_entries queue_entries_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.queue_entries
    ADD CONSTRAINT queue_entries_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.sessions(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: sessions sessions_staff_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES public.staff_members(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: sessions sessions_venue_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_venue_id_fkey FOREIGN KEY (venue_id) REFERENCES public.venues(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: signup_duplicate_logs signup_duplicate_logs_matched_player_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.signup_duplicate_logs
    ADD CONSTRAINT signup_duplicate_logs_matched_player_id_fkey FOREIGN KEY (matched_player_id) REFERENCES public.players(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: signup_duplicate_logs signup_duplicate_logs_venue_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.signup_duplicate_logs
    ADD CONSTRAINT signup_duplicate_logs_venue_id_fkey FOREIGN KEY (venue_id) REFERENCES public.venues(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: staff_auth_logs staff_auth_logs_staff_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_auth_logs
    ADD CONSTRAINT staff_auth_logs_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES public.staff_members(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: staff_payments staff_payments_paid_by_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_payments
    ADD CONSTRAINT staff_payments_paid_by_id_fkey FOREIGN KEY (paid_by_id) REFERENCES public.staff_members(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: staff_payments staff_payments_staff_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_payments
    ADD CONSTRAINT staff_payments_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES public.staff_members(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: staff_push_tokens staff_push_tokens_staff_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_push_tokens
    ADD CONSTRAINT staff_push_tokens_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES public.staff_members(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: staff_venue_assignments staff_venue_assignments_staff_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_venue_assignments
    ADD CONSTRAINT staff_venue_assignments_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES public.staff_members(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: staff_venue_assignments staff_venue_assignments_venue_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_venue_assignments
    ADD CONSTRAINT staff_venue_assignments_venue_id_fkey FOREIGN KEY (venue_id) REFERENCES public.venues(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: sticker_job_queue sticker_job_queue_player_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sticker_job_queue
    ADD CONSTRAINT sticker_job_queue_player_id_fkey FOREIGN KEY (player_id) REFERENCES public.players(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: sticker_sessions sticker_sessions_player_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sticker_sessions
    ADD CONSTRAINT sticker_sessions_player_id_fkey FOREIGN KEY (player_id) REFERENCES public.players(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: subscription_packages subscription_packages_venue_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscription_packages
    ADD CONSTRAINT subscription_packages_venue_id_fkey FOREIGN KEY (venue_id) REFERENCES public.venues(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: subscription_usages subscription_usages_subscription_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscription_usages
    ADD CONSTRAINT subscription_usages_subscription_id_fkey FOREIGN KEY (subscription_id) REFERENCES public.player_subscriptions(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: venue_billing_rates venue_billing_rates_venue_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.venue_billing_rates
    ADD CONSTRAINT venue_billing_rates_venue_id_fkey FOREIGN KEY (venue_id) REFERENCES public.venues(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: venues venues_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.venues
    ADD CONSTRAINT venues_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: venues venues_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.venues
    ADD CONSTRAINT venues_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES public.staff_members(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: _StaffMemberToVenue _StaffMemberToVenue_A_fkey; Type: FK CONSTRAINT; Schema: shadow_temp; Owner: -
--

ALTER TABLE ONLY shadow_temp."_StaffMemberToVenue"
    ADD CONSTRAINT "_StaffMemberToVenue_A_fkey" FOREIGN KEY ("A") REFERENCES shadow_temp.staff_members(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: _StaffMemberToVenue _StaffMemberToVenue_B_fkey; Type: FK CONSTRAINT; Schema: shadow_temp; Owner: -
--

ALTER TABLE ONLY shadow_temp."_StaffMemberToVenue"
    ADD CONSTRAINT "_StaffMemberToVenue_B_fkey" FOREIGN KEY ("B") REFERENCES shadow_temp.venues(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: audit_logs audit_logs_staff_id_fkey; Type: FK CONSTRAINT; Schema: shadow_temp; Owner: -
--

ALTER TABLE ONLY shadow_temp.audit_logs
    ADD CONSTRAINT audit_logs_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES shadow_temp.staff_members(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: audit_logs audit_logs_venue_id_fkey; Type: FK CONSTRAINT; Schema: shadow_temp; Owner: -
--

ALTER TABLE ONLY shadow_temp.audit_logs
    ADD CONSTRAINT audit_logs_venue_id_fkey FOREIGN KEY (venue_id) REFERENCES shadow_temp.venues(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: bookings bookings_court_id_fkey; Type: FK CONSTRAINT; Schema: shadow_temp; Owner: -
--

ALTER TABLE ONLY shadow_temp.bookings
    ADD CONSTRAINT bookings_court_id_fkey FOREIGN KEY (court_id) REFERENCES shadow_temp.courts(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: bookings bookings_player_id_fkey; Type: FK CONSTRAINT; Schema: shadow_temp; Owner: -
--

ALTER TABLE ONLY shadow_temp.bookings
    ADD CONSTRAINT bookings_player_id_fkey FOREIGN KEY (player_id) REFERENCES shadow_temp.players(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: bookings bookings_venue_id_fkey; Type: FK CONSTRAINT; Schema: shadow_temp; Owner: -
--

ALTER TABLE ONLY shadow_temp.bookings
    ADD CONSTRAINT bookings_venue_id_fkey FOREIGN KEY (venue_id) REFERENCES shadow_temp.venues(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: coach_lessons coach_lessons_coach_id_fkey; Type: FK CONSTRAINT; Schema: shadow_temp; Owner: -
--

ALTER TABLE ONLY shadow_temp.coach_lessons
    ADD CONSTRAINT coach_lessons_coach_id_fkey FOREIGN KEY (coach_id) REFERENCES shadow_temp.staff_members(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: coach_lessons coach_lessons_court_id_fkey; Type: FK CONSTRAINT; Schema: shadow_temp; Owner: -
--

ALTER TABLE ONLY shadow_temp.coach_lessons
    ADD CONSTRAINT coach_lessons_court_id_fkey FOREIGN KEY (court_id) REFERENCES shadow_temp.courts(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: coach_lessons coach_lessons_package_id_fkey; Type: FK CONSTRAINT; Schema: shadow_temp; Owner: -
--

ALTER TABLE ONLY shadow_temp.coach_lessons
    ADD CONSTRAINT coach_lessons_package_id_fkey FOREIGN KEY (package_id) REFERENCES shadow_temp.coach_packages(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: coach_lessons coach_lessons_player_id_fkey; Type: FK CONSTRAINT; Schema: shadow_temp; Owner: -
--

ALTER TABLE ONLY shadow_temp.coach_lessons
    ADD CONSTRAINT coach_lessons_player_id_fkey FOREIGN KEY (player_id) REFERENCES shadow_temp.players(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: coach_lessons coach_lessons_venue_id_fkey; Type: FK CONSTRAINT; Schema: shadow_temp; Owner: -
--

ALTER TABLE ONLY shadow_temp.coach_lessons
    ADD CONSTRAINT coach_lessons_venue_id_fkey FOREIGN KEY (venue_id) REFERENCES shadow_temp.venues(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: coach_packages coach_packages_coach_id_fkey; Type: FK CONSTRAINT; Schema: shadow_temp; Owner: -
--

ALTER TABLE ONLY shadow_temp.coach_packages
    ADD CONSTRAINT coach_packages_coach_id_fkey FOREIGN KEY (coach_id) REFERENCES shadow_temp.staff_members(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: coach_packages coach_packages_venue_id_fkey; Type: FK CONSTRAINT; Schema: shadow_temp; Owner: -
--

ALTER TABLE ONLY shadow_temp.coach_packages
    ADD CONSTRAINT coach_packages_venue_id_fkey FOREIGN KEY (venue_id) REFERENCES shadow_temp.venues(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: court_assignments court_assignments_court_id_fkey; Type: FK CONSTRAINT; Schema: shadow_temp; Owner: -
--

ALTER TABLE ONLY shadow_temp.court_assignments
    ADD CONSTRAINT court_assignments_court_id_fkey FOREIGN KEY (court_id) REFERENCES shadow_temp.courts(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: court_assignments court_assignments_session_id_fkey; Type: FK CONSTRAINT; Schema: shadow_temp; Owner: -
--

ALTER TABLE ONLY shadow_temp.court_assignments
    ADD CONSTRAINT court_assignments_session_id_fkey FOREIGN KEY (session_id) REFERENCES shadow_temp.sessions(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: court_blocks court_blocks_venue_id_fkey; Type: FK CONSTRAINT; Schema: shadow_temp; Owner: -
--

ALTER TABLE ONLY shadow_temp.court_blocks
    ADD CONSTRAINT court_blocks_venue_id_fkey FOREIGN KEY (venue_id) REFERENCES shadow_temp.venues(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: courts courts_venue_id_fkey; Type: FK CONSTRAINT; Schema: shadow_temp; Owner: -
--

ALTER TABLE ONLY shadow_temp.courts
    ADD CONSTRAINT courts_venue_id_fkey FOREIGN KEY (venue_id) REFERENCES shadow_temp.venues(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: face_attempts face_attempts_matched_player_id_fkey; Type: FK CONSTRAINT; Schema: shadow_temp; Owner: -
--

ALTER TABLE ONLY shadow_temp.face_attempts
    ADD CONSTRAINT face_attempts_matched_player_id_fkey FOREIGN KEY (matched_player_id) REFERENCES shadow_temp.players(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: membership_payments membership_payments_membership_id_fkey; Type: FK CONSTRAINT; Schema: shadow_temp; Owner: -
--

ALTER TABLE ONLY shadow_temp.membership_payments
    ADD CONSTRAINT membership_payments_membership_id_fkey FOREIGN KEY (membership_id) REFERENCES shadow_temp.memberships(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: membership_tiers membership_tiers_venue_id_fkey; Type: FK CONSTRAINT; Schema: shadow_temp; Owner: -
--

ALTER TABLE ONLY shadow_temp.membership_tiers
    ADD CONSTRAINT membership_tiers_venue_id_fkey FOREIGN KEY (venue_id) REFERENCES shadow_temp.venues(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: memberships memberships_player_id_fkey; Type: FK CONSTRAINT; Schema: shadow_temp; Owner: -
--

ALTER TABLE ONLY shadow_temp.memberships
    ADD CONSTRAINT memberships_player_id_fkey FOREIGN KEY (player_id) REFERENCES shadow_temp.players(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: memberships memberships_tier_id_fkey; Type: FK CONSTRAINT; Schema: shadow_temp; Owner: -
--

ALTER TABLE ONLY shadow_temp.memberships
    ADD CONSTRAINT memberships_tier_id_fkey FOREIGN KEY (tier_id) REFERENCES shadow_temp.membership_tiers(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: memberships memberships_venue_id_fkey; Type: FK CONSTRAINT; Schema: shadow_temp; Owner: -
--

ALTER TABLE ONLY shadow_temp.memberships
    ADD CONSTRAINT memberships_venue_id_fkey FOREIGN KEY (venue_id) REFERENCES shadow_temp.venues(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: pending_payments pending_payments_player_id_fkey; Type: FK CONSTRAINT; Schema: shadow_temp; Owner: -
--

ALTER TABLE ONLY shadow_temp.pending_payments
    ADD CONSTRAINT pending_payments_player_id_fkey FOREIGN KEY (player_id) REFERENCES shadow_temp.players(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: pending_payments pending_payments_session_id_fkey; Type: FK CONSTRAINT; Schema: shadow_temp; Owner: -
--

ALTER TABLE ONLY shadow_temp.pending_payments
    ADD CONSTRAINT pending_payments_session_id_fkey FOREIGN KEY (session_id) REFERENCES shadow_temp.sessions(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: pending_payments pending_payments_venue_id_fkey; Type: FK CONSTRAINT; Schema: shadow_temp; Owner: -
--

ALTER TABLE ONLY shadow_temp.pending_payments
    ADD CONSTRAINT pending_payments_venue_id_fkey FOREIGN KEY (venue_id) REFERENCES shadow_temp.venues(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: player_app_auth_logs player_app_auth_logs_player_id_fkey; Type: FK CONSTRAINT; Schema: shadow_temp; Owner: -
--

ALTER TABLE ONLY shadow_temp.player_app_auth_logs
    ADD CONSTRAINT player_app_auth_logs_player_id_fkey FOREIGN KEY (player_id) REFERENCES shadow_temp.players(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: player_groups player_groups_session_id_fkey; Type: FK CONSTRAINT; Schema: shadow_temp; Owner: -
--

ALTER TABLE ONLY shadow_temp.player_groups
    ADD CONSTRAINT player_groups_session_id_fkey FOREIGN KEY (session_id) REFERENCES shadow_temp.sessions(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: player_rankings player_rankings_court_id_fkey; Type: FK CONSTRAINT; Schema: shadow_temp; Owner: -
--

ALTER TABLE ONLY shadow_temp.player_rankings
    ADD CONSTRAINT player_rankings_court_id_fkey FOREIGN KEY (court_id) REFERENCES shadow_temp.courts(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: player_rankings player_rankings_player_id_fkey; Type: FK CONSTRAINT; Schema: shadow_temp; Owner: -
--

ALTER TABLE ONLY shadow_temp.player_rankings
    ADD CONSTRAINT player_rankings_player_id_fkey FOREIGN KEY (player_id) REFERENCES shadow_temp.players(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: player_rankings player_rankings_session_id_fkey; Type: FK CONSTRAINT; Schema: shadow_temp; Owner: -
--

ALTER TABLE ONLY shadow_temp.player_rankings
    ADD CONSTRAINT player_rankings_session_id_fkey FOREIGN KEY (session_id) REFERENCES shadow_temp.sessions(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: player_rankings player_rankings_staff_id_fkey; Type: FK CONSTRAINT; Schema: shadow_temp; Owner: -
--

ALTER TABLE ONLY shadow_temp.player_rankings
    ADD CONSTRAINT player_rankings_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES shadow_temp.staff_members(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: push_subscriptions push_subscriptions_player_id_fkey; Type: FK CONSTRAINT; Schema: shadow_temp; Owner: -
--

ALTER TABLE ONLY shadow_temp.push_subscriptions
    ADD CONSTRAINT push_subscriptions_player_id_fkey FOREIGN KEY (player_id) REFERENCES shadow_temp.players(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: queue_entries queue_entries_group_id_fkey; Type: FK CONSTRAINT; Schema: shadow_temp; Owner: -
--

ALTER TABLE ONLY shadow_temp.queue_entries
    ADD CONSTRAINT queue_entries_group_id_fkey FOREIGN KEY (group_id) REFERENCES shadow_temp.player_groups(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: queue_entries queue_entries_player_id_fkey; Type: FK CONSTRAINT; Schema: shadow_temp; Owner: -
--

ALTER TABLE ONLY shadow_temp.queue_entries
    ADD CONSTRAINT queue_entries_player_id_fkey FOREIGN KEY (player_id) REFERENCES shadow_temp.players(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: queue_entries queue_entries_session_id_fkey; Type: FK CONSTRAINT; Schema: shadow_temp; Owner: -
--

ALTER TABLE ONLY shadow_temp.queue_entries
    ADD CONSTRAINT queue_entries_session_id_fkey FOREIGN KEY (session_id) REFERENCES shadow_temp.sessions(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: sessions sessions_staff_id_fkey; Type: FK CONSTRAINT; Schema: shadow_temp; Owner: -
--

ALTER TABLE ONLY shadow_temp.sessions
    ADD CONSTRAINT sessions_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES shadow_temp.staff_members(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: sessions sessions_venue_id_fkey; Type: FK CONSTRAINT; Schema: shadow_temp; Owner: -
--

ALTER TABLE ONLY shadow_temp.sessions
    ADD CONSTRAINT sessions_venue_id_fkey FOREIGN KEY (venue_id) REFERENCES shadow_temp.venues(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: staff_payments staff_payments_paid_by_id_fkey; Type: FK CONSTRAINT; Schema: shadow_temp; Owner: -
--

ALTER TABLE ONLY shadow_temp.staff_payments
    ADD CONSTRAINT staff_payments_paid_by_id_fkey FOREIGN KEY (paid_by_id) REFERENCES shadow_temp.staff_members(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: staff_payments staff_payments_staff_id_fkey; Type: FK CONSTRAINT; Schema: shadow_temp; Owner: -
--

ALTER TABLE ONLY shadow_temp.staff_payments
    ADD CONSTRAINT staff_payments_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES shadow_temp.staff_members(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- PostgreSQL database dump complete
--

\unrestrict dbmate


--
-- Dbmate schema migrations
--

INSERT INTO public.schema_migrations (version) VALUES
    ('20260704000001'),
    ('20260704000002'),
    ('20260704000003'),
    ('20260704025913'),
    ('20260704042005'),
    ('20260705050420'),
    ('20260705050540'),
    ('20260705122627'),
    ('20260705231856'),
    ('20260706010731'),
    ('20260706055400'),
    ('20260706074030'),
    ('20260706080327'),
    ('20260707015817'),
    ('20260708013950'),
    ('20260708235206'),
    ('20260709001329'),
    ('20260709081528'),
    ('20260709091207'),
    ('20260713000106');

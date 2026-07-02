-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "SkillLevel" AS ENUM ('beginner', 'intermediate', 'advanced', 'pro');

-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('male', 'female', 'other');

-- CreateEnum
CREATE TYPE "CourtStatus" AS ENUM ('idle', 'warmup', 'active', 'maintenance');

-- CreateEnum
CREATE TYPE "GameType" AS ENUM ('men', 'women', 'mixed');

-- CreateEnum
CREATE TYPE "SessionStatus" AS ENUM ('open', 'closed');

-- CreateEnum
CREATE TYPE "SessionType" AS ENUM ('open_play', 'competition');

-- CreateEnum
CREATE TYPE "CourtBlockType" AS ENUM ('private_competition', 'private_event', 'maintenance', 'open_play', 'competition');

-- CreateEnum
CREATE TYPE "QueueStatus" AS ENUM ('waiting', 'assigned', 'playing', 'on_break', 'left');

-- CreateEnum
CREATE TYPE "GroupStatus" AS ENUM ('forming', 'active', 'disbanded');

-- CreateEnum
CREATE TYPE "GamePreference" AS ENUM ('no_preference', 'same_gender');

-- CreateEnum
CREATE TYPE "StaffRole" AS ENUM ('staff', 'manager', 'superadmin');

-- CreateEnum
CREATE TYPE "PlayerAppAuthMethod" AS ENUM ('face_pwa', 'wristband', 'phone_otp');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('UNPAID', 'PAID');

-- CreateEnum
CREATE TYPE "MembershipStatus" AS ENUM ('active', 'suspended', 'expired', 'cancelled');

-- CreateEnum
CREATE TYPE "MembershipPaymentStatus" AS ENUM ('UNPAID', 'PAID', 'OVERDUE');

-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('confirmed', 'cancelled', 'completed', 'no_show');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('active', 'exhausted', 'expired', 'cancelled');

-- CreateEnum
CREATE TYPE "LessonType" AS ENUM ('private', 'group');

-- CreateEnum
CREATE TYPE "CoachLessonStatus" AS ENUM ('confirmed', 'completed', 'cancelled', 'no_show');

-- CreateTable
CREATE TABLE "venues" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "location" TEXT,
    "settings" JSONB NOT NULL DEFAULT '{}',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "expected_max_players" INTEGER,
    "play_frequency" TEXT,
    "play_types" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "pain_points" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "logo_url" TEXT,
    "tv_text" TEXT,
    "bank_account" TEXT,
    "bank_name" TEXT,
    "bank_owner_name" TEXT,
    "billing_status" TEXT NOT NULL DEFAULT 'active',
    "owner_id" TEXT,

    CONSTRAINT "venues_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "players" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "avatar" TEXT NOT NULL DEFAULT '🏓',
    "skill_level" "SkillLevel" NOT NULL DEFAULT 'beginner',
    "gender" "Gender" NOT NULL,
    "game_preference" "GamePreference" NOT NULL DEFAULT 'no_preference',
    "notifications_enabled" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "face_subject_id" TEXT,
    "face_photo_path" TEXT,
    "ranking_score" INTEGER NOT NULL DEFAULT 200,
    "ranking_count" INTEGER NOT NULL DEFAULT 0,
    "last_ranked_at" TIMESTAMP(3),
    "avatar_photo_path" TEXT,
    "is_walk_in" BOOLEAN NOT NULL DEFAULT false,
    "reclub_user_id" INTEGER,
    "registration_at" TIMESTAMP(3),
    "registration_venue_id" TEXT,

    CONSTRAINT "players_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "player_app_auth_logs" (
    "id" TEXT NOT NULL,
    "player_id" TEXT NOT NULL,
    "method" "PlayerAppAuthMethod" NOT NULL,
    "session_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "player_app_auth_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "push_subscriptions" (
    "id" TEXT NOT NULL,
    "player_id" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "push_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_venue_assignments" (
    "id" TEXT NOT NULL,
    "staff_id" TEXT NOT NULL,
    "venue_id" TEXT NOT NULL,
    "app_access" TEXT[] DEFAULT ARRAY['courtflow']::TEXT[],

    CONSTRAINT "staff_venue_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_members" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "role" "StaffRole" NOT NULL DEFAULT 'staff',
    "password_hash" TEXT NOT NULL,
    "onboarding_completed" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "coach_bio" TEXT,
    "coach_photo" TEXT,
    "is_coach" BOOLEAN NOT NULL DEFAULT false,
    "push_notifications_enabled" BOOLEAN NOT NULL DEFAULT false,
    "reclub_group_id" INTEGER,
    "coach_dupr" TEXT,
    "coach_gender" TEXT,
    "coach_languages" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "coach_specialties" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "coach_focus_levels" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "coach_years_experience" TEXT,
    "coach_group_sizes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "google_refresh_token" TEXT,
    "google_calendar_id" TEXT,
    "calendar_sync_enabled" BOOLEAN NOT NULL DEFAULT false,
    "credit_package_validity_days" INTEGER NOT NULL DEFAULT 90,

    CONSTRAINT "staff_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "courts" (
    "id" TEXT NOT NULL,
    "venue_id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "status" "CourtStatus" NOT NULL DEFAULT 'idle',
    "active_in_session" BOOLEAN NOT NULL DEFAULT false,
    "is_bookable" BOOLEAN NOT NULL DEFAULT false,
    "skip_warmup_after_maintenance" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "courts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "venue_id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "opened_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closed_at" TIMESTAMP(3),
    "status" "SessionStatus" NOT NULL DEFAULT 'open',
    "game_type_mix" JSONB,
    "max_players" INTEGER,
    "staff_id" TEXT,
    "warmup_mode" TEXT NOT NULL DEFAULT 'manual',
    "title" TEXT,
    "type" "SessionType" NOT NULL DEFAULT 'open_play',
    "intro_warmup_complete" BOOLEAN NOT NULL DEFAULT false,
    "session_fee" INTEGER NOT NULL DEFAULT 0,
    "reclub_event_name" TEXT,
    "reclub_reference_code" TEXT,
    "reclub_roster" JSONB,
    "reclub_snapshot" JSONB,
    "opened_on_device" TEXT,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "queue_entries" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "player_id" TEXT NOT NULL,
    "group_id" TEXT,
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "QueueStatus" NOT NULL DEFAULT 'waiting',
    "break_until" TIMESTAMP(3),
    "total_play_minutes_today" INTEGER NOT NULL DEFAULT 0,
    "game_preference" "GamePreference" NOT NULL DEFAULT 'no_preference',
    "queue_number" INTEGER,

    CONSTRAINT "queue_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "player_groups" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "status" "GroupStatus" NOT NULL DEFAULT 'forming',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "player_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "court_assignments" (
    "id" TEXT NOT NULL,
    "court_id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "player_ids" TEXT[],
    "group_ids" TEXT[],
    "game_type" "GameType" NOT NULL DEFAULT 'mixed',
    "is_warmup" BOOLEAN NOT NULL DEFAULT false,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" TIMESTAMP(3),
    "ended_by" TEXT,

    CONSTRAINT "court_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "player_rankings" (
    "id" TEXT NOT NULL,
    "player_id" TEXT NOT NULL,
    "court_id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "staff_id" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "score_delta" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "player_rankings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "venue_id" TEXT NOT NULL,
    "staff_id" TEXT,
    "action" TEXT NOT NULL,
    "target_id" TEXT,
    "reason" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_payments" (
    "id" TEXT NOT NULL,
    "staff_id" TEXT NOT NULL,
    "week_start" TIMESTAMP(3) NOT NULL,
    "total_hours" DECIMAL(6,1) NOT NULL,
    "amount" DECIMAL(10,0),
    "payment_method" TEXT,
    "status" "PaymentStatus" NOT NULL DEFAULT 'UNPAID',
    "paid_at" TIMESTAMP(3),
    "paid_date" TIMESTAMP(3),
    "paid_by_id" TEXT,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "staff_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "membership_tiers" (
    "id" TEXT NOT NULL,
    "venue_id" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "price_in_cents" INTEGER NOT NULL,
    "sessions_included" INTEGER,
    "show_badge" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "perks" JSONB NOT NULL DEFAULT '[]',

    CONSTRAINT "membership_tiers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "memberships" (
    "id" TEXT NOT NULL,
    "player_id" TEXT NOT NULL,
    "venue_id" TEXT NOT NULL,
    "tier_id" TEXT NOT NULL,
    "status" "MembershipStatus" NOT NULL DEFAULT 'active',
    "activated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "renewal_date" TIMESTAMP(3) NOT NULL,
    "sessions_used" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "membership_payments" (
    "id" TEXT NOT NULL,
    "membership_id" TEXT NOT NULL,
    "period_start" TIMESTAMP(3) NOT NULL,
    "period_end" TIMESTAMP(3) NOT NULL,
    "amount_in_cents" INTEGER NOT NULL,
    "status" "MembershipPaymentStatus" NOT NULL DEFAULT 'UNPAID',
    "paid_at" TIMESTAMP(3),
    "payment_method" TEXT,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "proof_url" TEXT,

    CONSTRAINT "membership_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "court_blocks" (
    "id" TEXT NOT NULL,
    "venue_id" TEXT NOT NULL,
    "type" "CourtBlockType" NOT NULL,
    "title" TEXT,
    "note" TEXT,
    "court_ids" TEXT[],
    "date" DATE NOT NULL,
    "start_time" TIMESTAMP(3) NOT NULL,
    "end_time" TIMESTAMP(3) NOT NULL,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "court_blocks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bookings" (
    "id" TEXT NOT NULL,
    "court_id" TEXT NOT NULL,
    "venue_id" TEXT NOT NULL,
    "player_id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "start_time" TIMESTAMP(3) NOT NULL,
    "end_time" TIMESTAMP(3) NOT NULL,
    "status" "BookingStatus" NOT NULL DEFAULT 'confirmed',
    "price_in_cents" INTEGER NOT NULL,
    "co_player_ids" TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cancelled_at" TIMESTAMP(3),

    CONSTRAINT "bookings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "otp_codes" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "otp_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coach_packages" (
    "id" TEXT NOT NULL,
    "coach_id" TEXT NOT NULL,
    "venue_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "lesson_type" "LessonType" NOT NULL,
    "duration_min" INTEGER NOT NULL,
    "price_in_cents" INTEGER NOT NULL,
    "sessions_included" INTEGER NOT NULL DEFAULT 1,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "coach_packages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coach_lessons" (
    "id" TEXT NOT NULL,
    "venue_id" TEXT NOT NULL,
    "coach_id" TEXT NOT NULL,
    "player_id" TEXT NOT NULL,
    "court_id" TEXT,
    "package_id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "start_time" TIMESTAMP(3) NOT NULL,
    "end_time" TIMESTAMP(3) NOT NULL,
    "status" "CoachLessonStatus" NOT NULL DEFAULT 'confirmed',
    "price_in_cents" INTEGER NOT NULL,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cancelled_at" TIMESTAMP(3),
    "paid_at" TIMESTAMP(3),
    "payment_method" TEXT,
    "payment_note" TEXT,
    "proof_url" TEXT,
    "payment_status" TEXT NOT NULL DEFAULT 'UNPAID',

    CONSTRAINT "coach_lessons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "face_attempts" (
    "id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "matched_player_id" TEXT,
    "result_type" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION,
    "image_url" TEXT,
    "created_new_player" BOOLEAN NOT NULL DEFAULT false,
    "host_reviewed" BOOLEAN NOT NULL DEFAULT false,
    "queue_number_assigned" INTEGER,
    "kiosk_device_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "phone_number" TEXT,

    CONSTRAINT "face_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "face_recognition_logs" (
    "id" TEXT NOT NULL,
    "venue_id" TEXT NOT NULL,
    "player_id" TEXT,
    "staff_id" TEXT,
    "similarity_score" DOUBLE PRECISION,
    "threshold" DOUBLE PRECISION NOT NULL,
    "passed" BOOLEAN NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "face_recognition_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pending_payments" (
    "id" TEXT NOT NULL,
    "venue_id" TEXT NOT NULL,
    "session_id" TEXT,
    "player_id" TEXT,
    "amount" INTEGER NOT NULL,
    "payment_method" TEXT NOT NULL DEFAULT 'vietqr',
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "confirmed_at" TIMESTAMP(3),
    "confirmed_by" TEXT,
    "check_in_player_id" TEXT,
    "payment_ref" TEXT,
    "cancel_reason" TEXT,
    "cancelled_at" TIMESTAMP(3),
    "party_count" INTEGER NOT NULL DEFAULT 1,
    "group_paid_by_name" TEXT,
    "group_paid_by_payment_id" TEXT,
    "confirmed_on_device" TEXT,

    CONSTRAINT "pending_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kiosk_devices" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "location" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "kiosk_devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "check_in_players" (
    "id" TEXT NOT NULL,
    "venue_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "gender" TEXT,
    "skill_level" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "check_in_players_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscription_packages" (
    "id" TEXT NOT NULL,
    "venue_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sessions" INTEGER,
    "duration_days" INTEGER NOT NULL,
    "price" INTEGER NOT NULL,
    "perks" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "discount_pct" INTEGER,
    "is_best_choice" BOOLEAN NOT NULL DEFAULT false,
    "show_in_check_in" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "subscription_packages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "player_subscriptions" (
    "id" TEXT NOT NULL,
    "player_id" TEXT NOT NULL,
    "package_id" TEXT NOT NULL,
    "venue_id" TEXT NOT NULL,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'active',
    "sessions_remaining" INTEGER,
    "activated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "payment_ref" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "player_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscription_usages" (
    "id" TEXT NOT NULL,
    "subscription_id" TEXT NOT NULL,
    "checked_in_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscription_usages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_push_tokens" (
    "id" TEXT NOT NULL,
    "staff_id" TEXT NOT NULL,
    "venue_id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "platform" TEXT NOT NULL DEFAULT 'android',
    "device_id" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "staff_push_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "check_in_records" (
    "id" TEXT NOT NULL,
    "player_id" TEXT NOT NULL,
    "venue_id" TEXT NOT NULL,
    "checked_in_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "payment_id" TEXT,
    "source" TEXT NOT NULL,

    CONSTRAINT "check_in_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "billing_config" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "bank_bin" TEXT NOT NULL DEFAULT '',
    "bank_account" TEXT NOT NULL DEFAULT '',
    "bank_owner" TEXT NOT NULL DEFAULT '',
    "default_base_rate" INTEGER NOT NULL DEFAULT 5000,
    "default_sub_addon" INTEGER NOT NULL DEFAULT 1000,
    "default_sepay_addon" INTEGER NOT NULL DEFAULT 1000,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "payment_gateway" TEXT NOT NULL DEFAULT 'payos',

    CONSTRAINT "billing_config_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "venue_billing_rates" (
    "id" TEXT NOT NULL,
    "venue_id" TEXT NOT NULL,
    "base_rate_per_checkin" INTEGER NOT NULL DEFAULT 5000,
    "subscription_addon" INTEGER NOT NULL DEFAULT 1000,
    "sepay_addon" INTEGER NOT NULL DEFAULT 1000,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "is_free_base" BOOLEAN NOT NULL DEFAULT false,
    "is_free_sub_addon" BOOLEAN NOT NULL DEFAULT false,
    "is_free_sepay_addon" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "venue_billing_rates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "billing_invoices" (
    "id" TEXT NOT NULL,
    "venue_id" TEXT NOT NULL,
    "week_start_date" TIMESTAMP(3) NOT NULL,
    "week_end_date" TIMESTAMP(3) NOT NULL,
    "total_checkins" INTEGER NOT NULL DEFAULT 0,
    "subscription_checkins" INTEGER NOT NULL DEFAULT 0,
    "sepay_checkins" INTEGER NOT NULL DEFAULT 0,
    "base_amount" INTEGER NOT NULL DEFAULT 0,
    "subscription_amount" INTEGER NOT NULL DEFAULT 0,
    "sepay_amount" INTEGER NOT NULL DEFAULT 0,
    "total_amount" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "payment_ref" TEXT,
    "paid_at" TIMESTAMP(3),
    "confirmed_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "comment" TEXT,
    "paid_amount" INTEGER,
    "payos_order_code" TEXT,

    CONSTRAINT "billing_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "billing_line_items" (
    "id" TEXT NOT NULL,
    "invoice_id" TEXT NOT NULL,
    "check_in_record_id" TEXT NOT NULL,
    "player_id" TEXT NOT NULL,
    "checked_in_at" TIMESTAMP(3) NOT NULL,
    "base_rate" INTEGER NOT NULL,
    "subscription_addon" INTEGER NOT NULL DEFAULT 0,
    "sepay_addon" INTEGER NOT NULL DEFAULT 0,
    "line_total" INTEGER NOT NULL,

    CONSTRAINT "billing_line_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "player_custom_prices" (
    "id" TEXT NOT NULL,
    "player_id" TEXT NOT NULL,
    "staff_id" TEXT NOT NULL,
    "discount_type" TEXT NOT NULL,
    "custom_fee" INTEGER,
    "discount_pct" INTEGER,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "player_custom_prices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "player_sticker_photos" (
    "id" TEXT NOT NULL,
    "player_id" TEXT NOT NULL,
    "image_url" TEXT NOT NULL,
    "slot_index" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "player_sticker_photos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "player_sticker_results" (
    "id" TEXT NOT NULL,
    "player_id" TEXT NOT NULL,
    "image_url" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "model" TEXT NOT NULL DEFAULT 'gpt-image-1',
    "size" TEXT NOT NULL DEFAULT '1024x1024',
    "cost_usd" DECIMAL(6,4) NOT NULL DEFAULT 0.04,
    "generation_time_seconds" DECIMAL(6,2),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "player_sticker_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "player_sticker_packs" (
    "id" TEXT NOT NULL,
    "player_id" TEXT NOT NULL,
    "result_id" TEXT NOT NULL,
    "sticker_1_url" TEXT,
    "sticker_2_url" TEXT,
    "sticker_3_url" TEXT,
    "sticker_4_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "is_paid" BOOLEAN NOT NULL DEFAULT false,
    "paid_at" TIMESTAMP(3),
    "payment_code" TEXT,
    "payos_order_code" TEXT,
    "how_to_card_url" TEXT,

    CONSTRAINT "player_sticker_packs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sticker_payment_logs" (
    "id" TEXT NOT NULL,
    "payos_order_code" TEXT NOT NULL,
    "payment_code" TEXT NOT NULL,
    "transfer_amount" INTEGER NOT NULL,
    "content" TEXT NOT NULL DEFAULT '',
    "processed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sticker_payment_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sticker_sessions" (
    "id" TEXT NOT NULL,
    "player_id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sticker_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kiosk_settings" (
    "id" TEXT NOT NULL DEFAULT 'global',
    "sticker_price" INTEGER NOT NULL DEFAULT 30000,
    "bank_bin" TEXT NOT NULL DEFAULT '',
    "bank_account" TEXT NOT NULL DEFAULT '',
    "bank_owner_name" TEXT NOT NULL DEFAULT '',
    "updated_at" TIMESTAMP(3) NOT NULL,
    "chroma_tolerance" INTEGER NOT NULL DEFAULT 65,
    "feather_radius" DOUBLE PRECISION NOT NULL DEFAULT 0.8,

    CONSTRAINT "kiosk_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "signup_duplicate_logs" (
    "id" TEXT NOT NULL,
    "new_player_photo_path" TEXT,
    "new_player_name" TEXT,
    "new_player_phone" TEXT,
    "matched_player_id" TEXT NOT NULL,
    "similarity_score" DOUBLE PRECISION,
    "threshold" DOUBLE PRECISION,
    "aws_face_id" TEXT,
    "aws_detail" JSONB,
    "source" TEXT NOT NULL DEFAULT 'unknown',
    "venue_id" TEXT,
    "reviewed" BOOLEAN NOT NULL DEFAULT false,
    "reviewed_at" TIMESTAMP(3),
    "review_note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "signup_duplicate_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sticker_templates" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "male_prompt" TEXT NOT NULL,
    "female_prompt" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sticker_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sticker_job_queue" (
    "id" TEXT NOT NULL,
    "player_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sticker_job_queue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_auth_logs" (
    "id" TEXT NOT NULL,
    "staff_id" TEXT,
    "action" TEXT NOT NULL,
    "phone" TEXT,
    "ip_address" TEXT,
    "country" TEXT,
    "city" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "staff_auth_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "players_phone_key" ON "players"("phone");

-- CreateIndex
CREATE INDEX "players_registration_venue_id_idx" ON "players"("registration_venue_id");

-- CreateIndex
CREATE INDEX "player_app_auth_logs_player_id_created_at_idx" ON "player_app_auth_logs"("player_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "push_subscriptions_endpoint_key" ON "push_subscriptions"("endpoint");

-- CreateIndex
CREATE UNIQUE INDEX "staff_venue_assignments_staff_id_venue_id_key" ON "staff_venue_assignments"("staff_id", "venue_id");

-- CreateIndex
CREATE UNIQUE INDEX "staff_members_phone_key" ON "staff_members"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "staff_members_email_key" ON "staff_members"("email");

-- CreateIndex
CREATE UNIQUE INDEX "queue_entries_session_id_player_id_key" ON "queue_entries"("session_id", "player_id");

-- CreateIndex
CREATE UNIQUE INDEX "player_groups_session_id_code_key" ON "player_groups"("session_id", "code");

-- CreateIndex
CREATE INDEX "player_rankings_session_id_court_id_idx" ON "player_rankings"("session_id", "court_id");

-- CreateIndex
CREATE INDEX "player_rankings_session_id_court_id_created_at_idx" ON "player_rankings"("session_id", "court_id", "created_at");

-- CreateIndex
CREATE INDEX "staff_payments_week_start_idx" ON "staff_payments"("week_start");

-- CreateIndex
CREATE INDEX "staff_payments_staff_id_idx" ON "staff_payments"("staff_id");

-- CreateIndex
CREATE UNIQUE INDEX "staff_payments_staff_id_week_start_key" ON "staff_payments"("staff_id", "week_start");

-- CreateIndex
CREATE UNIQUE INDEX "membership_tiers_venue_id_sort_order_key" ON "membership_tiers"("venue_id", "sort_order");

-- CreateIndex
CREATE INDEX "memberships_venue_id_idx" ON "memberships"("venue_id");

-- CreateIndex
CREATE INDEX "memberships_tier_id_idx" ON "memberships"("tier_id");

-- CreateIndex
CREATE UNIQUE INDEX "memberships_player_id_venue_id_key" ON "memberships"("player_id", "venue_id");

-- CreateIndex
CREATE INDEX "membership_payments_membership_id_idx" ON "membership_payments"("membership_id");

-- CreateIndex
CREATE INDEX "membership_payments_status_idx" ON "membership_payments"("status");

-- CreateIndex
CREATE INDEX "court_blocks_venue_id_date_idx" ON "court_blocks"("venue_id", "date");

-- CreateIndex
CREATE INDEX "bookings_venue_id_date_idx" ON "bookings"("venue_id", "date");

-- CreateIndex
CREATE INDEX "bookings_player_id_idx" ON "bookings"("player_id");

-- CreateIndex
CREATE UNIQUE INDEX "bookings_court_id_date_start_time_key" ON "bookings"("court_id", "date", "start_time");

-- CreateIndex
CREATE INDEX "coach_packages_coach_id_idx" ON "coach_packages"("coach_id");

-- CreateIndex
CREATE INDEX "coach_packages_venue_id_idx" ON "coach_packages"("venue_id");

-- CreateIndex
CREATE INDEX "coach_lessons_venue_id_date_idx" ON "coach_lessons"("venue_id", "date");

-- CreateIndex
CREATE INDEX "coach_lessons_coach_id_date_idx" ON "coach_lessons"("coach_id", "date");

-- CreateIndex
CREATE INDEX "coach_lessons_player_id_idx" ON "coach_lessons"("player_id");

-- CreateIndex
CREATE INDEX "face_attempts_event_id_idx" ON "face_attempts"("event_id");

-- CreateIndex
CREATE INDEX "face_attempts_created_at_idx" ON "face_attempts"("created_at");

-- CreateIndex
CREATE INDEX "face_recognition_logs_venue_id_created_at_idx" ON "face_recognition_logs"("venue_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "pending_payments_payment_ref_key" ON "pending_payments"("payment_ref");

-- CreateIndex
CREATE INDEX "pending_payments_venue_id_status_idx" ON "pending_payments"("venue_id", "status");

-- CreateIndex
CREATE INDEX "pending_payments_session_id_idx" ON "pending_payments"("session_id");

-- CreateIndex
CREATE INDEX "pending_payments_payment_ref_idx" ON "pending_payments"("payment_ref");

-- CreateIndex
CREATE INDEX "check_in_players_venue_id_idx" ON "check_in_players"("venue_id");

-- CreateIndex
CREATE UNIQUE INDEX "check_in_players_phone_venue_id_key" ON "check_in_players"("phone", "venue_id");

-- CreateIndex
CREATE INDEX "subscription_packages_venue_id_is_active_idx" ON "subscription_packages"("venue_id", "is_active");

-- CreateIndex
CREATE INDEX "player_subscriptions_player_id_status_idx" ON "player_subscriptions"("player_id", "status");

-- CreateIndex
CREATE INDEX "player_subscriptions_venue_id_status_idx" ON "player_subscriptions"("venue_id", "status");

-- CreateIndex
CREATE INDEX "subscription_usages_subscription_id_idx" ON "subscription_usages"("subscription_id");

-- CreateIndex
CREATE INDEX "staff_push_tokens_venue_id_active_idx" ON "staff_push_tokens"("venue_id", "active");

-- CreateIndex
CREATE UNIQUE INDEX "staff_push_tokens_staff_id_token_key" ON "staff_push_tokens"("staff_id", "token");

-- CreateIndex
CREATE INDEX "check_in_records_venue_id_checked_in_at_idx" ON "check_in_records"("venue_id", "checked_in_at");

-- CreateIndex
CREATE INDEX "check_in_records_player_id_idx" ON "check_in_records"("player_id");

-- CreateIndex
CREATE UNIQUE INDEX "venue_billing_rates_venue_id_key" ON "venue_billing_rates"("venue_id");

-- CreateIndex
CREATE UNIQUE INDEX "billing_invoices_payment_ref_key" ON "billing_invoices"("payment_ref");

-- CreateIndex
CREATE UNIQUE INDEX "billing_invoices_payos_order_code_key" ON "billing_invoices"("payos_order_code");

-- CreateIndex
CREATE INDEX "billing_invoices_venue_id_status_idx" ON "billing_invoices"("venue_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "billing_invoices_venue_id_week_start_date_key" ON "billing_invoices"("venue_id", "week_start_date");

-- CreateIndex
CREATE INDEX "billing_line_items_invoice_id_idx" ON "billing_line_items"("invoice_id");

-- CreateIndex
CREATE UNIQUE INDEX "player_custom_prices_player_id_staff_id_key" ON "player_custom_prices"("player_id", "staff_id");

-- CreateIndex
CREATE UNIQUE INDEX "player_sticker_photos_player_id_slot_index_key" ON "player_sticker_photos"("player_id", "slot_index");

-- CreateIndex
CREATE INDEX "player_sticker_results_player_id_idx" ON "player_sticker_results"("player_id");

-- CreateIndex
CREATE UNIQUE INDEX "player_sticker_packs_payment_code_key" ON "player_sticker_packs"("payment_code");

-- CreateIndex
CREATE UNIQUE INDEX "player_sticker_packs_payos_order_code_key" ON "player_sticker_packs"("payos_order_code");

-- CreateIndex
CREATE INDEX "player_sticker_packs_player_id_idx" ON "player_sticker_packs"("player_id");

-- CreateIndex
CREATE UNIQUE INDEX "sticker_payment_logs_payos_order_code_key" ON "sticker_payment_logs"("payos_order_code");

-- CreateIndex
CREATE UNIQUE INDEX "sticker_sessions_token_key" ON "sticker_sessions"("token");

-- CreateIndex
CREATE INDEX "signup_duplicate_logs_created_at_idx" ON "signup_duplicate_logs"("created_at");

-- CreateIndex
CREATE INDEX "signup_duplicate_logs_matched_player_id_idx" ON "signup_duplicate_logs"("matched_player_id");

-- CreateIndex
CREATE INDEX "signup_duplicate_logs_venue_id_idx" ON "signup_duplicate_logs"("venue_id");

-- CreateIndex
CREATE INDEX "sticker_job_queue_status_created_at_idx" ON "sticker_job_queue"("status", "created_at");

-- CreateIndex
CREATE INDEX "staff_auth_logs_staff_id_idx" ON "staff_auth_logs"("staff_id");

-- CreateIndex
CREATE INDEX "staff_auth_logs_created_at_idx" ON "staff_auth_logs"("created_at");

-- AddForeignKey
ALTER TABLE "venues" ADD CONSTRAINT "venues_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "staff_members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "players" ADD CONSTRAINT "players_registration_venue_id_fkey" FOREIGN KEY ("registration_venue_id") REFERENCES "venues"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_app_auth_logs" ADD CONSTRAINT "player_app_auth_logs_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_venue_assignments" ADD CONSTRAINT "staff_venue_assignments_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "staff_members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_venue_assignments" ADD CONSTRAINT "staff_venue_assignments_venue_id_fkey" FOREIGN KEY ("venue_id") REFERENCES "venues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "courts" ADD CONSTRAINT "courts_venue_id_fkey" FOREIGN KEY ("venue_id") REFERENCES "venues"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "staff_members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_venue_id_fkey" FOREIGN KEY ("venue_id") REFERENCES "venues"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "queue_entries" ADD CONSTRAINT "queue_entries_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "player_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "queue_entries" ADD CONSTRAINT "queue_entries_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "queue_entries" ADD CONSTRAINT "queue_entries_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_groups" ADD CONSTRAINT "player_groups_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "court_assignments" ADD CONSTRAINT "court_assignments_court_id_fkey" FOREIGN KEY ("court_id") REFERENCES "courts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "court_assignments" ADD CONSTRAINT "court_assignments_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_rankings" ADD CONSTRAINT "player_rankings_court_id_fkey" FOREIGN KEY ("court_id") REFERENCES "courts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_rankings" ADD CONSTRAINT "player_rankings_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_rankings" ADD CONSTRAINT "player_rankings_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_rankings" ADD CONSTRAINT "player_rankings_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "staff_members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "staff_members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_venue_id_fkey" FOREIGN KEY ("venue_id") REFERENCES "venues"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_payments" ADD CONSTRAINT "staff_payments_paid_by_id_fkey" FOREIGN KEY ("paid_by_id") REFERENCES "staff_members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_payments" ADD CONSTRAINT "staff_payments_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "staff_members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership_tiers" ADD CONSTRAINT "membership_tiers_venue_id_fkey" FOREIGN KEY ("venue_id") REFERENCES "venues"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_tier_id_fkey" FOREIGN KEY ("tier_id") REFERENCES "membership_tiers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_venue_id_fkey" FOREIGN KEY ("venue_id") REFERENCES "venues"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership_payments" ADD CONSTRAINT "membership_payments_membership_id_fkey" FOREIGN KEY ("membership_id") REFERENCES "memberships"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "court_blocks" ADD CONSTRAINT "court_blocks_venue_id_fkey" FOREIGN KEY ("venue_id") REFERENCES "venues"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_court_id_fkey" FOREIGN KEY ("court_id") REFERENCES "courts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_venue_id_fkey" FOREIGN KEY ("venue_id") REFERENCES "venues"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coach_packages" ADD CONSTRAINT "coach_packages_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "staff_members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coach_packages" ADD CONSTRAINT "coach_packages_venue_id_fkey" FOREIGN KEY ("venue_id") REFERENCES "venues"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coach_lessons" ADD CONSTRAINT "coach_lessons_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "staff_members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coach_lessons" ADD CONSTRAINT "coach_lessons_court_id_fkey" FOREIGN KEY ("court_id") REFERENCES "courts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coach_lessons" ADD CONSTRAINT "coach_lessons_package_id_fkey" FOREIGN KEY ("package_id") REFERENCES "coach_packages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coach_lessons" ADD CONSTRAINT "coach_lessons_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coach_lessons" ADD CONSTRAINT "coach_lessons_venue_id_fkey" FOREIGN KEY ("venue_id") REFERENCES "venues"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "face_attempts" ADD CONSTRAINT "face_attempts_matched_player_id_fkey" FOREIGN KEY ("matched_player_id") REFERENCES "players"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "face_recognition_logs" ADD CONSTRAINT "face_recognition_logs_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "face_recognition_logs" ADD CONSTRAINT "face_recognition_logs_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "staff_members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "face_recognition_logs" ADD CONSTRAINT "face_recognition_logs_venue_id_fkey" FOREIGN KEY ("venue_id") REFERENCES "venues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pending_payments" ADD CONSTRAINT "pending_payments_check_in_player_id_fkey" FOREIGN KEY ("check_in_player_id") REFERENCES "check_in_players"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pending_payments" ADD CONSTRAINT "pending_payments_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pending_payments" ADD CONSTRAINT "pending_payments_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pending_payments" ADD CONSTRAINT "pending_payments_venue_id_fkey" FOREIGN KEY ("venue_id") REFERENCES "venues"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "check_in_players" ADD CONSTRAINT "check_in_players_venue_id_fkey" FOREIGN KEY ("venue_id") REFERENCES "venues"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_packages" ADD CONSTRAINT "subscription_packages_venue_id_fkey" FOREIGN KEY ("venue_id") REFERENCES "venues"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_subscriptions" ADD CONSTRAINT "player_subscriptions_package_id_fkey" FOREIGN KEY ("package_id") REFERENCES "subscription_packages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_subscriptions" ADD CONSTRAINT "player_subscriptions_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "check_in_players"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_usages" ADD CONSTRAINT "subscription_usages_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "player_subscriptions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_push_tokens" ADD CONSTRAINT "staff_push_tokens_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "staff_members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "check_in_records" ADD CONSTRAINT "check_in_records_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "check_in_players"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "check_in_records" ADD CONSTRAINT "check_in_records_venue_id_fkey" FOREIGN KEY ("venue_id") REFERENCES "venues"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "venue_billing_rates" ADD CONSTRAINT "venue_billing_rates_venue_id_fkey" FOREIGN KEY ("venue_id") REFERENCES "venues"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_invoices" ADD CONSTRAINT "billing_invoices_venue_id_fkey" FOREIGN KEY ("venue_id") REFERENCES "venues"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_line_items" ADD CONSTRAINT "billing_line_items_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "billing_invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_custom_prices" ADD CONSTRAINT "player_custom_prices_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_custom_prices" ADD CONSTRAINT "player_custom_prices_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "staff_members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_sticker_photos" ADD CONSTRAINT "player_sticker_photos_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_sticker_results" ADD CONSTRAINT "player_sticker_results_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_sticker_packs" ADD CONSTRAINT "player_sticker_packs_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_sticker_packs" ADD CONSTRAINT "player_sticker_packs_result_id_fkey" FOREIGN KEY ("result_id") REFERENCES "player_sticker_results"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sticker_sessions" ADD CONSTRAINT "sticker_sessions_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "signup_duplicate_logs" ADD CONSTRAINT "signup_duplicate_logs_matched_player_id_fkey" FOREIGN KEY ("matched_player_id") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "signup_duplicate_logs" ADD CONSTRAINT "signup_duplicate_logs_venue_id_fkey" FOREIGN KEY ("venue_id") REFERENCES "venues"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sticker_job_queue" ADD CONSTRAINT "sticker_job_queue_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_auth_logs" ADD CONSTRAINT "staff_auth_logs_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "staff_members"("id") ON DELETE SET NULL ON UPDATE CASCADE;


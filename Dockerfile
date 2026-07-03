FROM node:20-alpine AS base

FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# prisma/schema.prisma must exist before npm ci (postinstall runs prisma generate)
COPY prisma ./prisma
RUN npm ci

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
RUN npm run build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/dist/server.js ./server.js
COPY --from=builder /app/dist/mcp-handler.js ./mcp-handler.js
COPY --from=builder /app/dist/src ./src
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/sounds ./sounds
RUN mkdir -p /app/uploads/players /app/uploads/players/avatars /app/uploads/coaches/photos /app/uploads/proofs /app/uploads/manual-invoices /app/uploads/payment-proofs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
# Railway mounts a persistent volume at /app/uploads. The volume is owned by
# root, so the container runs as root to guarantee write access for face photos
# and avatars. Sub-dirs are created at startup in case the volume is fresh.
CMD ["sh", "-c", "for migration in 20260309044022_init 20260317152635_add_membership_booking_and_missing_fields 20260317234645_add_perks_to_membership_tier 20260318055501_add_membership_payments 20260318061146_add_payment_proof_url 20260318084037_add_session_type_and_court_blocks 20260318094950_add_open_play_competition_block_types 20260319041557_add_coach_booking_module 20260319071154_add_coach_lesson_payment_tracking 20260326120000_intro_warmup_complete 20260327073601_add_face_recognition_fields 20260327120000_remove_warmup_phase_data 20260327140000_player_face_photo_path 20260329120000_add_player_ranking 20260331060000_add_missing_schema_changes 20260413110047_add_avatar_photo_path 20260415040509_add_pending_payments_and_venue_bank_fields 20260416113000_courtpay_schema_backfill 20260417120000_add_staff_push_tokens 20260419080558_add_discount_pct_and_is_best_choice_to_subscription_packages 20260419120000_add_cancel_reason_to_pending_payments 20260419150000_add_billing_system 20260420000000_add_is_free_to_billing_rate 20260420100000_replace_is_free_with_three_flags 20260426120000_add_party_count_to_pending_payments 20260427140000_staff_venue_assignments_app_access 20260428130000_face_recognition_logs 20260429063000_add_group_paid_by_fields 20260429080000_add_player_is_walk_in 20260429101700_add_player_registration_context 20260504090000_add_confirmed_on_device 20260504120000_add_show_in_check_in 20260509120000_add_player_sticker_tables 20260509150000_add_player_sticker_packs 20260509180000_add_sticker_sessions 20260510120000_add_kiosk_settings_and_sticker_templates 20260512_multi_sticker_results 20260512_sticker_pack_payment 20260512080000_sticker_pack_payment 20260512090000_multi_sticker_results 20260512100000_drop_sticker_result_unique_idx 20260512110000_sepay_payment 20260513120000_sticker_job_queue 20260514080000_kiosk_settings_chroma 20260519020000_add_billing_payment_fields 20260524040000_add_staff_auth_logs 20260526040000_add_fingerprint_to_staff_auth_logs 20260609010000_add_manager_role_and_venue_owner 20260610000000_add_monthly_billing_model 20260611_add_monthly_subscription_fields 20260613000000_add_venue_contact_phone 20260613010000_add_missing_columns_for_portal 20260613020000_add_missing_tables 20260614000000_add_venue_contact_channels 20260614010000_rename_price_in_cents_to_price_value 20260614020000_add_open_play_registrations 20260614030000_add_missing_coach_columns 20260614040000_add_player_notes 20260615000000_add_venue_timezone 20260616000000_add_is_free_pass_to_subscription_package 20260616010000_add_player_identity 20260616020000_add_manual_billing_invoices 20260618000000_add_organization_sport_type_player_country 20260619000000_add_email_log 20260619010000_add_payment_rejection_fields 20260621000000_coach_lesson_booking_upgrade 20260621010000_add_google_event_id_to_coach_lesson 20260624000000_add_player_magic_tokens 20260625000000_add_proof_fields_to_manual_billing_invoice 20260625010000_add_notification_email_to_billing_config 20260630000000_coach_push_token_nullable_venue 20260701000000_coach_package_group_pricing 20260702000000_baseline_sync; do npx prisma migrate resolve --applied $migration 2>/dev/null || true; done && npx prisma migrate deploy && mkdir -p /app/uploads/players /app/uploads/players/avatars /app/uploads/coaches/photos /app/uploads/proofs /app/uploads/manual-invoices /app/uploads/payment-proofs && node server.js"]

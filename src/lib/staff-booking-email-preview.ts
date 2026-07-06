export type StaffBookingEmailMode = "court" | "open_play" | "lesson";

export interface StaffBookingEmailPreview {
  willSend: boolean;
  emailType: string | null;
  subjectHint: string | null;
  reason: string;
  apiRoute: string;
  recipient: string | null;
  recipients?: string[];
}

/**
 * Client-side preview of whether the staff booking modal will trigger a player email.
 * Mirrors server behaviour across all booking endpoints.
 */
export function previewStaffBookingEmail(opts: {
  mode: StaffBookingEmailMode;
  isCourtEditMode: boolean;
  isLessonEditMode: boolean;
  hasAdditionalCourts: boolean;
  playerEmail?: string | null;
}): StaffBookingEmailPreview {
  const recipient = opts.playerEmail?.trim() || null;

  // ── Court edit (reschedule) ───────────────────────────────────────────────
  if (opts.isCourtEditMode) {
    if (!recipient) {
      return {
        willSend: false,
        emailType: null,
        subjectHint: null,
        reason: "Player has no email — reschedule email skipped. Cancellation also skipped.",
        apiRoute: "PATCH /api/staff/bookings/:id",
        recipient: null,
      };
    }
    return {
      willSend: true,
      emailType: "staff_confirmed",
      subjectHint: "Your court booking is booked — payment pending",
      reason: "Saving a rescheduled booking sends the player an updated confirmation + pay link.",
      apiRoute: "PATCH /api/staff/bookings/:id",
      recipient,
    };
  }

  // ── Lesson edit (reschedule) ──────────────────────────────────────────────
  if (opts.isLessonEditMode) {
    if (!recipient) {
      return {
        willSend: false,
        emailType: null,
        subjectHint: null,
        reason: "Player has no email — reschedule/cancellation email skipped.",
        apiRoute: "PATCH /api/admin/coach-lessons/:id",
        recipient: null,
      };
    }
    return {
      willSend: true,
      emailType: "staff_confirmed",
      subjectHint: "Your coaching lesson is booked — payment pending",
      reason: "Saving a rescheduled lesson notifies player + coach. Cancelling notifies all three roles.",
      apiRoute: "PATCH /api/admin/coach-lessons/:id",
      recipient,
      recipients: ["player", "coach", "staff"],
    };
  }

  // ── New court booking ─────────────────────────────────────────────────────
  if (opts.mode === "court") {
    const apiRoute = opts.hasAdditionalCourts
      ? "POST /api/staff/bookings/batch"
      : "POST /api/staff/bookings";
    if (!recipient) {
      return {
        willSend: false,
        emailType: null,
        subjectHint: null,
        reason: "Player has no email on record — server skips sendBookingEmail.",
        apiRoute,
        recipient: null,
      };
    }
    return {
      willSend: true,
      emailType: "staff_confirmed",
      subjectHint: "Your court booking is booked — payment pending",
      reason: opts.hasAdditionalCourts
        ? "Multi-court batch booking emails the player a pay link for the first court."
        : "Single-court staff booking sets paymentStatus=pending and emails a pay link (/book/pay/:id).",
      apiRoute,
      recipient,
    };
  }

  // ── New open play registration ────────────────────────────────────────────
  if (opts.mode === "open_play") {
    if (!recipient) {
      return {
        willSend: false,
        emailType: null,
        subjectHint: null,
        reason: "Player has no email — registration confirmation email skipped.",
        apiRoute: "POST /api/admin/open-play/register",
        recipient: null,
      };
    }
    return {
      willSend: true,
      emailType: "staff_confirmed",
      subjectHint: "Your open play session is booked — payment pending",
      reason: "Staff open play registration emails the player a pay link (/book/open-play/pay/:id).",
      apiRoute: "POST /api/admin/open-play/register",
      recipient,
    };
  }

  // ── New lesson ────────────────────────────────────────────────────────────
  if (!recipient) {
    return {
      willSend: false,
      emailType: null,
      subjectHint: null,
      reason: "Player has no email — lesson creation email skipped (coach still notified if coach has email).",
      apiRoute: "POST /api/admin/coach-lessons",
      recipient: null,
      recipients: ["coach", "staff"],
    };
  }
  return {
    willSend: true,
    emailType: "staff_confirmed",
    subjectHint: "Your coaching lesson is booked — payment pending",
    reason: "Staff lesson creation notifies player, coach, and venue staff email.",
    apiRoute: "POST /api/admin/coach-lessons",
    recipient,
    recipients: ["player", "coach", "staff"],
  };
}

import { prisma } from "../db";
import { getResendClient } from "./client";
import { createMagicLoginToken } from "../player-magic-link";

const FROM = "noreply_bookings@thecourtflow.com";

type BookingType = "court" | "open_play" | "coach";
type EmailType = "pending" | "approved" | "rejected" | "cancelled" | "auto_confirmed" | "staff_confirmed";
type RecipientRole = "student" | "coach" | "staff";

export interface VenueContactInfo {
  location?: string | null;
  contactPhone?: string | null;
  contactWhatsApp?: string | null;
  contactZalo?: string | null;
  contactLine?: string | null;
}

export interface SendBookingEmailParams {
  to: string;
  playerName: string;
  bookingType: BookingType;
  emailType: EmailType;
  recipientRole?: RecipientRole;
  /** When set, venue contact fields are loaded for player emails. */
  venueId?: string;
  details: {
    venueName?: string;
    courtName?: string;
    venueContact?: VenueContactInfo;
    date?: string;
    time?: string;
    amount?: number;
    rejectionReason?: string;
    coachName?: string;
    studentName?: string;
    approvedBy?: string;
    paymentRef?: string;
    /** ISO strings used to generate Add-to-Calendar links */
    startTimeISO?: string;
    endTimeISO?: string;
    /** Payment link for staff-created bookings pending payment */
    paymentUrl?: string;
    /** Invoice reference shown after payment is confirmed */
    invoiceNumber?: string;
    /** Magic-link URL to download the invoice PDF */
    invoiceUrl?: string;
  };
}

function bookingLabel(bookingType: BookingType): string {
  switch (bookingType) {
    case "court": return "court booking";
    case "open_play": return "open play session";
    case "coach": return "coaching lesson";
  }
}

const VENUE_CONTACT_SELECT = {
  location: true,
  contactPhone: true,
  contactWhatsApp: true,
  contactZalo: true,
  contactLine: true,
} as const;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function digitsOnly(value: string): string {
  return value.replace(/[^0-9]/g, "");
}

function lineHref(value: string): string {
  if (value.startsWith("http")) return value;
  if (value.startsWith("@")) return `https://line.me/R/ti/p/${value}`;
  return `https://line.me/ti/p/~${value.replace(/^~/, "")}`;
}

function hasVenueContact(contact?: VenueContactInfo): boolean {
  if (!contact) return false;
  return !!(
    contact.location?.trim() ||
    contact.contactPhone?.trim() ||
    contact.contactWhatsApp?.trim() ||
    contact.contactZalo?.trim() ||
    contact.contactLine?.trim()
  );
}

function buildVenueContactBlock(contact?: VenueContactInfo): string {
  if (!hasVenueContact(contact)) return "";

  const rows: string[] = [];
  if (contact?.location?.trim()) {
    rows.push(
      `<p style="margin:0 0 6px 0;font-size:13px;color:#374151;"><strong>Location:</strong> ${escapeHtml(contact.location.trim())}</p>`
    );
  }
  if (contact?.contactPhone?.trim()) {
    const phone = contact.contactPhone.trim();
    rows.push(
      `<p style="margin:0 0 6px 0;font-size:13px;color:#374151;"><strong>Phone:</strong> <a href="tel:${escapeHtml(phone)}" style="color:#7c3aed;text-decoration:none;">${escapeHtml(phone)}</a></p>`
    );
  }
  if (contact?.contactWhatsApp?.trim()) {
    const whatsapp = contact.contactWhatsApp.trim();
    rows.push(
      `<p style="margin:0 0 6px 0;font-size:13px;color:#374151;"><strong>WhatsApp:</strong> <a href="https://wa.me/${digitsOnly(whatsapp)}" style="color:#7c3aed;text-decoration:none;">${escapeHtml(whatsapp)}</a></p>`
    );
  }
  if (contact?.contactZalo?.trim()) {
    const zalo = contact.contactZalo.trim();
    rows.push(
      `<p style="margin:0 0 6px 0;font-size:13px;color:#374151;"><strong>Zalo:</strong> <a href="https://zalo.me/${digitsOnly(zalo)}" style="color:#7c3aed;text-decoration:none;">${escapeHtml(zalo)}</a></p>`
    );
  }
  if (contact?.contactLine?.trim()) {
    const line = contact.contactLine.trim();
    rows.push(
      `<p style="margin:0 0 6px 0;font-size:13px;color:#374151;"><strong>Line:</strong> <a href="${escapeHtml(lineHref(line))}" style="color:#7c3aed;text-decoration:none;">${escapeHtml(line)}</a></p>`
    );
  }

  return `
<div style="margin-bottom:16px;">
  <p style="margin:0 0 10px 0;font-size:13px;font-weight:600;color:#111827;">Venue contact</p>
  ${rows.join("\n")}
</div>`.trim();
}

function emailFooter(
  venueName: string | undefined,
  venueContact: VenueContactInfo | undefined,
  includeContact: boolean
): string {
  const contactBlock = includeContact ? buildVenueContactBlock(venueContact) : "";
  const venueBlock = venueName
    ? `<p style="margin:0 0 4px 0;font-weight:600;">${escapeHtml(venueName)}</p>`
    : "";
  return `
<p style="margin-top:32px;border-top:1px solid #e5e7eb;padding-top:16px;font-size:13px;color:#6b7280;">
  ${contactBlock}
  ${venueBlock}
  <span>Powered by <a href="https://www.thecourtflow.com/" target="_blank" style="color:#7c3aed;text-decoration:none;font-weight:600;">CourtPass</a></span>
</p>`.trim();
}

async function resolveVenueContact(
  venueId?: string,
  existing?: VenueContactInfo
): Promise<VenueContactInfo | undefined> {
  if (hasVenueContact(existing)) return existing;
  if (!venueId) return undefined;

  const venue = await prisma.venue.findUnique({
    where: { id: venueId },
    select: VENUE_CONTACT_SELECT,
  });
  if (!venue || !hasVenueContact(venue)) return undefined;
  return venue;
}

function buildEmail(params: SendBookingEmailParams): { subject: string; html: string } {
  const { playerName, bookingType, emailType, details, recipientRole = "student" } = params;
  const label = bookingLabel(bookingType);
  const refPrefix = details.paymentRef ? `[${details.paymentRef}] ` : "";
  const venueLine = details.venueName ? `<p><strong>Venue:</strong> ${details.venueName}</p>` : "";
  const courtLine =
    bookingType === "court" && details.courtName
      ? `<p><strong>Court:</strong> ${details.courtName}</p>`
      : "";
  const dateLine = details.date ? `<p><strong>Date:</strong> ${details.date}</p>` : "";
  const timeLine = details.time ? `<p><strong>Time:</strong> ${details.time}</p>` : "";
  const amountLine = details.amount !== undefined
    ? `<p><strong>Amount:</strong> ${details.amount.toLocaleString()} VND</p>`
    : "";
  const invoiceLine = details.invoiceNumber
    ? `<p><strong>Invoice:</strong> ${escapeHtml(details.invoiceNumber)}</p>`
    : "";
  const coachLine = details.coachName ? `<p><strong>Coach:</strong> ${details.coachName}</p>` : "";
  const studentLine = details.studentName ? `<p><strong>Student:</strong> ${details.studentName}</p>` : "";
  const approvedByLine = details.approvedBy ? `<p><strong>Approved by:</strong> ${details.approvedBy}</p>` : "";
  const detailsBlock = [venueLine, courtLine, dateLine, timeLine, amountLine, invoiceLine, coachLine, studentLine, approvedByLine].filter(Boolean).join("\n");
  const paymentHoldNotice = (() => {
    if (emailType !== "staff_confirmed" || recipientRole !== "student") return "";
    if (bookingType === "court") {
      return `<p style="margin-top:16px;padding:12px 16px;background:#fef3c7;border-left:4px solid #f59e0b;border-radius:4px;font-size:14px;color:#92400e;"><strong>⚠ Important:</strong> Your booking is on hold for one hour. Please make sure to pay within this timeframe or your booking may be cancelled automatically.</p>`;
    }
    if (bookingType === "open_play") {
      return `<p style="margin-top:16px;padding:12px 16px;background:#fef3c7;border-left:4px solid #f59e0b;border-radius:4px;font-size:14px;color:#92400e;"><strong>⚠ Important:</strong> Your booking is on hold for 5 minutes. Please make sure to pay within this timeframe or your booking may be cancelled automatically.</p>`;
    }
    return "";
  })();

  const footer = emailFooter(
    details.venueName,
    details.venueContact,
    recipientRole === "student"
  );

  const invoiceDownloadButton =
    bookingType === "court" &&
    recipientRole === "student" &&
    details.invoiceUrl &&
    (emailType === "approved" || emailType === "auto_confirmed")
      ? `
<table width="100%" cellpadding="0" cellspacing="0" style="margin-top:24px;">
  <tr>
    <td align="center">
      <a href="${details.invoiceUrl}"
         style="display:inline-block;background:#059669;color:#fff;font-size:15px;font-weight:700;
                padding:14px 32px;border-radius:10px;text-decoration:none;letter-spacing:0.01em;">
        Download invoice
      </a>
    </td>
  </tr>
</table>`
      : "";

  // Add-to-Calendar links (only for student/coach on confirmed events)
  const calendarButtons = (() => {
    if (recipientRole === "staff") return "";
    if (!details.startTimeISO || !details.endTimeISO) return "";

    const start = new Date(details.startTimeISO);
    const end = new Date(details.endTimeISO);

    // Google Calendar: https://calendar.google.com/calendar/render?action=TEMPLATE&...
    const fmt = (d: Date) =>
      d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
    const eventTitle = encodeURIComponent(
      recipientRole === "coach"
        ? `Coaching lesson — ${details.studentName ?? playerName}`
        : `Coaching lesson — ${details.coachName ?? "Coach"}`
    );
    const location = encodeURIComponent(details.venueName ?? "");
    const googleUrl =
      `https://calendar.google.com/calendar/render?action=TEMPLATE` +
      `&text=${eventTitle}` +
      `&dates=${fmt(start)}/${fmt(end)}` +
      (location ? `&location=${location}` : "") +
      `&details=${encodeURIComponent(`Booking ref: ${details.paymentRef ?? ""}`)}`;

    // Apple / iCal: serve an .ics file from our own API
    const icsUrl =
      `${process.env.APP_URL ?? ""}/api/public/calendar/ics` +
      `?title=${eventTitle}` +
      `&start=${encodeURIComponent(details.startTimeISO)}` +
      `&end=${encodeURIComponent(details.endTimeISO)}` +
      (location ? `&location=${location}` : "") +
      `&ref=${encodeURIComponent(details.paymentRef ?? "")}`;

    return `
<table width="100%" cellpadding="0" cellspacing="0" style="margin-top:20px;">
  <tr>
    <td align="center">
      <p style="font-size:13px;color:#6b7280;margin-bottom:10px;">Add this lesson to your calendar:</p>
      <table cellpadding="0" cellspacing="0">
        <tr>
          <td style="padding-right:8px;">
            <a href="${googleUrl}" target="_blank"
               style="display:inline-block;background:#4285F4;color:#fff;font-size:13px;font-weight:600;
                      padding:10px 18px;border-radius:8px;text-decoration:none;">
              📅 Google Calendar
            </a>
          </td>
          <td>
            <a href="${icsUrl}" target="_blank"
               style="display:inline-block;background:#1C1C1E;color:#fff;font-size:13px;font-weight:600;
                      padding:10px 18px;border-radius:8px;text-decoration:none;">
               Apple Calendar
            </a>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>`;
  })();

  // Role-specific greeting
  const greeting = recipientRole === "student"
    ? `Hi ${playerName},`
    : recipientRole === "coach"
    ? `Hi Coach ${playerName},`
    : `Staff notification for ${details.studentName ?? playerName}`;

  switch (emailType) {
    case "pending":
      if (recipientRole === "student") {
        return {
          subject: `${refPrefix}Payment proof received — your ${label} is pending review`,
          html: `<p>${greeting}</p><p>We have received your payment proof for your <strong>${label}</strong> and it is currently being reviewed by our team.</p>${detailsBlock}<p>We will notify you once the payment has been approved. This usually takes less than 24 hours.</p>${footer}`,
        };
      }
      if (recipientRole === "coach") {
        return {
          subject: `${refPrefix}New lesson booking pending — ${details.studentName ?? playerName}`,
          html: `<p>${greeting}</p><p>A student has submitted a booking and payment proof for a <strong>${label}</strong>. The booking is pending staff approval.</p>${detailsBlock}<p>You will be notified once the booking is confirmed.</p>${footer}`,
        };
      }
      return {
        subject: `${refPrefix}[Action required] New ${label} pending approval`,
        html: `<p>${greeting}</p><p>A new <strong>${label}</strong> has been submitted with a payment proof and is awaiting your approval.</p>${detailsBlock}<p>Please review and approve or reject it in the admin panel.</p>${footer}`,
      };

    case "approved":
      if (recipientRole === "student") {
        return {
          subject: `${refPrefix}Payment approved — your ${label} is confirmed`,
          html: `<p>${greeting}</p><p>Great news! Your payment for your <strong>${label}</strong> has been approved and your booking is confirmed.</p>${detailsBlock}${invoiceDownloadButton}${calendarButtons}<p style="margin-top:20px;">We look forward to seeing you on the court!</p>${footer}`,
        };
      }
      if (recipientRole === "coach") {
        return {
          subject: `${refPrefix}Lesson confirmed — ${details.studentName ?? playerName}`,
          html: `<p>${greeting}</p><p>A <strong>${label}</strong> with your student has been confirmed.</p>${detailsBlock}${calendarButtons}${footer}`,
        };
      }
      return {
        subject: `${refPrefix}[Confirmed] ${label} approved`,
        html: `<p>${greeting}</p><p>The <strong>${label}</strong> has been approved and confirmed.</p>${detailsBlock}${footer}`,
      };

    case "rejected": {
      const reasonLine = details.rejectionReason
        ? `<p><strong>Reason:</strong> ${details.rejectionReason}</p>`
        : "";
      if (recipientRole === "student") {
        return {
          subject: `${refPrefix}Payment proof rejected — action required for your ${label}`,
          html: `<p>${greeting}</p><p>Unfortunately, the payment proof you submitted for your <strong>${label}</strong> could not be verified.</p>${detailsBlock}${reasonLine}<p>Please contact the venue directly or submit a new payment proof to complete your booking.</p>${footer}`,
        };
      }
      if (recipientRole === "coach") {
        return {
          subject: `${refPrefix}Lesson booking rejected — ${details.studentName ?? playerName}`,
          html: `<p>${greeting}</p><p>A <strong>${label}</strong> booking was rejected by staff.</p>${detailsBlock}${reasonLine}${footer}`,
        };
      }
      return {
        subject: `${refPrefix}[Rejected] ${label} rejected`,
        html: `<p>${greeting}</p><p>The <strong>${label}</strong> booking was rejected.</p>${detailsBlock}${reasonLine}${footer}`,
      };
    }

    case "cancelled":
      if (recipientRole === "student") {
        return {
          subject: `${refPrefix}Your ${label} has been cancelled`,
          html: `<p>${greeting}</p><p>Your <strong>${label}</strong> has been cancelled.</p>${detailsBlock}<p>If you did not request this cancellation or believe this is an error, please contact the venue directly.</p>${footer}`,
        };
      }
      if (recipientRole === "coach") {
        return {
          subject: `${refPrefix}Lesson cancelled — ${details.studentName ?? playerName}`,
          html: `<p>${greeting}</p><p>A <strong>${label}</strong> booking has been cancelled.</p>${detailsBlock}${footer}`,
      };
      }
      return {
        subject: `${refPrefix}[Cancelled] ${label} cancelled`,
        html: `<p>${greeting}</p><p>A <strong>${label}</strong> booking has been cancelled.</p>${detailsBlock}${footer}`,
      };

    case "auto_confirmed":
      if (recipientRole === "student") {
        return {
          subject: `${refPrefix}Payment confirmed — your ${label} is booked`,
          html: `<p>${greeting}</p><p>Your payment has been automatically confirmed and your <strong>${label}</strong> is now booked.</p>${detailsBlock}${invoiceDownloadButton}${calendarButtons}<p style="margin-top:20px;">We look forward to seeing you on the court!</p>${footer}`,
        };
      }
      if (recipientRole === "coach") {
        return {
          subject: `${refPrefix}Lesson auto-confirmed — ${details.studentName ?? playerName}`,
          html: `<p>${greeting}</p><p>A <strong>${label}</strong> with your student has been automatically confirmed via Sepay.</p>${detailsBlock}${calendarButtons}${footer}`,
        };
      }
      return {
        subject: `${refPrefix}[Auto-confirmed] ${label} confirmed via Sepay`,
        html: `<p>${greeting}</p><p>A <strong>${label}</strong> was automatically confirmed via Sepay payment.</p>${detailsBlock}${footer}`,
      };

    case "staff_confirmed": {
      const payButton = details.paymentUrl
        ? `
<table width="100%" cellpadding="0" cellspacing="0" style="margin-top:24px;">
  <tr>
    <td align="center">
      <a href="${details.paymentUrl}"
         style="display:inline-block;background:#7c3aed;color:#fff;font-size:15px;font-weight:700;
                padding:14px 32px;border-radius:10px;text-decoration:none;letter-spacing:0.01em;">
        Pay now
      </a>
      <p style="margin-top:10px;font-size:12px;color:#6b7280;">Payment is required to confirm your spot.</p>
    </td>
  </tr>
</table>`
        : "";
      if (recipientRole === "coach") {
        return {
          subject: `${refPrefix}New lesson booked — ${details.studentName ?? playerName}`,
          html: `<p>${greeting}</p><p>A <strong>${label}</strong> has been booked for you by a staff member.</p>${detailsBlock}${calendarButtons}<p style="margin-top:20px;">The student will be notified to complete payment.</p>${footer}`,
        };
      }
      if (recipientRole === "staff") {
        return {
          subject: `${refPrefix}[New booking] ${label} created — ${details.studentName ?? playerName}`,
          html: `<p>${greeting}</p><p>A <strong>${label}</strong> has been created by a staff member.</p>${detailsBlock}<p>The player has been notified to complete payment.</p>${footer}`,
        };
      }
      return {
        subject: `${refPrefix}Your ${label} is booked — payment pending`,
        html: `<p>${greeting}</p><p>A staff member has created a <strong>${label}</strong> for you. Your spot is reserved and payment is pending.</p>${detailsBlock}${paymentHoldNotice}${payButton}<p style="margin-top:24px;">If you have any questions, please contact the venue directly.</p>${footer}`,
      };
    }
  }
}

/**
 * Wraps a payment URL in a magic login link for the given player.
 *
 * When the player clicks "Pay now" in a booking email they are automatically
 * signed in and land directly on the payment page — no login step needed.
 * Falls back to the bare paymentUrl if the player has no account or token
 * creation fails (so the email is always sent).
 *
 * @param playerId   Prisma Player.id
 * @param paymentUrl Absolute payment URL (e.g. https://…/book/pay/:id)
 */
export async function wrapPaymentUrlWithMagicLogin(
  playerId: string,
  paymentUrl: string
): Promise<string> {
  try {
    // Extract the path portion so it is embedded in the JWT, not the full URL.
    // The magic-link handler redirects to this path after writing the session token.
    const url = new URL(paymentUrl);
    const redirectTo = url.pathname + url.search;
    const { url: magicUrl } = await createMagicLoginToken(playerId, redirectTo);
    return magicUrl;
  } catch (err) {
    console.warn("[wrapPaymentUrlWithMagicLogin] Failed to create magic token — using bare URL:", err);
    return paymentUrl;
  }
}

export async function sendBookingEmail(params: SendBookingEmailParams): Promise<void> {
  if (!params.to) {
    console.warn("[sendBookingEmail] No email address provided — skipping");
    return;
  }
  try {
    const recipientRole = params.recipientRole ?? "student";
    const venueContact =
      recipientRole === "student"
        ? await resolveVenueContact(params.venueId, params.details.venueContact)
        : undefined;

    const resend = getResendClient();
    const { subject, html } = buildEmail({
      ...params,
      recipientRole,
      details: {
        ...params.details,
        ...(venueContact ? { venueContact } : {}),
      },
    });
    const result = await resend.emails.send({
      from: FROM,
      to: params.to,
      subject,
      html,
    });
    if (result.error) {
      console.error(`[sendBookingEmail] Resend rejected to=${params.to} subject="${subject}":`, result.error);
    } else {
      console.log(`[sendBookingEmail] Sent to=${params.to} id=${result.data?.id} subject="${subject}"`);
    }
  } catch (err) {
    console.error("[sendBookingEmail] Failed to send email:", err);
  }
}

export interface LessonEmailContext {
  lessonId: string;
  venueId: string;
  coachId: string;
  studentPlayerId: string;
  studentEmail: string | null;
  studentName: string;
  coachEmail: string | null;
  coachName: string;
  staffEmail: string | null;
  details: SendBookingEmailParams["details"];
}

export type LessonEmailOptions = {
  approvedBy?: string;
};

/**
 * Fire lesson notification emails to all three roles (student, coach, staff) in parallel.
 * Logs each send to EmailLog with the correct recipientRole.
 * Non-fatal: errors are logged but never thrown.
 */
export async function sendLessonEventEmails(
  ctx: LessonEmailContext,
  emailType: EmailType
): Promise<void> {
  const roles: { role: RecipientRole; email: string | null; name: string }[] = [
    { role: "student", email: ctx.studentEmail, name: ctx.studentName },
    { role: "coach", email: ctx.coachEmail, name: ctx.coachName },
    { role: "staff", email: ctx.staffEmail, name: "Staff" },
  ];

  // Send sequentially with a 600ms gap to stay within Resend's 2 req/s free-plan limit
  for (const { role, email, name } of roles) {
    if (!email) continue;

    await sendBookingEmail({
      to: email,
      playerName: name,
      bookingType: "coach",
      emailType,
      recipientRole: role,
      venueId: ctx.venueId,
      details: {
        ...ctx.details,
        studentName: ctx.studentName,
        coachName: ctx.coachName,
      },
    });

    try {
      await prisma.emailLog.create({
        data: {
          playerId: ctx.studentPlayerId,
          bookingType: "coach",
          bookingId: ctx.lessonId,
          emailType,
          recipientRole: role,
          status: "sent",
        },
      });
    } catch (logErr) {
      console.error("[sendLessonEventEmails] Failed to write EmailLog:", logErr);
    }

    // 600ms gap avoids Resend 429 on free plan (limit: 2 req/s)
    await new Promise((r) => setTimeout(r, 600));
  }
}

/**
 * Build a LessonEmailContext by loading lesson + player + coach + venue from DB.
 * Returns null if the lesson doesn't exist.
 */
export async function buildLessonEmailContext(
  lessonId: string,
  options?: LessonEmailOptions
): Promise<LessonEmailContext | null> {
  const lesson = await prisma.coachLesson.findUnique({
    where: { id: lessonId },
    include: {
      player: { select: { id: true, name: true, email: true } },
      coach: { select: { id: true, name: true, email: true } },
      venue: { select: { id: true, name: true, settings: true } },
    },
  });

  if (!lesson) return null;

  const venueSettings = (lesson.venue.settings ?? {}) as Record<string, unknown>;
  const staffEmail = (venueSettings.notificationEmail as string | undefined) ?? null;

  console.log(
    `[lessonEmail] lesson=${lessonId} student="${lesson.player.name}" studentEmail=${lesson.player.email ?? "NONE"} ` +
    `coachEmail=${lesson.coach.email ?? "NONE"} staffEmail=${staffEmail ?? "NONE"}`
  );

  return {
    lessonId: lesson.id,
    venueId: lesson.venue.id,
    coachId: lesson.coach.id,
    studentPlayerId: lesson.player.id,
    studentEmail: lesson.player.email ?? null,
    studentName: lesson.player.name,
    coachEmail: lesson.coach.email ?? null,
    coachName: lesson.coach.name,
    staffEmail,
    details: {
      venueName: lesson.venue.name,
      date: lesson.date.toLocaleDateString(),
      time: `${lesson.startTime.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} – ${lesson.endTime.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`,
      amount: lesson.priceValue,
      startTimeISO: lesson.startTime.toISOString(),
      endTimeISO: lesson.endTime.toISOString(),
      ...(lesson.paymentRef ? { paymentRef: lesson.paymentRef } : {}),
      ...(options?.approvedBy ? { approvedBy: options.approvedBy } : {}),
    },
  };
}

export interface BillingProofNotificationParams {
  to: string;
  venueName: string;
  invoiceAmount: number;
  proofMethod: string;
  proofRef?: string | null;
  paidAt: string;
  proofUrl?: string;
  adminUrl: string;
}

export async function sendBillingProofNotification(
  params: BillingProofNotificationParams
): Promise<void> {
  if (!params.to) {
    console.warn("[sendBillingProofNotification] No email address — skipping");
    return;
  }
  try {
    const resend = getResendClient();
    const formattedAmount = new Intl.NumberFormat("vi-VN").format(params.invoiceAmount);
    const methodLabel = params.proofMethod.replace(/_/g, " ");

    const html = `
      <div style="font-family:sans-serif;max-width:520px;margin:0 auto;color:#111">
        <h2 style="color:#7c3aed">Payment Proof Submitted</h2>
        <p>A venue has submitted payment proof for a CourtFlow invoice. Please review and approve or reject it.</p>
        <table style="border-collapse:collapse;width:100%;margin:16px 0">
          <tr>
            <td style="padding:8px 12px;background:#f5f5f5;font-weight:600;width:40%">Venue</td>
            <td style="padding:8px 12px;background:#fafafa">${params.venueName}</td>
          </tr>
          <tr>
            <td style="padding:8px 12px;background:#f5f5f5;font-weight:600">Amount</td>
            <td style="padding:8px 12px;background:#fafafa">${formattedAmount} VND</td>
          </tr>
          <tr>
            <td style="padding:8px 12px;background:#f5f5f5;font-weight:600">Payment date</td>
            <td style="padding:8px 12px;background:#fafafa">${new Date(params.paidAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}</td>
          </tr>
          <tr>
            <td style="padding:8px 12px;background:#f5f5f5;font-weight:600">Method</td>
            <td style="padding:8px 12px;background:#fafafa;text-transform:capitalize">${methodLabel}</td>
          </tr>
          ${params.proofRef ? `<tr><td style="padding:8px 12px;background:#f5f5f5;font-weight:600">Reference</td><td style="padding:8px 12px;background:#fafafa">${params.proofRef}</td></tr>` : ""}
        </table>
        <p style="margin-top:20px">
          ${params.proofUrl ? `<a href="${params.proofUrl}" style="display:inline-block;padding:10px 20px;background:#e5e7eb;color:#111;text-decoration:none;border-radius:6px;font-weight:600;margin-right:12px">View Proof</a>` : ""}
          <a href="${params.adminUrl}" style="display:inline-block;padding:10px 20px;background:#7c3aed;color:#fff;text-decoration:none;border-radius:6px;font-weight:600">Review in Admin</a>
        </p>
        <p style="margin-top:32px;border-top:1px solid #e5e7eb;padding-top:16px;font-size:13px;color:#6b7280;">
          ${params.venueName}<br/>
          Powered by <a href="https://www.thecourtflow.com/" target="_blank" style="color:#7c3aed;text-decoration:none;font-weight:600;">CourtPass</a>
        </p>
      </div>
    `;

    await resend.emails.send({
      from: FROM,
      to: params.to,
      subject: `[CourtFlow] Payment proof submitted — ${params.venueName} · ${formattedAmount} VND`,
      html,
    });
  } catch (err) {
    console.error("[sendBillingProofNotification] Failed:", err);
  }
}

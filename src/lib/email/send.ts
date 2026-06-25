import { prisma } from "../db";
import { getResendClient } from "./client";

const FROM = "noreply_bookings@thecourtflow.com";

type BookingType = "court" | "open_play" | "coach";
type EmailType = "pending" | "approved" | "rejected" | "cancelled" | "auto_confirmed";
type RecipientRole = "student" | "coach" | "staff";

export interface SendBookingEmailParams {
  to: string;
  playerName: string;
  bookingType: BookingType;
  emailType: EmailType;
  recipientRole?: RecipientRole;
  details: {
    venueName?: string;
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
  };
}

function bookingLabel(bookingType: BookingType): string {
  switch (bookingType) {
    case "court": return "court booking";
    case "open_play": return "open play session";
    case "coach": return "coaching lesson";
  }
}

function buildEmail(params: SendBookingEmailParams): { subject: string; html: string } {
  const { playerName, bookingType, emailType, details, recipientRole = "student" } = params;
  const label = bookingLabel(bookingType);
  const refPrefix = details.paymentRef ? `[${details.paymentRef}] ` : "";
  const venueLine = details.venueName ? `<p><strong>Venue:</strong> ${details.venueName}</p>` : "";
  const dateLine = details.date ? `<p><strong>Date:</strong> ${details.date}</p>` : "";
  const timeLine = details.time ? `<p><strong>Time:</strong> ${details.time}</p>` : "";
  const amountLine = details.amount !== undefined
    ? `<p><strong>Amount:</strong> ${details.amount.toLocaleString()} VND</p>`
    : "";
  const coachLine = details.coachName ? `<p><strong>Coach:</strong> ${details.coachName}</p>` : "";
  const studentLine = details.studentName ? `<p><strong>Student:</strong> ${details.studentName}</p>` : "";
  const approvedByLine = details.approvedBy ? `<p><strong>Approved by:</strong> ${details.approvedBy}</p>` : "";
  const detailsBlock = [venueLine, dateLine, timeLine, amountLine, coachLine, studentLine, approvedByLine].filter(Boolean).join("\n");

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
          html: `<p>${greeting}</p><p>We have received your payment proof for your <strong>${label}</strong> and it is currently being reviewed by our team.</p>${detailsBlock}<p>We will notify you once the payment has been approved. This usually takes less than 24 hours.</p><p>Thank you,<br/>The CourtFlow Team</p>`,
        };
      }
      if (recipientRole === "coach") {
        return {
          subject: `${refPrefix}New lesson booking pending — ${details.studentName ?? playerName}`,
          html: `<p>${greeting}</p><p>A student has submitted a booking and payment proof for a <strong>${label}</strong>. The booking is pending staff approval.</p>${detailsBlock}<p>You will be notified once the booking is confirmed.</p><p>CourtFlow</p>`,
        };
      }
      return {
        subject: `${refPrefix}[Action required] New ${label} pending approval`,
        html: `<p>${greeting}</p><p>A new <strong>${label}</strong> has been submitted with a payment proof and is awaiting your approval.</p>${detailsBlock}<p>Please review and approve or reject it in the admin panel.</p><p>CourtFlow</p>`,
      };

    case "approved":
      if (recipientRole === "student") {
        return {
          subject: `${refPrefix}Payment approved — your ${label} is confirmed`,
          html: `<p>${greeting}</p><p>Great news! Your payment for your <strong>${label}</strong> has been approved and your booking is confirmed.</p>${detailsBlock}${calendarButtons}<p style="margin-top:20px;">We look forward to seeing you on the court!</p><p>Thank you,<br/>The CourtFlow Team</p>`,
        };
      }
      if (recipientRole === "coach") {
        return {
          subject: `${refPrefix}Lesson confirmed — ${details.studentName ?? playerName}`,
          html: `<p>${greeting}</p><p>A <strong>${label}</strong> with your student has been confirmed.</p>${detailsBlock}${calendarButtons}<p>CourtFlow</p>`,
        };
      }
      return {
        subject: `${refPrefix}[Confirmed] ${label} approved`,
        html: `<p>${greeting}</p><p>The <strong>${label}</strong> has been approved and confirmed.</p>${detailsBlock}<p>CourtFlow</p>`,
      };

    case "rejected": {
      const reasonLine = details.rejectionReason
        ? `<p><strong>Reason:</strong> ${details.rejectionReason}</p>`
        : "";
      if (recipientRole === "student") {
        return {
          subject: `${refPrefix}Payment proof rejected — action required for your ${label}`,
          html: `<p>${greeting}</p><p>Unfortunately, the payment proof you submitted for your <strong>${label}</strong> could not be verified.</p>${detailsBlock}${reasonLine}<p>Please contact the venue directly or submit a new payment proof to complete your booking.</p><p>Thank you,<br/>The CourtFlow Team</p>`,
        };
      }
      if (recipientRole === "coach") {
        return {
          subject: `${refPrefix}Lesson booking rejected — ${details.studentName ?? playerName}`,
          html: `<p>${greeting}</p><p>A <strong>${label}</strong> booking was rejected by staff.</p>${detailsBlock}${reasonLine}<p>CourtFlow</p>`,
        };
      }
      return {
        subject: `${refPrefix}[Rejected] ${label} rejected`,
        html: `<p>${greeting}</p><p>The <strong>${label}</strong> booking was rejected.</p>${detailsBlock}${reasonLine}<p>CourtFlow</p>`,
      };
    }

    case "cancelled":
      if (recipientRole === "student") {
        return {
          subject: `${refPrefix}Your ${label} has been cancelled`,
          html: `<p>${greeting}</p><p>Your <strong>${label}</strong> has been cancelled.</p>${detailsBlock}<p>If you did not request this cancellation or believe this is an error, please contact the venue directly.</p><p>Thank you,<br/>The CourtFlow Team</p>`,
        };
      }
      if (recipientRole === "coach") {
        return {
          subject: `${refPrefix}Lesson cancelled — ${details.studentName ?? playerName}`,
          html: `<p>${greeting}</p><p>A <strong>${label}</strong> booking has been cancelled.</p>${detailsBlock}<p>CourtFlow</p>`,
        };
      }
      return {
        subject: `${refPrefix}[Cancelled] ${label} cancelled`,
        html: `<p>${greeting}</p><p>A <strong>${label}</strong> booking has been cancelled.</p>${detailsBlock}<p>CourtFlow</p>`,
      };

    case "auto_confirmed":
      if (recipientRole === "student") {
        return {
          subject: `${refPrefix}Payment confirmed — your ${label} is booked`,
          html: `<p>${greeting}</p><p>Your payment has been automatically confirmed and your <strong>${label}</strong> is now booked.</p>${detailsBlock}${calendarButtons}<p style="margin-top:20px;">We look forward to seeing you on the court!</p><p>Thank you,<br/>The CourtFlow Team</p>`,
        };
      }
      if (recipientRole === "coach") {
        return {
          subject: `${refPrefix}Lesson auto-confirmed — ${details.studentName ?? playerName}`,
          html: `<p>${greeting}</p><p>A <strong>${label}</strong> with your student has been automatically confirmed via Sepay.</p>${detailsBlock}${calendarButtons}<p>CourtFlow</p>`,
        };
      }
      return {
        subject: `${refPrefix}[Auto-confirmed] ${label} confirmed via Sepay`,
        html: `<p>${greeting}</p><p>A <strong>${label}</strong> was automatically confirmed via Sepay payment.</p>${detailsBlock}<p>CourtFlow</p>`,
      };
  }
}

export async function sendBookingEmail(params: SendBookingEmailParams): Promise<void> {
  if (!params.to) {
    console.warn("[sendBookingEmail] No email address provided — skipping");
    return;
  }
  try {
    const resend = getResendClient();
    const { subject, html } = buildEmail(params);
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
      coach: { select: { name: true, email: true } },
      venue: { select: { settings: true } },
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
    studentPlayerId: lesson.player.id,
    studentEmail: lesson.player.email ?? null,
    studentName: lesson.player.name,
    coachEmail: lesson.coach.email ?? null,
    coachName: lesson.coach.name,
    staffEmail,
    details: {
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
  proofUrl: string;
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
          <a href="${params.proofUrl}" style="display:inline-block;padding:10px 20px;background:#e5e7eb;color:#111;text-decoration:none;border-radius:6px;font-weight:600;margin-right:12px">View Proof</a>
          <a href="${params.adminUrl}" style="display:inline-block;padding:10px 20px;background:#7c3aed;color:#fff;text-decoration:none;border-radius:6px;font-weight:600">Review in Admin</a>
        </p>
        <p style="margin-top:32px;color:#6b7280;font-size:12px">CourtFlow Billing</p>
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

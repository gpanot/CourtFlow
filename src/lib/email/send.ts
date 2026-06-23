import { prisma } from "@/lib/db";
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

  // Role-specific greeting
  const greeting = recipientRole === "student"
    ? `Hi ${playerName},`
    : recipientRole === "coach"
    ? `Hi Coach ${playerName},`
    : `Staff notification for ${details.studentName ?? playerName}:`;

  switch (emailType) {
    case "pending":
      if (recipientRole === "student") {
        return {
          subject: `Payment proof received — your ${label} is pending review`,
          html: `<p>${greeting}</p><p>We have received your payment proof for your <strong>${label}</strong> and it is currently being reviewed by our team.</p>${detailsBlock}<p>We will notify you once the payment has been approved. This usually takes less than 24 hours.</p><p>Thank you,<br/>The CourtFlow Team</p>`,
        };
      }
      if (recipientRole === "coach") {
        return {
          subject: `New lesson booking pending — ${details.studentName ?? playerName}`,
          html: `<p>${greeting}</p><p>A student has submitted a booking and payment proof for a <strong>${label}</strong>. The booking is pending staff approval.</p>${detailsBlock}<p>You will be notified once the booking is confirmed.</p><p>CourtFlow</p>`,
        };
      }
      return {
        subject: `[Action required] New ${label} pending approval`,
        html: `<p>${greeting}</p><p>A new <strong>${label}</strong> has been submitted with a payment proof and is awaiting your approval.</p>${detailsBlock}<p>Please review and approve or reject it in the admin panel.</p><p>CourtFlow</p>`,
      };

    case "approved":
      if (recipientRole === "student") {
        return {
          subject: `Payment approved — your ${label} is confirmed`,
          html: `<p>${greeting}</p><p>Great news! Your payment for your <strong>${label}</strong> has been approved and your booking is confirmed.</p>${detailsBlock}<p>We look forward to seeing you on the court!</p><p>Thank you,<br/>The CourtFlow Team</p>`,
        };
      }
      if (recipientRole === "coach") {
        return {
          subject: `Lesson confirmed — ${details.studentName ?? playerName}`,
          html: `<p>${greeting}</p><p>A <strong>${label}</strong> with your student has been confirmed.</p>${detailsBlock}<p>CourtFlow</p>`,
        };
      }
      return {
        subject: `[Confirmed] ${label} approved`,
        html: `<p>${greeting}</p><p>The <strong>${label}</strong> has been approved and confirmed.</p>${detailsBlock}<p>CourtFlow</p>`,
      };

    case "rejected": {
      const reasonLine = details.rejectionReason
        ? `<p><strong>Reason:</strong> ${details.rejectionReason}</p>`
        : "";
      if (recipientRole === "student") {
        return {
          subject: `Payment proof rejected — action required for your ${label}`,
          html: `<p>${greeting}</p><p>Unfortunately, the payment proof you submitted for your <strong>${label}</strong> could not be verified.</p>${detailsBlock}${reasonLine}<p>Please contact the venue directly or submit a new payment proof to complete your booking.</p><p>Thank you,<br/>The CourtFlow Team</p>`,
        };
      }
      if (recipientRole === "coach") {
        return {
          subject: `Lesson booking rejected — ${details.studentName ?? playerName}`,
          html: `<p>${greeting}</p><p>A <strong>${label}</strong> booking was rejected by staff.</p>${detailsBlock}${reasonLine}<p>CourtFlow</p>`,
        };
      }
      return {
        subject: `[Rejected] ${label} rejected`,
        html: `<p>${greeting}</p><p>The <strong>${label}</strong> booking was rejected.</p>${detailsBlock}${reasonLine}<p>CourtFlow</p>`,
      };
    }

    case "cancelled":
      if (recipientRole === "student") {
        return {
          subject: `Your ${label} has been cancelled`,
          html: `<p>${greeting}</p><p>Your <strong>${label}</strong> has been cancelled.</p>${detailsBlock}<p>If you did not request this cancellation or believe this is an error, please contact the venue directly.</p><p>Thank you,<br/>The CourtFlow Team</p>`,
        };
      }
      if (recipientRole === "coach") {
        return {
          subject: `Lesson cancelled — ${details.studentName ?? playerName}`,
          html: `<p>${greeting}</p><p>A <strong>${label}</strong> booking has been cancelled.</p>${detailsBlock}<p>CourtFlow</p>`,
        };
      }
      return {
        subject: `[Cancelled] ${label} cancelled`,
        html: `<p>${greeting}</p><p>A <strong>${label}</strong> booking has been cancelled.</p>${detailsBlock}<p>CourtFlow</p>`,
      };

    case "auto_confirmed":
      if (recipientRole === "student") {
        return {
          subject: `Payment confirmed — your ${label} is booked`,
          html: `<p>${greeting}</p><p>Your payment has been automatically confirmed and your <strong>${label}</strong> is now booked.</p>${detailsBlock}<p>We look forward to seeing you on the court!</p><p>Thank you,<br/>The CourtFlow Team</p>`,
        };
      }
      if (recipientRole === "coach") {
        return {
          subject: `Lesson auto-confirmed — ${details.studentName ?? playerName}`,
          html: `<p>${greeting}</p><p>A <strong>${label}</strong> with your student has been automatically confirmed via Sepay.</p>${detailsBlock}<p>CourtFlow</p>`,
        };
      }
      return {
        subject: `[Auto-confirmed] ${label} confirmed via Sepay`,
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
    return void result;
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
  const tasks: Promise<void>[] = [];

  const roles: { role: RecipientRole; email: string | null; name: string }[] = [
    { role: "student", email: ctx.studentEmail, name: ctx.studentName },
    { role: "coach", email: ctx.coachEmail, name: ctx.coachName },
    { role: "staff", email: ctx.staffEmail, name: "Staff" },
  ];

  for (const { role, email, name } of roles) {
    if (!email) continue;

    const sendTask = sendBookingEmail({
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
    }).then(async () => {
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
    });

    tasks.push(sendTask);
  }

  await Promise.allSettled(tasks);
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
      ...(options?.approvedBy ? { approvedBy: options.approvedBy } : {}),
    },
  };
}

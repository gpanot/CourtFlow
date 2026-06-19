import { getResendClient } from "./client";

const FROM = "noreply_bookings@thecourtflow.com";

type BookingType = "court" | "open_play" | "coach";
type EmailType = "pending" | "approved" | "rejected" | "cancelled" | "auto_confirmed";

export interface SendBookingEmailParams {
  to: string;
  playerName: string;
  bookingType: BookingType;
  emailType: EmailType;
  details: {
    venueName?: string;
    date?: string;
    time?: string;
    amount?: number;
    rejectionReason?: string;
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
  const { playerName, bookingType, emailType, details } = params;
  const label = bookingLabel(bookingType);
  const venueLine = details.venueName ? `<p><strong>Venue:</strong> ${details.venueName}</p>` : "";
  const dateLine = details.date ? `<p><strong>Date:</strong> ${details.date}</p>` : "";
  const timeLine = details.time ? `<p><strong>Time:</strong> ${details.time}</p>` : "";
  const amountLine = details.amount !== undefined
    ? `<p><strong>Amount:</strong> ${details.amount.toLocaleString()} VND</p>`
    : "";
  const detailsBlock = [venueLine, dateLine, timeLine, amountLine].filter(Boolean).join("\n");

  switch (emailType) {
    case "pending":
      return {
        subject: `Payment proof received — your ${label} is pending review`,
        html: `
<p>Hi ${playerName},</p>
<p>We have received your payment proof for your <strong>${label}</strong> and it is currently being reviewed by our team.</p>
${detailsBlock}
<p>We will notify you once the payment has been approved. This usually takes less than 24 hours.</p>
<p>Thank you,<br/>The CourtFlow Team</p>
        `.trim(),
      };

    case "approved":
      return {
        subject: `Payment approved — your ${label} is confirmed`,
        html: `
<p>Hi ${playerName},</p>
<p>Great news! Your payment for your <strong>${label}</strong> has been approved and your booking is confirmed.</p>
${detailsBlock}
<p>We look forward to seeing you on the court!</p>
<p>Thank you,<br/>The CourtFlow Team</p>
        `.trim(),
      };

    case "rejected": {
      const reasonLine = details.rejectionReason
        ? `<p><strong>Reason:</strong> ${details.rejectionReason}</p>`
        : "";
      return {
        subject: `Payment proof rejected — action required for your ${label}`,
        html: `
<p>Hi ${playerName},</p>
<p>Unfortunately, the payment proof you submitted for your <strong>${label}</strong> could not be verified.</p>
${detailsBlock}
${reasonLine}
<p>Please contact the venue directly or submit a new payment proof to complete your booking.</p>
<p>Thank you,<br/>The CourtFlow Team</p>
        `.trim(),
      };
    }

    case "cancelled":
      return {
        subject: `Your ${label} has been cancelled`,
        html: `
<p>Hi ${playerName},</p>
<p>Your <strong>${label}</strong> has been cancelled.</p>
${detailsBlock}
<p>If you did not request this cancellation or believe this is an error, please contact the venue directly.</p>
<p>Thank you,<br/>The CourtFlow Team</p>
        `.trim(),
      };

    case "auto_confirmed":
      return {
        subject: `Payment confirmed — your ${label} is booked`,
        html: `
<p>Hi ${playerName},</p>
<p>Your payment has been automatically confirmed and your <strong>${label}</strong> is now booked.</p>
${detailsBlock}
<p>We look forward to seeing you on the court!</p>
<p>Thank you,<br/>The CourtFlow Team</p>
        `.trim(),
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
    await resend.emails.send({
      from: FROM,
      to: params.to,
      subject,
      html,
    });
  } catch (err) {
    console.error("[sendBookingEmail] Failed to send email:", err);
  }
}

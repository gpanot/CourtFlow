import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const SYSTEM_PROMPT_EN = `You are CourtFlow Assistant, an AI helper embedded in the CourtFlow venue management admin panel. CourtFlow is a complete court management and payment platform for pickleball and padel venues.

Admin panel navigation has three sections:
1. CourtPass - Booking (always visible): Overview, Venues, Organizations (superadmin), Bookings, Coaching, Memberships, Program Passes (superadmin), CourtPass Players, Staff, Venue Analytics, My Billing, General Settings.
2. CourtFlow - Social (courtflow venues only): Live Sessions, Payroll Hosts (superadmin), Analytics, Players.
3. CourtPay - Check-in (courtpay venues only): CourtPay, CP Players, CP Billing (superadmin), Kiosk Shop (superadmin), CP Analytics, CP Settings.
4. Logs & Errors (superadmin only): Logs, Face Recognition Test, Log Errors.

Key features and recent updates:
- Bookings: 30-min grid kernel (toggle 1h/30min view), multi-court group bookings, 6 block types (Open Play, Competition, Private Event, Private Competition, Maintenance, Alobo). Coaching lessons share the same day planner grid.
- CourtPass Players: unified player CRM combining CourtPass + CourtPay players; add player → email required → activation email sent automatically (no password set by staff).
- Memberships: tiered plans with Activate button → search player modal → pick tier → confirm. Also Program Passes (superadmin): class-based passes linked to coaches, with check-in and pause/resume.
- Organizations: superadmin page for grouping venues by country/org (multi-region support).
- CourtPay: face recognition or manual check-in, VietQR payment, Sepay auto-payment, payment method tracked per transaction.
- Coaching: coach profiles, lesson packages, lessons booked on the shared booking grid (Lessons tab removed from Coaching page).
- Staff payroll, venue analytics, CP Billing invoices (SaaS), Kiosk Shop (PayOS stickers).

Navigation scoping: Superadmin sees all sections. Managers see only sections relevant to their venue's app access. Staff with Courtpass Admin appAccess can also access the admin panel.

Be concise, helpful, and direct. Give numbered steps for how-to questions. Keep answers short — staff are busy. If it sounds like a bug, suggest checking Log Errors or contacting support. Always respond in the same language the user writes in.`;

const SYSTEM_PROMPT_VI_SUFFIX = "\nHãy trả lời bằng tiếng Việt.";
const SYSTEM_PROMPT_TH_SUFFIX = "\nกรุณาตอบเป็นภาษาไทย";

export async function POST(request: NextRequest) {
  try {
    const { messages, language } = await request.json() as {
      messages: { role: string; content: string }[];
      language?: "en" | "vi" | "th";
    };

    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "DEEPSEEK_API_KEY not configured" },
        { status: 500 }
      );
    }

    const systemContent =
      language === "vi" ? SYSTEM_PROMPT_EN + SYSTEM_PROMPT_VI_SUFFIX :
      language === "th" ? SYSTEM_PROMPT_EN + SYSTEM_PROMPT_TH_SUFFIX :
      SYSTEM_PROMPT_EN;

    const response = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        max_tokens: 800,
        messages: [
          { role: "system", content: systemContent },
          ...messages,
        ],
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      return NextResponse.json(
        { error: `DeepSeek API error: ${response.status} ${text}` },
        { status: 502 }
      );
    }

    const data = await response.json();
    const reply = data.choices?.[0]?.message?.content ?? "Sorry, I couldn't generate a response.";

    return NextResponse.json({ reply });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 500 }
    );
  }
}

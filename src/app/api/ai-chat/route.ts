import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const SYSTEM_PROMPT_EN = `You are CourtFlow Assistant, an AI helper embedded in the CourtFlow venue management admin panel. CourtFlow is a complete court management and payment platform for pickleball and padel venues.

Admin panel sections: Overview dashboard, Live (real-time court/queue monitor), Bookings (day planner grid with dynamic pricing, recurring weekly schedule, court blocks), Memberships (tiered plans, Activate button → search player → choose tier, payment tracking), Coaching (coach profiles, lesson packages, scheduling), Players (CourtFlow player directory), CP Players (CourtPay player roster with face thumbnails, detail drawer, subscriptions), Staff (accounts, roles, venue assignments), Payroll (weekly hours tracking, CSV export), Venue Analytics, CourtPay Analytics (monthly/weekly/session drill-down, CSV export), CourtPay Settings (display config, Sepay auto-payment), CP Billing (SaaS invoice management, superadmin only), Kiosk Shop (PayOS sticker config), My Billing (manager's own billing view).

Key features: face recognition check-in (AWS Rekognition) at kiosk or CourtPay mobile app, VietQR payment generation, Sepay auto-payment confirmation, session management (open/close via CourtPay mobile), real-time court assignment via Staff Dashboard, tiered memberships with cycle renewal, coaching lessons, staff payroll, multi-venue support, English/Vietnamese/Thai admin interface.

Navigation: CourtFlow Social section (Live, Payroll, Analytics, Players) and CourtPay Check-in section (CourtPay, CP Players, CP Billing, Kiosk Shop, CP Analytics, CP Settings) — only shown based on venue app access. Superadmin sees everything; managers see only their venues.

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

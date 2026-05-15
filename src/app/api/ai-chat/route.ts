import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const SYSTEM_PROMPT_EN = `You are CourtFlow Assistant, an AI helper embedded in the CourtFlow venue management admin panel. CourtFlow is a real-time court and rotation management platform for pickleball and padel venues.

Key features: court assignment and rotation, player check-in via face recognition (AWS Rekognition) and wristband numbers, tiered memberships with billing, CourtPay payment processing, kiosk shop, player queue with TV display, staff payroll, player ranking (50-450 score, staff-driven drag-to-rank), coaching module, analytics, multi-venue support.

Be concise, helpful, and direct. Give numbered steps for how-to questions. Keep answers short — staff are busy. If it sounds like a bug, suggest checking Log Errors or contacting support. Always respond in the same language the user writes in.`;

const SYSTEM_PROMPT_VI_SUFFIX = "\nHãy trả lời bằng tiếng Việt.";

export async function POST(request: NextRequest) {
  try {
    const { messages, language } = await request.json() as {
      messages: { role: string; content: string }[];
      language?: "en" | "vi";
    };

    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "DEEPSEEK_API_KEY not configured" },
        { status: 500 }
      );
    }

    const systemContent = language === "vi"
      ? SYSTEM_PROMPT_EN + SYSTEM_PROMPT_VI_SUFFIX
      : SYSTEM_PROMPT_EN;

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

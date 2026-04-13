import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env" });

const BASE_URL = process.env.COURTFLOW_BASE_URL || "http://localhost:3000";
/** Set when site gate is enabled: e.g. cf-site-access=granted */
const GATE_COOKIE = process.env.COURTFLOW_GATE_COOKIE || "";
const VENUE_ID = process.env.COURTFLOW_VENUE_ID || "demo-venue-1";
const BOT_COUNT = 62;
const DELAY_BETWEEN_JOINS_MS = 3000;

function jsonHeaders(extra?: Record<string, string>): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json", ...extra };
  if (GATE_COOKIE) h.Cookie = GATE_COOKIE;
  return h;
}

const NAMES = [
  "Alex", "Jordan", "Taylor", "Morgan", "Casey", "Riley", "Jamie", "Quinn",
  "Avery", "Peyton", "Cameron", "Dakota", "Skyler", "Reese", "Finley", "Emerson",
  "Rowan", "Sawyer", "Blake", "Charlie", "Drew", "Frankie", "Hayden", "Jesse",
  "Kelly", "Logan", "Marley", "Noel", "Oakley", "Parker", "Remy", "Sage",
  "Tatum", "Val", "Winter", "Ari", "Briar", "Cruz", "Devon", "Eden",
  "Flynn", "Gray", "Harper", "Indigo", "Jules", "Kai", "Lane", "Milan",
  "Nico", "Onyx", "Phoenix", "Raven", "Shay", "Toby", "Uma", "Vivian",
  "Wren", "Xander", "Yael", "Zion", "Aspen", "Bay",
];

const AVATARS = ["🏓", "🎾", "⚡", "🔥", "🌟", "💪", "🦊", "🐻", "🦁", "🐯", "🦅", "🐬", "🎯", "🏆", "👑", "💎"];
const SKILLS: string[] = ["beginner", "beginner", "intermediate", "intermediate", "intermediate", "advanced", "advanced", "pro"];
const GENDERS: string[] = ["male", "male", "male", "female", "female", "female"];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/** When set, first `round(count * pct / 100)` bots are male, rest female. */
function genderForMix(index: number, count: number, menPercent: number): string {
  const menCount = Math.round((count * menPercent) / 100);
  return index < menCount ? "male" : "female";
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getOrCreateBot(
  index: number,
  count: number,
  menPercent: number | null,
): Promise<{ token: string; playerId: string } | null> {
  const phone = `+1900${String(index).padStart(4, "0")}`;
  const name = NAMES[index] || `Bot ${index + 1}`;
  const gender =
    menPercent != null ? genderForMix(index, count, menPercent) : pick(GENDERS);
  const skill = pick(SKILLS);
  const avatar = pick(AVATARS);

  async function syncProfile(token: string, playerId: string) {
    await fetch(`${BASE_URL}/api/players/${playerId}`, {
      method: "PATCH",
      headers: jsonHeaders({ Authorization: `Bearer ${token}` }),
      body: JSON.stringify(
        menPercent != null ? { avatar, gender } : { avatar },
      ),
    });
  }

  // Try to register
  const regRes = await fetch(`${BASE_URL}/api/auth/register`, {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify({ phone, name, gender, skillLevel: skill }),
  });

  if (regRes.ok) {
    const data = await regRes.json();
    await syncProfile(data.token, data.player.id);
    return { token: data.token, playerId: data.player.id };
  }

  if (regRes.status === 409) {
    // Already exists — OTP flow
    const otpRes = await fetch(`${BASE_URL}/api/auth/send-otp`, {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({ phone }),
    });
    const otpData = await otpRes.json();
    const verifyRes = await fetch(`${BASE_URL}/api/auth/verify-otp`, {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({ phone, code: otpData.code }),
    });
    const verifyData = await verifyRes.json();
    await syncProfile(verifyData.token, verifyData.player.id);
    return { token: verifyData.token, playerId: verifyData.player.id };
  }

  return null;
}

function parseMenPercent(): number | null {
  const raw = process.argv[5] ?? process.env.COURTFLOW_BOT_MEN_PERCENT;
  if (raw === undefined || raw === "") return null;
  const n = parseFloat(String(raw));
  if (!Number.isFinite(n)) return null;
  return Math.min(100, Math.max(0, n));
}

async function main() {
  const mode = process.argv[2] || "staggered";
  const count = parseInt(process.argv[3] || String(BOT_COUNT), 10);
  const delay = parseInt(process.argv[4] || String(DELAY_BETWEEN_JOINS_MS), 10);
  const menPercent = parseMenPercent();

  /** Create/update bot Player rows via auth API only — no queue join. */
  if (mode === "register-only" || mode === "accounts") {
    if (menPercent != null) {
      const men = Math.round((count * menPercent) / 100);
      console.log(`Gender mix: ~${menPercent}% men → ${men} male, ${count - men} female\n`);
    }
    console.log(`Registering ${count} bot accounts (no queue)...\n`);
    let ok = 0;
    for (let i = 0; i < count; i++) {
      const phone = `+1900${String(i).padStart(4, "0")}`;
      const name = NAMES[i] || `Bot ${i + 1}`;
      const bot = await getOrCreateBot(i, count, menPercent);
      if (!bot) {
        console.log(`  ✗ ${name} (${phone}) — failed`);
        continue;
      }
      ok++;
      console.log(`  ✓ ${name} (${phone})`);
    }
    console.log(
      `\nDone! ${ok}/${count} accounts ready. Check-in: npx tsx scripts/check-in-bots.ts ${count}${menPercent != null ? ` ${menPercent}` : ""}`,
    );
    return;
  }

  // Get active session
  const sessRes = await fetch(`${BASE_URL}/api/sessions?venueId=${VENUE_ID}`, {
    headers: jsonHeaders(),
  });
  const session = await sessRes.json();
  if (!session?.id) {
    console.error("No active session at venue. Open one first.");
    process.exit(1);
  }
  const sessionId = session.id;
  console.log(`Session: ${sessionId}`);
  if (menPercent != null) {
    const men = Math.round((count * menPercent) / 100);
    console.log(`Gender mix: ~${menPercent}% men → ${men} male, ${count - men} female\n`);
  }

  if (mode === "staggered") {
    console.log(`Queueing ${count} bots with ${delay}ms delay between each...\n`);
    let queued = 0;
    for (let i = 0; i < count; i++) {
      const bot = await getOrCreateBot(i, count, menPercent);
      if (!bot) { console.log(`  ✗ Bot ${i} — failed to create`); continue; }

      const queueRes = await fetch(`${BASE_URL}/api/queue`, {
        method: "POST",
        headers: jsonHeaders({ Authorization: `Bearer ${bot.token}` }),
        body: JSON.stringify({ sessionId, venueId: VENUE_ID }),
      });

      if (queueRes.ok) {
        queued++;
        const name = NAMES[i] || `Bot ${i + 1}`;
        console.log(`  ✓ #${queued} ${name} joined`);
      } else {
        const err = await queueRes.json();
        console.log(`  ✗ ${NAMES[i] || `Bot ${i}`} — ${err.error || "failed"}`);
      }

      if (i < count - 1) await sleep(delay);
    }
    console.log(`\nDone! ${queued}/${count} bots queued.`);

  } else if (mode === "burst") {
    console.log(`Queueing ${count} bots all at once...\n`);
    let queued = 0;
    for (let i = 0; i < count; i++) {
      const bot = await getOrCreateBot(i, count, menPercent);
      if (!bot) continue;
      const queueRes = await fetch(`${BASE_URL}/api/queue`, {
        method: "POST",
        headers: jsonHeaders({ Authorization: `Bearer ${bot.token}` }),
        body: JSON.stringify({ sessionId, venueId: VENUE_ID }),
      });
      if (queueRes.ok) queued++;
    }
    console.log(`Done! ${queued}/${count} bots queued.`);

  } else if (mode === "requeue") {
    console.log(`Re-queueing all bots...\n`);
    let requeued = 0;
    for (let i = 0; i < count; i++) {
      const bot = await getOrCreateBot(i, count, menPercent);
      if (!bot) continue;
      const res = await fetch(`${BASE_URL}/api/queue/requeue`, {
        method: "POST",
        headers: jsonHeaders({ Authorization: `Bearer ${bot.token}` }),
      });
      if (res.ok) requeued++;
    }
    console.log(`Done! ${requeued} bots re-queued.`);
  }
}

main().catch(console.error);

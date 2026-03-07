const BASE_URL = "http://localhost:3000";
const VENUE_ID = "cmm96oluh0008t5v3hwlv9mmc";
const BOT_COUNT = 62;
const DELAY_BETWEEN_JOINS_MS = 3000;

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
const GENDERS: string[] = ["male", "male", "male", "female", "female", "female", "other"];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getOrCreateBot(index: number): Promise<{ token: string; playerId: string } | null> {
  const phone = `+1900${String(index).padStart(4, "0")}`;
  const name = NAMES[index] || `Bot ${index + 1}`;
  const gender = pick(GENDERS);
  const skill = pick(SKILLS);
  const avatar = pick(AVATARS);

  // Try to register
  const regRes = await fetch(`${BASE_URL}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone, name, gender, skillLevel: skill }),
  });

  if (regRes.ok) {
    const data = await regRes.json();
    // Set avatar
    await fetch(`${BASE_URL}/api/players/${data.player.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.token}` },
      body: JSON.stringify({ avatar }),
    });
    return { token: data.token, playerId: data.player.id };
  }

  if (regRes.status === 409) {
    // Already exists — OTP flow
    const otpRes = await fetch(`${BASE_URL}/api/auth/send-otp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone }),
    });
    const otpData = await otpRes.json();
    const verifyRes = await fetch(`${BASE_URL}/api/auth/verify-otp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone, code: otpData.code }),
    });
    const verifyData = await verifyRes.json();
    return { token: verifyData.token, playerId: verifyData.player.id };
  }

  return null;
}

async function main() {
  const mode = process.argv[2] || "staggered";
  const count = parseInt(process.argv[3] || String(BOT_COUNT), 10);
  const delay = parseInt(process.argv[4] || String(DELAY_BETWEEN_JOINS_MS), 10);

  // Get active session
  const sessRes = await fetch(`${BASE_URL}/api/sessions?venueId=${VENUE_ID}`);
  const session = await sessRes.json();
  if (!session?.id) {
    console.error("No active session at venue. Open one first.");
    process.exit(1);
  }
  const sessionId = session.id;
  console.log(`Session: ${sessionId}`);

  if (mode === "staggered") {
    console.log(`Queueing ${count} bots with ${delay}ms delay between each...\n`);
    let queued = 0;
    for (let i = 0; i < count; i++) {
      const bot = await getOrCreateBot(i);
      if (!bot) { console.log(`  ✗ Bot ${i} — failed to create`); continue; }

      const queueRes = await fetch(`${BASE_URL}/api/queue`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${bot.token}` },
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
      const bot = await getOrCreateBot(i);
      if (!bot) continue;
      const queueRes = await fetch(`${BASE_URL}/api/queue`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${bot.token}` },
        body: JSON.stringify({ sessionId, venueId: VENUE_ID }),
      });
      if (queueRes.ok) queued++;
    }
    console.log(`Done! ${queued}/${count} bots queued.`);

  } else if (mode === "requeue") {
    console.log(`Re-queueing all bots...\n`);
    let requeued = 0;
    for (let i = 0; i < count; i++) {
      const bot = await getOrCreateBot(i);
      if (!bot) continue;
      const res = await fetch(`${BASE_URL}/api/queue/requeue`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${bot.token}` },
      });
      if (res.ok) requeued++;
    }
    console.log(`Done! ${requeued} bots re-queued.`);
  }
}

main().catch(console.error);

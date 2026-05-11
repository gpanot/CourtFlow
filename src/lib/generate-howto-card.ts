/**
 * Generates a 1080x1080 "How to use your stickers" PNG instruction card
 * using the `canvas` npm package (Node.js server-side only).
 * Returns a Buffer containing the PNG bytes.
 */
export async function generateHowToCard(venueName?: string): Promise<Buffer> {
  // Dynamic require so Next.js doesn't try to bundle this for the browser
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createCanvas } = require("canvas") as typeof import("canvas");

  const SIZE = 1080;
  const canvas = createCanvas(SIZE, SIZE);
  const ctx = canvas.getContext("2d");

  const GREEN = "#4ade80";
  const WHITE = "#ffffff";
  const GRAY = "#9ca3af";
  const BLACK = "#000000";

  // ── Background ──────────────────────────────────────────────────────────────
  ctx.fillStyle = BLACK;
  ctx.fillRect(0, 0, SIZE, SIZE);

  // ── Top brand name ──────────────────────────────────────────────────────────
  const brand = venueName ?? "CourtFlow";
  ctx.font = "bold 48px sans-serif";
  ctx.fillStyle = GREEN;
  ctx.textAlign = "center";
  ctx.fillText(brand, SIZE / 2, 90);

  // ── English title ────────────────────────────────────────────────────────────
  ctx.font = "bold 54px sans-serif";
  ctx.fillStyle = WHITE;
  ctx.fillText("How to use your stickers on WhatsApp", SIZE / 2, 170);

  // ── Vietnamese title ─────────────────────────────────────────────────────────
  ctx.font = "42px sans-serif";
  ctx.fillStyle = WHITE;
  ctx.fillText("Cách dùng sticker trên WhatsApp", SIZE / 2, 230);

  // ── Divider ───────────────────────────────────────────────────────────────────
  ctx.strokeStyle = GREEN;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(80, 260);
  ctx.lineTo(SIZE - 80, 260);
  ctx.stroke();

  // ── Steps ─────────────────────────────────────────────────────────────────────
  const steps = [
    {
      en: "Download your sticker pack · Tải bộ sticker về máy",
    },
    {
      en: "Open WhatsApp, go to any chat · Mở WhatsApp, vào bất kỳ đoạn chat nào",
    },
    {
      en: "Tap the sticker icon 😊 · Nhấn vào biểu tượng sticker 😊",
    },
    {
      en: "Tap ✂️ create icon to add a sticker · Nhấn ✂️ để tạo sticker mới",
    },
    {
      en: "Select your sticker — send immediately! · Chọn sticker vừa tải — gửi ngay!",
    },
  ];

  const CIRCLE_R = 30;
  const STEP_Y_START = 320;
  const STEP_GAP = 138;
  const LEFT_X = 80;
  const TEXT_X = LEFT_X + CIRCLE_R * 2 + 20;
  const MAX_TEXT_WIDTH = SIZE - TEXT_X - 60;

  ctx.textAlign = "left";

  for (let i = 0; i < steps.length; i++) {
    const y = STEP_Y_START + i * STEP_GAP;

    // Green circle
    ctx.beginPath();
    ctx.arc(LEFT_X + CIRCLE_R, y + CIRCLE_R, CIRCLE_R, 0, Math.PI * 2);
    ctx.fillStyle = GREEN;
    ctx.fill();

    // Step number
    ctx.font = "bold 32px sans-serif";
    ctx.fillStyle = BLACK;
    ctx.textAlign = "center";
    ctx.fillText(String(i + 1), LEFT_X + CIRCLE_R, y + CIRCLE_R + 11);

    // Step text — wrap if needed
    ctx.textAlign = "left";
    const text = steps[i].en;
    const words = text.split(" ");
    const lines: string[] = [];
    let line = "";

    ctx.font = "32px sans-serif";
    for (const word of words) {
      const test = line ? line + " " + word : word;
      if (ctx.measureText(test).width > MAX_TEXT_WIDTH && line) {
        lines.push(line);
        line = word;
      } else {
        line = test;
      }
    }
    if (line) lines.push(line);

    for (let l = 0; l < lines.length; l++) {
      const lineY = y + 12 + l * 40;
      // English part (before ·) in white
      const dotIdx = lines[l].indexOf("·");
      if (dotIdx !== -1) {
        const enPart = lines[l].slice(0, dotIdx);
        const viPart = lines[l].slice(dotIdx);
        ctx.fillStyle = WHITE;
        ctx.fillText(enPart, TEXT_X, lineY);
        ctx.fillStyle = GRAY;
        ctx.fillText(viPart, TEXT_X + ctx.measureText(enPart).width, lineY);
      } else {
        ctx.fillStyle = WHITE;
        ctx.fillText(lines[l], TEXT_X, lineY);
      }
    }
  }

  // ── Bottom URL ────────────────────────────────────────────────────────────────
  const siteUrl =
    process.env.RAILWAY_PUBLIC_DOMAIN ??
    (process.env.APP_URL ? process.env.APP_URL.replace(/^https?:\/\//, "") : "courtflow.app");

  ctx.font = "28px sans-serif";
  ctx.fillStyle = GRAY;
  ctx.textAlign = "center";
  ctx.fillText(siteUrl, SIZE / 2, SIZE - 48);

  return canvas.toBuffer("image/png");
}

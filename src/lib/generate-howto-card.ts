/**
 * Generates a 1080x1080 "How to use your stickers" PNG instruction card
 * using SVG → sharp rasterisation (no native deps required).
 * Returns a Buffer containing the PNG bytes.
 */
export async function generateHowToCard(venueName?: string): Promise<Buffer> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const sharp = require("sharp") as typeof import("sharp");

  const SIZE = 1080;
  const GREEN = "#4ade80";
  const WHITE = "#ffffff";
  const GRAY = "#9ca3af";
  const BLACK = "#000000";

  const brand = escXml(venueName ?? "CourtFlow");

  const siteUrl = escXml(
    process.env.RAILWAY_PUBLIC_DOMAIN ??
      (process.env.APP_URL
        ? process.env.APP_URL.replace(/^https?:\/\//, "")
        : "courtflow.app"),
  );

  const steps = [
    {
      en: "Download your sticker pack",
      vi: "Tải bộ sticker về máy",
    },
    {
      en: "Open WhatsApp, go to any chat",
      vi: "Mở WhatsApp, vào bất kỳ đoạn chat nào",
    },
    {
      en: "Tap the sticker icon 😊",
      vi: "Nhấn vào biểu tượng sticker 😊",
    },
    {
      en: "Tap ✂️ create icon to add a sticker",
      vi: "Nhấn ✂️ để tạo sticker mới",
    },
    {
      en: "Select your sticker — send immediately!",
      vi: "Chọn sticker vừa tải — gửi ngay!",
    },
  ];

  const STEP_Y_START = 350;
  const STEP_GAP = 130;
  const CIRCLE_R = 28;
  const LEFT_X = 80;
  const TEXT_X = LEFT_X + CIRCLE_R * 2 + 20;

  const stepsSvg = steps
    .map((step, i) => {
      const cy = STEP_Y_START + i * STEP_GAP + CIRCLE_R;
      return `
      <!-- Step ${i + 1} circle -->
      <circle cx="${LEFT_X + CIRCLE_R}" cy="${cy}" r="${CIRCLE_R}" fill="${GREEN}"/>
      <text x="${LEFT_X + CIRCLE_R}" y="${cy + 10}" text-anchor="middle"
        font-family="sans-serif" font-weight="bold" font-size="26" fill="${BLACK}">${i + 1}</text>
      <!-- Step ${i + 1} text -->
      <text x="${TEXT_X}" y="${cy - 6}" font-family="sans-serif" font-size="30" fill="${WHITE}">${escXml(step.en)}</text>
      <text x="${TEXT_X}" y="${cy + 30}" font-family="sans-serif" font-size="24" fill="${GRAY}">${escXml(step.vi)}</text>
    `;
    })
    .join("");

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${SIZE}" height="${SIZE}" xmlns="http://www.w3.org/2000/svg">
  <!-- Background -->
  <rect width="${SIZE}" height="${SIZE}" fill="${BLACK}"/>

  <!-- Brand name -->
  <text x="${SIZE / 2}" y="85" text-anchor="middle"
    font-family="sans-serif" font-weight="bold" font-size="44" fill="${GREEN}">${brand}</text>

  <!-- English title -->
  <text x="${SIZE / 2}" y="160" text-anchor="middle"
    font-family="sans-serif" font-weight="bold" font-size="46" fill="${WHITE}">How to use your stickers on WhatsApp</text>

  <!-- Vietnamese title -->
  <text x="${SIZE / 2}" y="218" text-anchor="middle"
    font-family="sans-serif" font-size="36" fill="${WHITE}">Cách dùng sticker trên WhatsApp</text>

  <!-- Divider -->
  <line x1="80" y1="248" x2="${SIZE - 80}" y2="248" stroke="${GREEN}" stroke-width="3"/>

  <!-- Steps -->
  ${stepsSvg}

  <!-- Footer URL -->
  <text x="${SIZE / 2}" y="${SIZE - 44}" text-anchor="middle"
    font-family="sans-serif" font-size="26" fill="${GRAY}">${siteUrl}</text>
</svg>`;

  return sharp(Buffer.from(svg)).png().toBuffer();
}

function escXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

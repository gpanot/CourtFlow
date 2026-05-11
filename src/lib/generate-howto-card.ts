import sharp from "sharp";

/**
 * Generates a 1080x1080 "How to use your stickers" PNG instruction card
 * using Sharp's SVG-to-PNG rasterisation (no native-build dependencies).
 * Returns a Buffer containing the PNG bytes.
 */
export async function generateHowToCard(venueName?: string): Promise<Buffer> {
  const brand = venueName ?? "CourtFlow";
  const siteUrl =
    process.env.RAILWAY_PUBLIC_DOMAIN ??
    (process.env.APP_URL ? process.env.APP_URL.replace(/^https?:\/\//, "") : "courtflow.app");

  const svg = `<svg width="1080" height="1080" xmlns="http://www.w3.org/2000/svg">
    <rect width="1080" height="1080" fill="#000000"/>
    <text x="540" y="80" font-family="Arial" font-size="44" font-weight="bold" fill="#4ade80" text-anchor="middle">${brand}</text>
    <text x="540" y="150" font-family="Arial" font-size="36" font-weight="bold" fill="white" text-anchor="middle">How to use your stickers on WhatsApp</text>
    <text x="540" y="200" font-family="Arial" font-size="28" fill="#9ca3af" text-anchor="middle">Cach dung sticker tren WhatsApp</text>
    <line x1="80" y1="230" x2="1000" y2="230" stroke="#4ade80" stroke-width="2"/>
    <!-- Step 1 -->
    <circle cx="100" cy="310" r="28" fill="#4ade80"/>
    <text x="100" y="318" font-family="Arial" font-size="24" font-weight="bold" fill="black" text-anchor="middle">1</text>
    <text x="150" y="305" font-family="Arial" font-size="26" fill="white">Download your sticker pack</text>
    <text x="150" y="335" font-family="Arial" font-size="22" fill="#9ca3af">Tai bo sticker ve may</text>
    <!-- Step 2 -->
    <circle cx="100" cy="420" r="28" fill="#4ade80"/>
    <text x="100" y="428" font-family="Arial" font-size="24" font-weight="bold" fill="black" text-anchor="middle">2</text>
    <text x="150" y="415" font-family="Arial" font-size="26" fill="white">Open WhatsApp, go to any chat</text>
    <text x="150" y="445" font-family="Arial" font-size="22" fill="#9ca3af">Mo WhatsApp, vao bat ky doan chat nao</text>
    <!-- Step 3 -->
    <circle cx="100" cy="530" r="28" fill="#4ade80"/>
    <text x="100" y="538" font-family="Arial" font-size="24" font-weight="bold" fill="black" text-anchor="middle">3</text>
    <text x="150" y="525" font-family="Arial" font-size="26" fill="white">Tap the sticker icon next to the text field</text>
    <text x="150" y="555" font-family="Arial" font-size="22" fill="#9ca3af">Nhan vao bieu tuong sticker canh o chat</text>
    <!-- Step 4 -->
    <circle cx="100" cy="640" r="28" fill="#4ade80"/>
    <text x="100" y="648" font-family="Arial" font-size="24" font-weight="bold" fill="black" text-anchor="middle">4</text>
    <text x="150" y="635" font-family="Arial" font-size="26" fill="white">Tap the create icon to add your sticker</text>
    <text x="150" y="665" font-family="Arial" font-size="22" fill="#9ca3af">Nhan icon tao sticker moi</text>
    <!-- Step 5 -->
    <circle cx="100" cy="750" r="28" fill="#4ade80"/>
    <text x="100" y="758" font-family="Arial" font-size="24" font-weight="bold" fill="black" text-anchor="middle">5</text>
    <text x="150" y="745" font-family="Arial" font-size="26" fill="white">Select your sticker -- send immediately!</text>
    <text x="150" y="775" font-family="Arial" font-size="22" fill="#9ca3af">Chon sticker vua tai -- gui ngay!</text>
    <text x="540" y="1040" font-family="Arial" font-size="22" fill="#6b7280" text-anchor="middle">${siteUrl}</text>
  </svg>`;

  return sharp(Buffer.from(svg)).png().toBuffer();
}

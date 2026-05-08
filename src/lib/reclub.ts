const RECLUB_API = "https://api.reclub.co";
const RECLUB_WEB = "https://reclub.co";

const RECLUB_HEADERS: Record<string, string> = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
  "x-output-casing": "camelCase",
  Accept: "application/json",
};

export interface ReclubClub {
  groupId: number;
  name: string;
  slug: string;
}

export const RECLUB_CLUBS: ReclubClub[] = [
  { groupId: 298257, name: "NEXT11 Pickleball Club", slug: "next11-pickleball-club" },
  { groupId: 22476, name: "Elite Sport Pickleball @Pacific", slug: "js-pickleball-club" },
  { groupId: 11186, name: "Big Balls Pickle Club", slug: "big" },
  { groupId: 14164, name: "Aspire Drill Club", slug: "aspire" },
  { groupId: 30158, name: "Ace Squad Pickleball", slug: "pickleballacesquad" },
  { groupId: 104121, name: "Top One", slug: "top-one" },
  { groupId: 326472, name: "The MM Pickleball Club", slug: "the-mm-pickleball-club" },
];

const DEFAULT_AVATAR_HOST = "d1upr18ac2olqz.cloudfront.net/default-avatars";

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function reclubApiFetch(path: string, retryOn429 = true): Promise<unknown> {
  const url = path.startsWith("http") ? path : `${RECLUB_API}${path}`;
  const res = await fetch(url, { headers: RECLUB_HEADERS });

  if (res.status === 429 && retryOn429) {
    await sleep(2000);
    return reclubApiFetch(path, false);
  }

  if (!res.ok) {
    throw new Error(`Reclub API ${res.status}: ${url}`);
  }
  return res.json();
}

export interface ReclubEvent {
  referenceCode: string;
  name: string;
  startDatetime: number;
  confirmedCount: number;
}

export async function fetchReclubEvents(groupId: number): Promise<ReclubEvent[]> {
  const VN_OFFSET = 7 * 60 * 60 * 1000;
  const nowUtc = Date.now();
  const vnNow = new Date(nowUtc + VN_OFFSET);
  const vnDayStart = new Date(
    Date.UTC(vnNow.getUTCFullYear(), vnNow.getUTCMonth(), vnNow.getUTCDate())
  );
  const vnDayEnd = new Date(vnDayStart.getTime() + 24 * 60 * 60 * 1000 - 1000);

  const tsMin = Math.floor((vnDayStart.getTime() - VN_OFFSET) / 1000);
  const tsMax = Math.floor((vnDayEnd.getTime() - VN_OFFSET) / 1000);

  const data = (await reclubApiFetch(
    `/groups/${groupId}/activities?types=MEETS&min_start_datetime=${tsMin}&max_start_datetime=${tsMax}&limit=100&sort_dir=1`
  )) as Array<{
    referenceCode: string;
    name: string;
    startDatetime: number;
    participantsStatusCount?: { joined?: number };
  }>;

  return data.map((m) => ({
    referenceCode: m.referenceCode,
    name: m.name,
    startDatetime: m.startDatetime,
    confirmedCount: m.participantsStatusCount?.joined ?? 0,
  }));
}

export interface ReclubPlayer {
  /** null for guests added by name (no Reclub account) or players added by another user */
  reclubUserId: number | null;
  name: string;
  avatarUrl: string;
  isDefaultAvatar: boolean;
  gender: string;
}

export async function fetchReclubRoster(
  referenceCode: string
): Promise<{ eventName: string; players: ReclubPlayer[] }> {
  const htmlRes = await fetch(`${RECLUB_WEB}/m/${referenceCode}`, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
      Accept: "text/html",
    },
  });

  if (!htmlRes.ok) {
    throw new Error(`Failed to fetch event page: ${htmlRes.status}`);
  }

  const html = await htmlRes.text();

  const nuxtMatch = html.match(
    /<script[^>]*id="__NUXT_DATA__"[^>]*>([\s\S]*?)<\/script>/
  );
  if (!nuxtMatch) {
    throw new Error("Could not find __NUXT_DATA__ in event page");
  }

  const raw: unknown[] = JSON.parse(nuxtMatch[1]);

  const userIds = new Set<number>();
  // Synthetic players for: (a) guests added by name with no Reclub account (referenceId=null),
  // and (b) players added by another user ("bring a friend", externalReference.name is set).
  // In both cases we skip adding to userIds to avoid double-counting the adder.
  const syntheticPlayers: ReclubPlayer[] = [];

  for (const item of raw) {
    if (
      item &&
      typeof item === "object" &&
      !Array.isArray(item) &&
      "referenceId" in item
    ) {
      const rec = item as Record<string, number>;
      const status = raw[rec.status];
      const userId = raw[rec.referenceId];

      if (status !== 1) continue;

      // Resolve externalReference — present for "added by" and manual-guest entries
      const extRefIndex = (rec as Record<string, unknown>).externalReference as number | undefined;
      const extRef = extRefIndex !== undefined ? raw[extRefIndex] : undefined;
      if (
        extRef &&
        typeof extRef === "object" &&
        !Array.isArray(extRef) &&
        "name" in extRef
      ) {
        const extObj = extRef as Record<string, number>;
        const name = raw[extObj.name];
        const gender = raw[extObj.gender];
        if (typeof name === "string" && name.trim()) {
          syntheticPlayers.push({
            reclubUserId: typeof userId === "number" && userId > 1000 ? userId : null,
            name: name.trim(),
            avatarUrl: "",
            isDefaultAvatar: true,
            gender: typeof gender === "string" ? gender : "",
          });
        }
        // Skip — do not also add userId to the batch-fetch set
        continue;
      }

      if (typeof userId === "number" && userId > 1000) {
        userIds.add(userId);
      }
    }
  }

  const sortedIds = [...userIds].sort((a, b) => a - b);

  const BATCH = 50;
  const players: ReclubPlayer[] = [];

  for (let i = 0; i < sortedIds.length; i += BATCH) {
    if (i > 0) await sleep(300);

    const batch = sortedIds.slice(i, i + BATCH);
    const ids = batch.join(",");
    const data = (await reclubApiFetch(
      `/players/userIds?userIds=${ids}&scopes=BASIC_PROFILE`
    )) as { players?: Array<{ userId: number; name: string; imageUrl: string; gender: string }> };

    for (const p of data.players ?? []) {
      players.push({
        reclubUserId: p.userId,
        name: p.name,
        avatarUrl: p.imageUrl,
        isDefaultAvatar: p.imageUrl.includes(DEFAULT_AVATAR_HOST),
        gender: p.gender ?? "",
      });
    }
  }

  // Append synthetic players (guests + added-by entries) after real profiles
  players.push(...syntheticPlayers);

  const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  const eventName = titleMatch
    ? titleMatch[1].replace(/ \| Reclub$/i, "").trim()
    : referenceCode;

  return { eventName, players };
}

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
  { groupId: 6648, name: "002 Pickleball Club (Thao Dien)", slug: "002-pickleball-club" },
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
  /** true when this player was added as a +1 by another Reclub user (bring-a-friend) */
  isAddedByFriend?: boolean;
}

interface RosterEntry {
  userId: number | null;
  createdAt: number; // unix seconds; used for sort (ASC = first-joined first, matches Reclub display)
  lastStatusUpdatedAt: number; // ms; kept for reference
  isSynthetic: boolean;
  syntheticName?: string;
  syntheticGender?: string;
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

  // Collect all confirmed participants with their lastStatusUpdatedAt timestamp.
  // Reclub displays participants sorted by lastStatusUpdatedAt DESC (most-recently confirmed first).
  const entries: RosterEntry[] = [];
  const seenUserIds = new Set<number>();

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

      // lastStatusUpdatedAt is stored as ms in the NUXT payload
      const lastUpdatedRaw = (rec as Record<string, unknown>).lastStatusUpdatedAt;
      const lastUpdatedMs =
        typeof lastUpdatedRaw === "number" && lastUpdatedRaw > 0
          ? (raw[lastUpdatedRaw] as number | null) ?? 0
          : 0;

      // createdAt is stored as unix seconds in the NUXT payload
      const createdAtRaw = (rec as Record<string, unknown>).createdAt;
      const createdAtSec =
        typeof createdAtRaw === "number" && createdAtRaw > 0
          ? (raw[createdAtRaw] as number | null) ?? 0
          : 0;

      // Resolve externalReference — present for "added by" (bring-a-friend) entries
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
          entries.push({
            userId: typeof userId === "number" && userId > 0 ? userId : null,
            createdAt: createdAtSec,
            lastStatusUpdatedAt: lastUpdatedMs,
            isSynthetic: true,
            syntheticName: name.trim(),
            syntheticGender: typeof gender === "string" ? gender : "",
          });
        }
        // Skip — do not also add the adder's userId to the fetch set
        continue;
      }

      if (typeof userId === "number" && userId > 0 && !seenUserIds.has(userId)) {
        seenUserIds.add(userId);
        entries.push({
          userId,
          createdAt: createdAtSec,
          lastStatusUpdatedAt: lastUpdatedMs,
          isSynthetic: false,
        });
      }
    }
  }

  // Sort by lastStatusUpdatedAt ASC — first confirmed appears first, matching Reclub's display order.
  // Phoebe (organizer, confirmed days ago) → first. Nadya (just confirmed from waitlist) → last.
  entries.sort((a, b) => a.lastStatusUpdatedAt - b.lastStatusUpdatedAt);

  const BATCH = 50;
  const realIds = entries.filter((e) => !e.isSynthetic && e.userId !== null).map((e) => e.userId as number);
  const playerMap = new Map<number, { name: string; imageUrl: string; gender: string }>();

  for (let i = 0; i < realIds.length; i += BATCH) {
    if (i > 0) await sleep(300);

    const batch = realIds.slice(i, i + BATCH);
    const ids = batch.join(",");
    const data = (await reclubApiFetch(
      `/players/userIds?userIds=${ids}&scopes=BASIC_PROFILE`
    )) as { players?: Array<{ userId: number; name: string; imageUrl: string; gender: string }> };

    for (const p of data.players ?? []) {
      playerMap.set(p.userId, { name: p.name, imageUrl: p.imageUrl, gender: p.gender ?? "" });
    }
  }

  // Build final player list in sorted order, resolving profiles for real players
  const players: ReclubPlayer[] = [];
  for (const entry of entries) {
    if (entry.isSynthetic) {
      players.push({
        reclubUserId: null,
        name: entry.syntheticName!,
        avatarUrl: "",
        isDefaultAvatar: true,
        gender: entry.syntheticGender ?? "",
        isAddedByFriend: true,
      });
    } else if (entry.userId !== null) {
      const profile = playerMap.get(entry.userId);
      if (profile) {
        players.push({
          reclubUserId: entry.userId,
          name: profile.name,
          avatarUrl: profile.imageUrl,
          isDefaultAvatar: profile.imageUrl.includes(DEFAULT_AVATAR_HOST),
          gender: profile.gender,
        });
      }
    }
  }

  const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  const eventName = titleMatch
    ? titleMatch[1].replace(/ \| Reclub$/i, "").trim()
    : referenceCode;

  return { eventName, players };
}

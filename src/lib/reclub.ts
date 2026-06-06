const RECLUB_API = "https://api.reclub.co";

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
  { groupId: 6648, name: "002 Pickleball Club (Thao Dien)", slug: "002-pickleball-club" },
  { groupId: 427921, name: "3UP Club", slug: "3up-club" },
  { groupId: 30158, name: "Ace Squad Pickleball", slug: "pickleballacesquad" },
  { groupId: 14164, name: "Aspire Drill Club", slug: "aspire" },
  { groupId: 11186, name: "Big Balls Pickle Club", slug: "big" },
  { groupId: 22476, name: "Elite Sport Pickleball @Pacific", slug: "js-pickleball-club" },
  { groupId: 26728, name: "GOPICK Lương Định Của", slug: "gopick-pickleball-club-250ldc" },
  { groupId: 298257, name: "NEXT11 Pickleball Club", slug: "next11-pickleball-club" },
  { groupId: 326472, name: "The MM Pickleball Club", slug: "the-mm-pickleball-club" },
  { groupId: 104121, name: "Top One", slug: "top-one" },
];

const DEFAULT_AVATAR_HOST = "d1upr18ac2olqz.cloudfront.net/default-avatars";

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function reclubApiFetch(path: string, retryOn429 = true): Promise<unknown> {
  const url = path.startsWith("http") ? path : `${RECLUB_API}${path}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  const res = await fetch(url, { headers: RECLUB_HEADERS, signal: controller.signal });
  clearTimeout(timeout);

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
  /** null for guests/friends added by another user (no own Reclub account involved) */
  reclubUserId: number | null;
  name: string;
  avatarUrl: string;
  isDefaultAvatar: boolean;
  gender: string;
  /** true when added as a +1 by another Reclub user (bring-a-friend, referenceType=3) */
  isAddedByFriend?: boolean;
}

// Shape returned by GET /meets/by-ref/{referenceCode}
interface ByRefParticipant {
  referenceType: number; // 1=own account, 2=guest(no account), 3=added-by-friend
  referenceId: number | null;
  externalReference: { name?: string; gender?: string; level?: number } | null;
  status: number; // 1=confirmed, 3=waitlist, others=not confirmed
  lastStatusUpdatedAt: number; // ms epoch
  createdAt: number; // unix seconds
}

interface ByRefMeet {
  name: string;
  participants: ByRefParticipant[];
}

export async function fetchReclubRoster(
  referenceCode: string
): Promise<{ eventName: string; players: ReclubPlayer[] }> {
  // Single API call replaces the old HTML-scraping approach.
  // Reclub stopped embedding participant data in __NUXT_DATA__ (as of ~June 2026).
  const meet = (await reclubApiFetch(
    `/meets/by-ref/${referenceCode}`
  )) as ByRefMeet;

  const confirmed = meet.participants.filter((p) => p.status === 1);

  // Sort by lastStatusUpdatedAt ASC — first confirmed first, matching Reclub's display order.
  confirmed.sort((a, b) => a.lastStatusUpdatedAt - b.lastStatusUpdatedAt);

  // Separate own-account users from synthetic (added-by-friend / guests)
  const ownUserIds: number[] = [];
  const seenIds = new Set<number>();
  for (const p of confirmed) {
    // referenceType 3 = added-by-friend (has externalReference.name)
    // referenceType 2 = guest with no Reclub account (referenceId is the adder's id)
    // referenceType 1 = own account
    if (p.referenceType === 3 && p.externalReference?.name) continue; // synthetic, skip profile fetch
    if (typeof p.referenceId === "number" && p.referenceId > 0 && !seenIds.has(p.referenceId)) {
      seenIds.add(p.referenceId);
      ownUserIds.push(p.referenceId);
    }
  }

  // Batch-fetch profiles for own-account users
  const BATCH = 50;
  const playerMap = new Map<number, { name: string; imageUrl: string; gender: string }>();
  for (let i = 0; i < ownUserIds.length; i += BATCH) {
    if (i > 0) await sleep(300);
    const ids = ownUserIds.slice(i, i + BATCH).join(",");
    const data = (await reclubApiFetch(
      `/players/userIds?userIds=${ids}&scopes=BASIC_PROFILE`
    )) as { players?: Array<{ userId: number; name: string; imageUrl: string; gender: string }> };
    for (const p of data.players ?? []) {
      playerMap.set(p.userId, { name: p.name, imageUrl: p.imageUrl, gender: p.gender ?? "" });
    }
  }

  const players: ReclubPlayer[] = [];
  for (const p of confirmed) {
    if (p.referenceType === 3 && p.externalReference?.name) {
      // Added-by-friend — use the name from externalReference, no Reclub profile to fetch
      players.push({
        reclubUserId: null,
        name: p.externalReference.name.trim(),
        avatarUrl: "",
        isDefaultAvatar: true,
        gender: p.externalReference.gender ?? "",
        isAddedByFriend: true,
      });
    } else if (typeof p.referenceId === "number" && p.referenceId > 0) {
      const profile = playerMap.get(p.referenceId);
      if (profile) {
        players.push({
          reclubUserId: p.referenceId,
          name: profile.name,
          avatarUrl: profile.imageUrl,
          isDefaultAvatar: profile.imageUrl.includes(DEFAULT_AVATAR_HOST),
          gender: profile.gender,
        });
      }
    }
  }

  return { eventName: meet.name, players };
}

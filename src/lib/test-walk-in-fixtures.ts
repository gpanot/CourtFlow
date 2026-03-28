/**
 * Staff check-in "Create 5" demo data: real-style names, fixed local avatars
 * under /public/test-avatars/, and fictional US (+1 555…) phones.
 */

export const TEST_WALK_IN_AVATAR_PATHS = [
  "/test-avatars/00.jpg",
  "/test-avatars/01.jpg",
  "/test-avatars/02.jpg",
  "/test-avatars/03.jpg",
  "/test-avatars/04.jpg",
  "/test-avatars/05.jpg",
  "/test-avatars/06.jpg",
  "/test-avatars/07.jpg",
  "/test-avatars/08.jpg",
  "/test-avatars/09.jpg",
  "/test-avatars/10.jpg",
  "/test-avatars/11.jpg",
  "/test-avatars/12.jpg",
  "/test-avatars/13.jpg",
  "/test-avatars/14.jpg",
  "/test-avatars/15.jpg",
  "/test-avatars/16.jpg",
  "/test-avatars/17.jpg",
  "/test-avatars/18.jpg",
  "/test-avatars/19.jpg",
] as const;

export type TestWalkInGender = "male" | "female";

export interface TestWalkInProfile {
  name: string;
  gender: TestWalkInGender;
}

/** Pool of realistic display names (not "Test …"), paired with gender for check-in. */
export const TEST_WALK_IN_PROFILES: readonly TestWalkInProfile[] = [
  { name: "James Wilson", gender: "male" },
  { name: "Sarah Martinez", gender: "female" },
  { name: "Michael Chen", gender: "male" },
  { name: "Emily Johnson", gender: "female" },
  { name: "David Ortiz", gender: "male" },
  { name: "Priya Sharma", gender: "female" },
  { name: "Daniel Kim", gender: "male" },
  { name: "Olivia Brown", gender: "female" },
  { name: "Marcus Thompson", gender: "male" },
  { name: "Hannah Lee", gender: "female" },
  { name: "Ryan O'Connor", gender: "male" },
  { name: "Ashley Davis", gender: "female" },
  { name: "Kevin Nguyen", gender: "male" },
  { name: "Rachel Green", gender: "female" },
  { name: "Brandon Scott", gender: "male" },
  { name: "Nicole Anderson", gender: "female" },
  { name: "Tyler Washington", gender: "male" },
  { name: "Megan Foster", gender: "female" },
  { name: "Jordan Mitchell", gender: "male" },
  { name: "Lauren Wright", gender: "female" },
  { name: "Ethan Brooks", gender: "male" },
  { name: "Sophia Rivera", gender: "female" },
  { name: "Andrew Phillips", gender: "male" },
  { name: "Victoria Hayes", gender: "female" },
  { name: "Christopher Bell", gender: "male" },
  { name: "Jennifer Cole", gender: "female" },
  { name: "Nathan Price", gender: "male" },
  { name: "Amanda Turner", gender: "female" },
  { name: "Justin Ramirez", gender: "male" },
  { name: "Stephanie Ward", gender: "female" },
  { name: "Eric Patterson", gender: "male" },
  { name: "Michelle Hughes", gender: "female" },
  { name: "Steven Flores", gender: "male" },
  { name: "Kimberly Simmons", gender: "female" },
  { name: "Gregory Butler", gender: "male" },
  { name: "Christina Russell", gender: "female" },
  { name: "Benjamin Powell", gender: "male" },
  { name: "Rebecca Long", gender: "female" },
  { name: "Samuel Griffin", gender: "male" },
  { name: "Laura Perry", gender: "female" },
];

function shuffleInPlace<T>(arr: T[]): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

/**
 * Pick up to `count` profiles whose names are not already in the session queue (case-insensitive).
 * If the pool is exhausted, appends " (2)", " (3)", … to still return `count` entries.
 */
export function pickTestWalkInProfiles(count: number, queueNamesLower: string[]): TestWalkInProfile[] {
  const blocked = new Set(
    queueNamesLower.map((s) => s.trim().toLowerCase()).filter(Boolean)
  );
  const available = TEST_WALK_IN_PROFILES.filter((p) => !blocked.has(p.name.toLowerCase()));
  shuffleInPlace(available);
  const out: TestWalkInProfile[] = [];
  while (out.length < count && available.length > 0) {
    out.push(available.pop()!);
  }
  let suffix = 2;
  let guard = 0;
  while (out.length < count && guard < 10_000) {
    guard++;
    const base = TEST_WALK_IN_PROFILES[out.length % TEST_WALK_IN_PROFILES.length]!;
    const name =
      suffix < 1_000_000
        ? `${base.name} (${suffix})`
        : `${base.name} ·${crypto.randomUUID().slice(0, 8)}`;
    suffix++;
    if (!blocked.has(name.toLowerCase())) {
      blocked.add(name.toLowerCase());
      out.push({ name, gender: base.gender });
    }
  }
  return out.slice(0, count);
}

/** Fictional NANP number in +1 555-XXXXXXX form (555 reserved for fictitious use). */
export function randomFictionalUsE164Phone(): string {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  const n = buf[0]! % 10_000_000;
  return `+1555${String(n).padStart(7, "0")}`;
}

export function testWalkInAvatarForSlot(slotIndex: number): string {
  return TEST_WALK_IN_AVATAR_PATHS[slotIndex % TEST_WALK_IN_AVATAR_PATHS.length]!;
}

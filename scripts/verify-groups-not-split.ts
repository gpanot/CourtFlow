/**
 * Standalone verification: 20-player scenarios for rotation group logic.
 * Does not use the database or your dev server — safe to run while you test elsewhere.
 *
 * Run: npx tsx scripts/verify-groups-not-split.ts
 */

import type { QueueCandidate } from "../src/lib/algorithm";
import { findGroupWithFill, selectBestFour } from "../src/lib/algorithm";

const ZERO_COUNTS = { men: 0, women: 0, mixed: 0 } as const;

function mk(
  i: number,
  gender: string,
  groupId: string | null,
  tMs: number
): QueueCandidate {
  return {
    entryId: `e-${i}`,
    playerId: `p-${i}`,
    playerName: `Player ${i}`,
    skillLevel: "intermediate",
    gender,
    groupId,
    joinedAt: new Date(tMs),
    totalPlayMinutesToday: 0,
    rankingScore: 200,
  };
}

/** If any member of a group appears in `picked`, every member of that group in `all` must appear in `picked`. */
function assertNoPartialGroup(all: QueueCandidate[], picked: QueueCandidate[], label: string): void {
  const byGroup = new Map<string, QueueCandidate[]>();
  for (const p of all) {
    if (!p.groupId) continue;
    const arr = byGroup.get(p.groupId) ?? [];
    arr.push(p);
    byGroup.set(p.groupId, arr);
  }
  const pickedIds = new Set(picked.map((p) => p.playerId));
  for (const [gid, members] of byGroup) {
    const nPick = members.filter((m) => pickedIds.has(m.playerId)).length;
    if (nPick === 0) continue;
    if (nPick !== members.length) {
      throw new Error(
        `${label}: group ${gid} would be split (${nPick}/${members.length} in pick). ` +
          `Picked: ${picked.map((p) => p.playerId).join(", ")}`
      );
    }
  }
}

function assertSameIds(a: string[], b: string[], label: string): void {
  const sa = [...a].sort().join(",");
  const sb = [...b].sort().join(",");
  if (sa !== sb) throw new Error(`${label}: expected [${sb}], got [${sa}]`);
}

function run(): void {
  const t0 = Date.UTC(2026, 0, 1, 12, 0, 0);

  // --- 20 players: earliest is a full group of 4 (all male), then 16 solo males ---
  const gFull = "grp-full";
  const scenario1: QueueCandidate[] = [];
  let idx = 0;
  for (let j = 0; j < 4; j++) scenario1.push(mk(idx++, "male", gFull, t0 + j));
  for (let j = 0; j < 16; j++) scenario1.push(mk(idx++, "male", null, t0 + 100 + j));

  const pick1 = findGroupWithFill(scenario1);
  if (!pick1) throw new Error("scenario1: expected findGroupWithFill to return a foursome");
  assertNoPartialGroup(scenario1, pick1, "scenario1");
  const gFullMembers = scenario1.filter((p) => p.groupId === gFull).map((p) => p.playerId);
  assertSameIds(
    pick1.map((p) => p.playerId),
    gFullMembers,
    "scenario1 full group of 4"
  );

  // --- 20 players: group of 3 (2M+1F) first, solos include females to fill to 2M+2F ---
  const g3 = "grp-three";
  const scenario2: QueueCandidate[] = [];
  idx = 0;
  scenario2.push(mk(idx++, "male", g3, t0));
  scenario2.push(mk(idx++, "male", g3, t0 + 1));
  scenario2.push(mk(idx++, "female", g3, t0 + 2));
  for (let j = 0; j < 4; j++) scenario2.push(mk(idx++, "female", null, t0 + 10 + j));
  for (let j = 0; j < 13; j++) scenario2.push(mk(idx++, "male", null, t0 + 50 + j));

  const pick2 = findGroupWithFill(scenario2);
  if (!pick2) throw new Error("scenario2: expected findGroupWithFill to return a foursome");
  if (pick2.length !== 4) throw new Error("scenario2: expected 4 players");
  assertNoPartialGroup(scenario2, pick2, "scenario2");
  const g3Ids = new Set(scenario2.filter((p) => p.groupId === g3).map((p) => p.playerId));
  const pick2Group = pick2.filter((p) => p.groupId === g3);
  if (pick2Group.length !== 3) throw new Error("scenario2: expected all 3 group members in pick");
  for (const p of pick2Group) {
    if (!g3Ids.has(p.playerId)) throw new Error("scenario2: unexpected group member");
  }

  // --- 20 players: two groups of 2 (earliest + 2 solos = 4M); second group must not appear ---
  const ga = "grp-a";
  const gb = "grp-b";
  const scenario3: QueueCandidate[] = [];
  idx = 0;
  scenario3.push(mk(idx++, "male", ga, t0));
  scenario3.push(mk(idx++, "male", ga, t0 + 1));
  scenario3.push(mk(idx++, "male", gb, t0 + 5));
  scenario3.push(mk(idx++, "male", gb, t0 + 6));
  for (let j = 0; j < 16; j++) scenario3.push(mk(idx++, "male", null, t0 + 20 + j));

  const pick3 = findGroupWithFill(scenario3);
  if (!pick3) throw new Error("scenario3: expected a pick");
  assertNoPartialGroup(scenario3, pick3, "scenario3");
  const gbIds = new Set(scenario3.filter((p) => p.groupId === gb).map((p) => p.playerId));
  for (const p of pick3) {
    if (gbIds.has(p.playerId)) throw new Error("scenario3: second group must not mix into first fill");
  }

  // --- Solo path (as runRotation does): only entries with groupId null ---
  const scenario4: QueueCandidate[] = [];
  idx = 0;
  for (let j = 0; j < 16; j++) scenario4.push(mk(idx++, "male", null, t0 + j));
  const gLate = "grp-late";
  for (let j = 0; j < 4; j++) scenario4.push(mk(idx++, "male", gLate, t0 + 200 + j));

  const solosOnly = scenario4.filter((c) => !c.groupId);
  const pick4 = selectBestFour(solosOnly, { ...ZERO_COUNTS }, null);
  if (!pick4) throw new Error("scenario4: expected selectBestFour for solos");
  if (pick4.some((p) => p.groupId)) throw new Error("scenario4: solo path must not select grouped players");
  assertNoPartialGroup(scenario4, pick4, "scenario4");

  // --- Documentation: unfiltered selectBestFour can split groups (FIFO prefers early indices) ---
  const gSplitDemo = "grp-split-demo";
  const scenario5: QueueCandidate[] = [];
  idx = 0;
  scenario5.push(mk(idx++, "male", null, t0));
  scenario5.push(mk(idx++, "male", null, t0 + 1));
  for (let j = 0; j < 4; j++) scenario5.push(mk(idx++, "male", gSplitDemo, t0 + 2 + j));
  for (let j = 0; j < 14; j++) scenario5.push(mk(idx++, "male", null, t0 + 20 + j));

  const pickUnfiltered = selectBestFour(scenario5, { ...ZERO_COUNTS }, null);
  if (!pickUnfiltered) throw new Error("scenario5: expected selectBestFour");
  let caughtSplit = false;
  try {
    assertNoPartialGroup(scenario5, pickUnfiltered, "unfiltered selectBestFour");
  } catch {
    caughtSplit = true;
  }
  if (!caughtSplit) {
    throw new Error(
      "scenario5: expected unfiltered selectBestFour to split a group with this fixture (algorithm changed?)"
    );
  }

  console.log("verify-groups-not-split: all checks passed (20-player scenarios + solo path).");
  console.log("  Note: unfiltered selectBestFour can split groups; runRotation uses solo-only candidates.");
}

run();

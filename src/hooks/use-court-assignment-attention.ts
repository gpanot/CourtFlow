"use client";

import { useEffect, useRef } from "react";
import {
  playAssignmentAttentionSound,
  primeAssignmentSoundAudio,
} from "@/lib/assignment-attention-sound";

type CourtAssignmentLite = {
  status: string;
  assignment: { id: string } | null;
  players: unknown[];
};

const ACTIVE_STATUSES = new Set(["active", "warmup"]);

function assignmentIdsFromCourts(courts: CourtAssignmentLite[]): Set<string> {
  const ids = new Set<string>();
  for (const court of courts) {
    if (!ACTIVE_STATUSES.has(court.status)) continue;
    if (!court.assignment?.id) continue;
    if (court.players.length < 4) continue;
    ids.add(court.assignment.id);
  }
  return ids;
}

export function useCourtAssignmentAttention(courts: CourtAssignmentLite[]) {
  const initializedRef = useRef(false);
  const prevIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const unlock = () => {
      void primeAssignmentSoundAudio();
    };
    window.addEventListener("pointerdown", unlock, { passive: true });
    window.addEventListener("keydown", unlock, { passive: true });
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);

  useEffect(() => {
    const currentIds = assignmentIdsFromCourts(courts);
    if (!initializedRef.current) {
      initializedRef.current = true;
      prevIdsRef.current = currentIds;
      return;
    }

    let hasNewAssignment = false;
    for (const id of currentIds) {
      if (!prevIdsRef.current.has(id)) {
        hasNewAssignment = true;
        break;
      }
    }

    prevIdsRef.current = currentIds;

    if (hasNewAssignment) {
      void playAssignmentAttentionSound();
    }
  }, [courts]);
}

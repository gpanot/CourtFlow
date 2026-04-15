"use client";

export type AssignmentAttentionSoundId =
  | "checkout_ding"
  | "airport_chime"
  | "front_desk_bell"
  | "notification_chime"
  | "doorbell_notification";

type SynthTone = {
  freq: number;
  start: number;
  duration: number;
  gain: number;
  type?: OscillatorType;
};

type AssignmentSoundOption = {
  id: AssignmentAttentionSoundId;
  name: string;
  kind: "synth" | "file";
  fileName?: string;
  tones?: SynthTone[];
};

const SOUND_STORAGE_KEY = "courtflow-assignment-sound-id";
const DEFAULT_SOUND_ID: AssignmentAttentionSoundId = "checkout_ding";

export const ASSIGNMENT_ATTENTION_SOUND_OPTIONS: AssignmentSoundOption[] = [
  {
    id: "checkout_ding",
    name: "Checkout Ding",
    kind: "synth",
    tones: [
      { freq: 1046, start: 0, duration: 0.14, gain: 0.24, type: "sine" },
      { freq: 1318, start: 0.12, duration: 0.2, gain: 0.24, type: "triangle" },
      { freq: 1567, start: 0.26, duration: 0.32, gain: 0.22, type: "sine" },
    ],
  },
  {
    id: "airport_chime",
    name: "Airport Gate Chime",
    kind: "synth",
    tones: [
      { freq: 659, start: 0, duration: 0.2, gain: 0.24, type: "triangle" },
      { freq: 831, start: 0.18, duration: 0.24, gain: 0.24, type: "triangle" },
      { freq: 988, start: 0.4, duration: 0.38, gain: 0.2, type: "sine" },
    ],
  },
  {
    id: "front_desk_bell",
    name: "Front Desk Bell",
    kind: "synth",
    tones: [
      { freq: 1318, start: 0, duration: 0.1, gain: 0.26, type: "square" },
      { freq: 1760, start: 0.08, duration: 0.14, gain: 0.22, type: "triangle" },
      { freq: 1174, start: 0.24, duration: 0.5, gain: 0.16, type: "sine" },
    ],
  },
  {
    id: "notification_chime",
    name: "Notification Chime",
    kind: "file",
    fileName: "202029__hykenfreak__notification-chime.mp3",
  },
  {
    id: "doorbell_notification",
    name: "Doorbell Notification",
    kind: "file",
    fileName: "415763__thebuilder15__doorbell-notification.mp3",
  },
];

let audioContext: AudioContext | null = null;

function ensureAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const AudioContextCtor =
    window.AudioContext ??
    (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextCtor) return null;
  if (!audioContext) audioContext = new AudioContextCtor();
  return audioContext;
}

function resolveSoundId(raw: string | null | undefined): AssignmentAttentionSoundId {
  const ids = new Set(ASSIGNMENT_ATTENTION_SOUND_OPTIONS.map((s) => s.id));
  if (raw && ids.has(raw as AssignmentAttentionSoundId)) {
    return raw as AssignmentAttentionSoundId;
  }
  return DEFAULT_SOUND_ID;
}

function getSoundOptionById(id: AssignmentAttentionSoundId): AssignmentSoundOption {
  return (
    ASSIGNMENT_ATTENTION_SOUND_OPTIONS.find((s) => s.id === id) ??
    ASSIGNMENT_ATTENTION_SOUND_OPTIONS[0]
  );
}

async function playSynthSound(option: AssignmentSoundOption) {
  const ctx = ensureAudioContext();
  if (!ctx || !option.tones || option.tones.length === 0) return;
  if (ctx.state === "suspended") {
    try {
      await ctx.resume();
    } catch {
      return;
    }
  }

  const now = ctx.currentTime;
  for (const tone of option.tones) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = tone.type ?? "sine";
    osc.frequency.setValueAtTime(tone.freq, now + tone.start);

    gain.gain.setValueAtTime(0.0001, now + tone.start);
    gain.gain.exponentialRampToValueAtTime(tone.gain, now + tone.start + 0.02);
    gain.gain.exponentialRampToValueAtTime(
      0.0001,
      now + tone.start + tone.duration
    );

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now + tone.start);
    osc.stop(now + tone.start + tone.duration);
  }
}

async function playFileSound(option: AssignmentSoundOption) {
  if (typeof window === "undefined" || !option.fileName) return;
  const audio = new Audio(`/api/sounds/${encodeURIComponent(option.fileName)}`);
  audio.volume = 1;
  audio.preload = "auto";
  try {
    await audio.play();
  } catch {
    await playSynthSound(getSoundOptionById(DEFAULT_SOUND_ID));
  }
}

export function getStoredAssignmentSoundId(): AssignmentAttentionSoundId {
  if (typeof window === "undefined") return DEFAULT_SOUND_ID;
  try {
    return resolveSoundId(localStorage.getItem(SOUND_STORAGE_KEY));
  } catch {
    return DEFAULT_SOUND_ID;
  }
}

export function setStoredAssignmentSoundId(id: AssignmentAttentionSoundId) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(SOUND_STORAGE_KEY, id);
  } catch {
    // Ignore private mode / storage disabled.
  }
}

export async function primeAssignmentSoundAudio() {
  const ctx = ensureAudioContext();
  if (!ctx) return;
  if (ctx.state === "suspended") {
    try {
      await ctx.resume();
    } catch {
      // Ignore unlock failures.
    }
  }
}

export async function playAssignmentAttentionSound(id?: AssignmentAttentionSoundId) {
  const selectedId = id ?? getStoredAssignmentSoundId();
  const option = getSoundOptionById(selectedId);
  if (option.kind === "file") {
    await playFileSound(option);
    return;
  }
  await playSynthSound(option);
}

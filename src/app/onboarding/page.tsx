"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSessionStore } from "@/stores/session-store";
import { api } from "@/lib/api-client";
import { cn } from "@/lib/cn";
import {
  Building2,
  MapPin,
  Hash,
  Pencil,
  ChevronRight,
  ChevronLeft,
  Check,
  Loader2,
  Rocket,
  Users,
  BarChart3,
  Wrench,
} from "lucide-react";

const STEPS = ["Welcome", "Your Venue", "Usage", "Pain Points"] as const;

const PLAY_FREQUENCIES = [
  { value: "daily", label: "Daily" },
  { value: "several_weekly", label: "Several times a week" },
  { value: "weekly", label: "Weekly" },
  { value: "occasionally", label: "Occasionally" },
  { value: "not_yet", label: "Not yet — planning to" },
];

const MAX_PLAYERS_OPTIONS = [
  { value: 10, label: "Less than 10" },
  { value: 20, label: "10–20" },
  { value: 40, label: "20–40" },
  { value: 60, label: "40+" },
];

const PLAY_TYPES = [
  "Open Play",
  "Leagues",
  "Lessons",
  "Tournaments",
  "Private Rentals",
];

const PAIN_POINTS = [
  { id: "courts_empty", label: "Courts sitting empty between games", icon: "🏟️" },
  { id: "unfair_rotations", label: "Unfair rotations / players complaining", icon: "⚖️" },
  { id: "staff_overwhelmed", label: "Staff overwhelmed managing the queue", icon: "😰" },
  { id: "skill_mismatch", label: "Skill mismatches ruining games", icon: "📊" },
  { id: "no_visibility", label: "No visibility into court utilization", icon: "👀" },
  { id: "long_waits", label: "Players leaving because of long waits", icon: "⏳" },
  { id: "group_management", label: "Managing groups/friends who want to play together", icon: "👥" },
];

interface OnboardingData {
  venueName: string;
  location: string;
  courtCount: number;
  courtLabels: string[];
  expectedMaxPlayers: number;
  playFrequency: string;
  playTypes: string[];
  painPoints: string[];
  painPointOther: string;
}

export default function OnboardingPage() {
  const router = useRouter();
  const { token, role, staffName, onboardingCompleted, setAuth } = useSessionStore();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [createdVenue, setCreatedVenue] = useState<{ name: string; courtCount: number } | null>(null);

  const [data, setData] = useState<OnboardingData>({
    venueName: "",
    location: "",
    courtCount: 4,
    courtLabels: ["Court 1", "Court 2", "Court 3", "Court 4"],
    expectedMaxPlayers: 20,
    playFrequency: "",
    playTypes: [],
    painPoints: [],
    painPointOther: "",
  });

  useEffect(() => {
    if (completed) return;
    if (!token || role !== "superadmin") {
      router.replace("/staff");
      return;
    }
    if (onboardingCompleted) {
      router.replace("/admin");
    }
  }, [token, role, onboardingCompleted, completed, router]);

  const updateData = (updates: Partial<OnboardingData>) =>
    setData((d) => ({ ...d, ...updates }));

  const updateCourtCount = (count: number) => {
    const clamped = Math.max(1, Math.min(20, count));
    const labels = Array.from({ length: clamped }, (_, i) =>
      data.courtLabels[i] || `Court ${i + 1}`
    );
    updateData({ courtCount: clamped, courtLabels: labels });
  };

  const updateCourtLabel = (index: number, label: string) => {
    const labels = [...data.courtLabels];
    labels[index] = label;
    updateData({ courtLabels: labels });
  };

  const togglePlayType = (type: string) => {
    updateData({
      playTypes: data.playTypes.includes(type)
        ? data.playTypes.filter((t) => t !== type)
        : [...data.playTypes, type],
    });
  };

  const togglePainPoint = (id: string) => {
    updateData({
      painPoints: data.painPoints.includes(id)
        ? data.painPoints.filter((p) => p !== id)
        : data.painPoints.length < 3
          ? [...data.painPoints, id]
          : data.painPoints,
    });
  };

  const canProceed = () => {
    switch (step) {
      case 0: return true;
      case 1: return data.venueName.trim().length > 0 && data.courtCount > 0;
      case 2: return data.playFrequency !== "";
      case 3: return data.painPoints.length > 0 || data.painPointOther.trim().length > 0;
      default: return false;
    }
  };

  const handleComplete = async () => {
    setSaving(true);
    try {
      await api.post("/api/onboarding/complete", {
        venueName: data.venueName,
        location: data.location || undefined,
        courtCount: data.courtCount,
        courtLabels: data.courtLabels,
        expectedMaxPlayers: data.expectedMaxPlayers,
        playFrequency: data.playFrequency,
        playTypes: data.playTypes,
        painPoints: data.painPoints,
        painPointOther: data.painPointOther || undefined,
      });

      setAuth({ onboardingCompleted: true });
      setCreatedVenue({ name: data.venueName, courtCount: data.courtCount });
      setCompleted(true);
    } catch {
      // Retry silently or show error
    } finally {
      setSaving(false);
    }
  };

  const next = () => {
    if (step < STEPS.length - 1) {
      setStep(step + 1);
    } else {
      handleComplete();
    }
  };

  const back = () => {
    if (step > 0) setStep(step - 1);
  };

  if (!token || role !== "superadmin") return null;

  if (completed && createdVenue) {
    return <CompletionScreen venue={createdVenue} onContinue={() => router.push("/admin/staff")} />;
  }

  return (
    <div className="flex min-h-dvh flex-col bg-neutral-950 text-white">
      {/* Progress bar */}
      <div className="border-b border-neutral-800 px-4 py-4">
        <div className="mx-auto flex max-w-lg items-center gap-2">
          {STEPS.map((label, i) => (
            <div key={label} className="flex flex-1 items-center gap-2">
              <div className="flex flex-1 flex-col items-center gap-1.5">
                <div
                  className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold transition-colors",
                    i < step
                      ? "bg-green-600 text-white"
                      : i === step
                        ? "bg-green-500 text-white"
                        : "bg-neutral-800 text-neutral-500"
                  )}
                >
                  {i < step ? <Check className="h-4 w-4" /> : i + 1}
                </div>
                <span
                  className={cn(
                    "text-[10px] font-medium transition-colors",
                    i <= step ? "text-neutral-300" : "text-neutral-600"
                  )}
                >
                  {label}
                </span>
              </div>
              {i < STEPS.length - 1 && (
                <div
                  className={cn(
                    "mb-5 h-0.5 flex-1 rounded transition-colors",
                    i < step ? "bg-green-600" : "bg-neutral-800"
                  )}
                />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Step content */}
      <div className="flex flex-1 flex-col items-center justify-center px-4 py-8">
        <div className="w-full max-w-lg">
          {step === 0 && <WelcomeStep name={staffName} />}
          {step === 1 && (
            <VenueStep
              data={data}
              onUpdate={updateData}
              onCourtCountChange={updateCourtCount}
              onCourtLabelChange={updateCourtLabel}
            />
          )}
          {step === 2 && (
            <UsageStep data={data} onUpdate={updateData} onTogglePlayType={togglePlayType} />
          )}
          {step === 3 && <PainPointsStep data={data} onTogglePainPoint={togglePainPoint} onUpdate={updateData} />}
        </div>
      </div>

      {/* Navigation */}
      <div className="border-t border-neutral-800 px-4 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
        <div className="mx-auto flex max-w-lg gap-3">
          <button
            onClick={step === 0 ? () => router.back() : back}
            className="flex items-center gap-1 rounded-xl bg-neutral-800 px-5 py-3 text-sm font-medium text-neutral-300 hover:bg-neutral-700"
          >
            <ChevronLeft className="h-4 w-4" /> Back
          </button>
          <button
            onClick={next}
            disabled={!canProceed() || saving}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-green-600 py-3.5 font-semibold text-white transition-colors hover:bg-green-500 disabled:opacity-40"
          >
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Setting up...
              </>
            ) : step === STEPS.length - 1 ? (
              <>
                Complete Setup <Rocket className="h-4 w-4" />
              </>
            ) : (
              <>
                Continue <ChevronRight className="h-4 w-4" />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------- Step Components ---------- */

function WelcomeStep({ name }: { name: string | null }) {
  return (
    <div className="flex flex-col items-center text-center">
      <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-green-600/20 text-4xl">
        🏓
      </div>
      <h2 className="text-2xl font-bold">
        Welcome{name ? `, ${name}` : ""}!
      </h2>
      <p className="mt-3 max-w-sm text-neutral-400">
        Let&apos;s set up your venue in a few quick steps. This takes about 2 minutes.
      </p>
      <div className="mt-8 grid w-full max-w-sm gap-3">
        {[
          { icon: Building2, text: "Configure your venue & courts" },
          { icon: BarChart3, text: "Tell us about your usage" },
          { icon: Wrench, text: "Identify what to improve" },
        ].map(({ icon: Icon, text }) => (
          <div key={text} className="flex items-center gap-3 rounded-xl bg-neutral-900 px-4 py-3">
            <Icon className="h-5 w-5 text-green-500" />
            <span className="text-sm text-neutral-300">{text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function VenueStep({
  data,
  onUpdate,
  onCourtCountChange,
  onCourtLabelChange,
}: {
  data: OnboardingData;
  onUpdate: (u: Partial<OnboardingData>) => void;
  onCourtCountChange: (n: number) => void;
  onCourtLabelChange: (i: number, label: string) => void;
}) {
  const [editingCourts, setEditingCourts] = useState(false);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Your Venue</h2>
        <p className="mt-1 text-neutral-400">Basic info about your facility</p>
      </div>

      <div className="space-y-4">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-neutral-300">
            <Building2 className="mr-1.5 inline h-4 w-4 text-green-500" />
            Venue name *
          </label>
          <input
            type="text"
            placeholder="e.g. Downtown Pickleball Club"
            value={data.venueName}
            onChange={(e) => onUpdate({ venueName: e.target.value })}
            className="w-full rounded-xl border border-neutral-700 bg-neutral-900 px-4 py-3 text-white placeholder:text-neutral-500 focus:border-green-500 focus:outline-none"
          />
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-neutral-300">
            <MapPin className="mr-1.5 inline h-4 w-4 text-green-500" />
            Location
          </label>
          <input
            type="text"
            placeholder="City, State (optional)"
            value={data.location}
            onChange={(e) => onUpdate({ location: e.target.value })}
            className="w-full rounded-xl border border-neutral-700 bg-neutral-900 px-4 py-3 text-white placeholder:text-neutral-500 focus:border-green-500 focus:outline-none"
          />
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-neutral-300">
            <Hash className="mr-1.5 inline h-4 w-4 text-green-500" />
            Number of courts *
          </label>
          <div className="flex items-center gap-3">
            <button
              onClick={() => onCourtCountChange(data.courtCount - 1)}
              className="flex h-10 w-10 items-center justify-center rounded-lg bg-neutral-800 text-lg font-bold text-neutral-300 hover:bg-neutral-700"
            >
              −
            </button>
            <span className="w-12 text-center text-2xl font-bold">{data.courtCount}</span>
            <button
              onClick={() => onCourtCountChange(data.courtCount + 1)}
              className="flex h-10 w-10 items-center justify-center rounded-lg bg-neutral-800 text-lg font-bold text-neutral-300 hover:bg-neutral-700"
            >
              +
            </button>
          </div>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-medium text-neutral-300">Court labels</span>
            <button
              onClick={() => setEditingCourts(!editingCourts)}
              className="flex items-center gap-1 text-xs text-green-400 hover:text-green-300"
            >
              <Pencil className="h-3 w-3" />
              {editingCourts ? "Done" : "Customize"}
            </button>
          </div>
          {editingCourts ? (
            <div className="grid grid-cols-2 gap-2">
              {data.courtLabels.map((label, i) => (
                <input
                  key={i}
                  type="text"
                  value={label}
                  onChange={(e) => onCourtLabelChange(i, e.target.value)}
                  className="rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-white focus:border-green-500 focus:outline-none"
                />
              ))}
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {data.courtLabels.map((label, i) => (
                <span
                  key={i}
                  className="rounded-lg bg-neutral-800 px-3 py-1.5 text-sm text-neutral-300"
                >
                  {label}
                </span>
              ))}
            </div>
          )}
          <p className="mt-2 text-xs text-neutral-600">You can always change this later</p>
        </div>
      </div>
    </div>
  );
}

function UsageStep({
  data,
  onUpdate,
  onTogglePlayType,
}: {
  data: OnboardingData;
  onUpdate: (u: Partial<OnboardingData>) => void;
  onTogglePlayType: (type: string) => void;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">About Your Usage</h2>
        <p className="mt-1 text-neutral-400">Help us tailor the experience for you</p>
      </div>

      <div className="space-y-5">
        <div>
          <label className="mb-2 block text-sm font-medium text-neutral-300">
            How often do you run open play? *
          </label>
          <div className="space-y-2">
            {PLAY_FREQUENCIES.map((opt) => (
              <button
                key={opt.value}
                onClick={() => onUpdate({ playFrequency: opt.value })}
                className={cn(
                  "w-full rounded-xl border px-4 py-3 text-left text-sm font-medium transition-colors",
                  data.playFrequency === opt.value
                    ? "border-green-500 bg-green-600/15 text-green-300"
                    : "border-neutral-700 text-neutral-300 hover:border-neutral-500"
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-neutral-300">
            Expected max players per session
          </label>
          <div className="grid grid-cols-2 gap-2">
            {MAX_PLAYERS_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => onUpdate({ expectedMaxPlayers: opt.value })}
                className={cn(
                  "rounded-xl border px-4 py-3 text-sm font-medium transition-colors",
                  data.expectedMaxPlayers === opt.value
                    ? "border-green-500 bg-green-600/15 text-green-300"
                    : "border-neutral-700 text-neutral-300 hover:border-neutral-500"
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-neutral-300">
            What types of play do you offer?
          </label>
          <div className="flex flex-wrap gap-2">
            {PLAY_TYPES.map((type) => (
              <button
                key={type}
                onClick={() => onTogglePlayType(type)}
                className={cn(
                  "flex items-center gap-1.5 rounded-full border px-4 py-2 text-sm font-medium transition-colors",
                  data.playTypes.includes(type)
                    ? "border-green-500 bg-green-600/15 text-green-300"
                    : "border-neutral-700 text-neutral-400 hover:border-neutral-500"
                )}
              >
                {data.playTypes.includes(type) && <Check className="h-3 w-3" />}
                {type}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function PainPointsStep({
  data,
  onTogglePainPoint,
  onUpdate,
}: {
  data: OnboardingData;
  onTogglePainPoint: (id: string) => void;
  onUpdate: (u: Partial<OnboardingData>) => void;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">What Do You Want to Fix?</h2>
        <p className="mt-1 text-neutral-400">
          Pick up to 3 problems you want CourtFlow to solve
        </p>
      </div>

      <div className="space-y-2">
        {PAIN_POINTS.map((pp) => {
          const selected = data.painPoints.includes(pp.id);
          const disabled = !selected && data.painPoints.length >= 3;
          return (
            <button
              key={pp.id}
              onClick={() => onTogglePainPoint(pp.id)}
              disabled={disabled}
              className={cn(
                "flex w-full items-center gap-3 rounded-xl border px-4 py-3.5 text-left transition-colors",
                selected
                  ? "border-green-500 bg-green-600/15"
                  : disabled
                    ? "cursor-not-allowed border-neutral-800 opacity-40"
                    : "border-neutral-700 hover:border-neutral-500"
              )}
            >
              <span className="text-lg">{pp.icon}</span>
              <span
                className={cn(
                  "flex-1 text-sm font-medium",
                  selected ? "text-green-300" : "text-neutral-300"
                )}
              >
                {pp.label}
              </span>
              {selected && (
                <div className="flex h-5 w-5 items-center justify-center rounded-full bg-green-600">
                  <Check className="h-3 w-3 text-white" />
                </div>
              )}
            </button>
          );
        })}
      </div>

      <div>
        <label className="mb-1.5 block text-sm font-medium text-neutral-300">
          💬 Anything else?
        </label>
        <textarea
          placeholder="Tell us about other challenges you face..."
          value={data.painPointOther}
          onChange={(e) => onUpdate({ painPointOther: e.target.value })}
          rows={3}
          className="w-full rounded-xl border border-neutral-700 bg-neutral-900 px-4 py-3 text-sm text-white placeholder:text-neutral-500 focus:border-green-500 focus:outline-none resize-none"
        />
      </div>

      <p className="text-xs text-neutral-600">
        {data.painPoints.length}/3 selected
      </p>
    </div>
  );
}

/* ---------- Completion Screen ---------- */

function CompletionScreen({
  venue,
  onContinue,
}: {
  venue: { name: string; courtCount: number };
  onContinue: () => void;
}) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-neutral-950 p-6 text-center">
      <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-green-600/20">
        <Check className="h-10 w-10 text-green-500" />
      </div>
      <h1 className="text-3xl font-bold text-white">Your Venue Is Ready!</h1>
      <p className="mt-2 text-neutral-400">
        <strong className="text-white">{venue.name}</strong> with{" "}
        <strong className="text-white">{venue.courtCount} courts</strong> has been created.
      </p>

      <div className="mt-8 w-full max-w-sm space-y-3">
        <button
          onClick={onContinue}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-green-600 py-3.5 font-semibold text-white transition-colors hover:bg-green-500"
        >
          <Users className="h-5 w-5" />
          Add a Staff to Manage This Venue
        </button>
        <a
          href="/admin"
          className="block w-full rounded-xl border border-neutral-700 py-3.5 text-center text-sm font-medium text-neutral-400 transition-colors hover:border-neutral-500 hover:text-white"
        >
          Go to Dashboard
        </a>
      </div>
    </div>
  );
}

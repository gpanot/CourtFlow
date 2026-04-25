"use client";

import { useState } from "react";
import { ArrowLeft, Loader2 } from "lucide-react";
import { cn } from "@/lib/cn";

interface RegistrationFormProps {
  phone?: string;
  onSubmit: (data: {
    name: string;
    phone: string;
    gender: string;
    skillLevel: string;
  }) => void;
  onBack: () => void;
}

const GENDERS = [
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
];

const LEVELS = [
  { value: "beginner", label: "Beginner" },
  { value: "intermediate", label: "Intermediate" },
  { value: "advanced", label: "Advanced" },
];

export function RegistrationForm({ phone: initPhone, onSubmit, onBack }: RegistrationFormProps) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState(initPhone || "");
  const [gender, setGender] = useState("");
  const [skillLevel, setSkillLevel] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = () => {
    if (!name.trim()) { setError("Name is required"); return; }
    if (!phone.trim() || phone.length < 8) { setError("Valid phone number required"); return; }
    if (!gender) { setError("Please select gender"); return; }
    if (!skillLevel) { setError("Please select skill level"); return; }
    onSubmit({ name: name.trim(), phone: phone.trim(), gender, skillLevel });
  };

  return (
    <div className="flex flex-col px-6 py-8 relative">
      <button
        onClick={onBack}
        className="absolute left-4 top-4 rounded-lg p-2 text-neutral-400 hover:bg-neutral-800 hover:text-white"
      >
        <ArrowLeft className="h-6 w-6" />
      </button>

      <h2 className="text-xl font-bold text-white text-center mt-4">
        New Player Registration
      </h2>

      <div className="mt-8 space-y-5 max-w-sm mx-auto w-full">
        <div>
          <label className="block text-sm font-medium text-neutral-300 mb-1">
            Name (same as Reclub)
          </label>
          <input
            value={name}
            onChange={(e) => { setName(e.target.value); setError(""); }}
            className="w-full rounded-xl border border-neutral-700 bg-neutral-900 px-4 py-3 text-white placeholder-neutral-500 focus:border-purple-500 focus:outline-none text-lg"
            placeholder="Your name"
            autoFocus
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-neutral-300 mb-1">Phone</label>
          <input
            value={phone}
            onChange={(e) => { setPhone(e.target.value); setError(""); }}
            type="tel"
            className="w-full rounded-xl border border-neutral-700 bg-neutral-900 px-4 py-3 text-white placeholder-neutral-500 focus:border-purple-500 focus:outline-none text-lg"
            placeholder="0901234567"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-neutral-300 mb-2">Gender</label>
          <div className="flex gap-3">
            {GENDERS.map((g) => (
              <button
                key={g.value}
                onClick={() => { setGender(g.value); setError(""); }}
                className={cn(
                  "flex-1 rounded-xl border-2 py-3 text-sm font-medium transition-colors",
                  gender === g.value
                    ? g.value === "male"
                      ? "border-sky-400 bg-sky-500/35 text-sky-100"
                      : "border-rose-400 bg-rose-500/35 text-rose-100"
                    : "border-neutral-700 bg-neutral-900 text-neutral-400 hover:border-neutral-600"
                )}
              >
                {g.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-neutral-300 mb-2">Level</label>
          <div className="flex gap-2">
            {LEVELS.map((l) => (
              <button
                key={l.value}
                onClick={() => { setSkillLevel(l.value); setError(""); }}
                className={cn(
                  "flex-1 rounded-xl border-2 py-3 text-xs font-medium transition-colors",
                  skillLevel === l.value
                    ? l.value === "beginner"
                      ? "border-green-500 bg-green-500/35 text-green-50"
                      : l.value === "intermediate"
                        ? "border-red-500 bg-red-500/35 text-red-50"
                        : "border-yellow-500 bg-yellow-500/35 text-yellow-950"
                    : "border-neutral-700 bg-neutral-900 text-neutral-400 hover:border-neutral-600"
                )}
              >
                {l.label}
              </button>
            ))}
          </div>
        </div>

        {error && <p className="text-sm text-red-400 text-center">{error}</p>}

        <button
          onClick={handleSubmit}
          className="w-full rounded-xl bg-purple-600 py-3.5 text-lg font-semibold text-white hover:bg-purple-500"
        >
          Next
        </button>
      </div>
    </div>
  );
}

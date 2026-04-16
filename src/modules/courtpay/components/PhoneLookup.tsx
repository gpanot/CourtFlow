"use client";

import { useState } from "react";
import { ArrowLeft, Loader2, Delete } from "lucide-react";

interface PhoneLookupProps {
  onFound: (player: { id: string; name: string; phone: string }) => void;
  onNotFound: (phone: string) => void;
  onBack: () => void;
  venueCode: string;
}

const KEYPAD = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "del"];

export function PhoneLookup({ onFound, onNotFound, onBack, venueCode }: PhoneLookupProps) {
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleKey = (key: string) => {
    if (key === "del") {
      setPhone((p) => p.slice(0, -1));
    } else if (key && phone.length < 15) {
      setPhone((p) => p + key);
    }
    setError("");
  };

  const handleSearch = async () => {
    if (phone.length < 8) {
      setError("Please enter a valid phone number");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/courtpay/identify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ venueCode, phone }),
      });
      const data = await res.json();
      if (data.found && data.player) {
        onFound(data.player);
      } else {
        onNotFound(phone);
      }
    } catch {
      setError("Connection error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center px-6 py-8">
      <button
        onClick={onBack}
        className="absolute left-4 top-4 rounded-lg p-2 text-neutral-400 hover:bg-neutral-800 hover:text-white"
      >
        <ArrowLeft className="h-6 w-6" />
      </button>

      <h2 className="text-xl font-bold text-white">Enter your phone number</h2>

      <div className="mt-6 h-14 flex items-center justify-center">
        <span className="text-3xl font-mono font-bold text-white tracking-widest">
          {phone || <span className="text-neutral-600">_ _ _ _ _ _</span>}
        </span>
      </div>

      {error && <p className="mt-2 text-sm text-red-400">{error}</p>}

      <div className="mt-6 grid grid-cols-3 gap-3 w-full max-w-xs">
        {KEYPAD.map((key, i) => (
          <button
            key={i}
            onClick={() => handleKey(key)}
            disabled={!key}
            className={
              key === "del"
                ? "flex items-center justify-center rounded-xl bg-neutral-800 py-4 text-neutral-400 hover:bg-neutral-700 active:bg-neutral-600"
                : key
                  ? "rounded-xl bg-neutral-800 py-4 text-xl font-semibold text-white hover:bg-neutral-700 active:bg-neutral-600"
                  : "invisible"
            }
          >
            {key === "del" ? <Delete className="h-6 w-6" /> : key}
          </button>
        ))}
      </div>

      <button
        onClick={handleSearch}
        disabled={loading || phone.length < 8}
        className="mt-6 w-full max-w-xs rounded-xl bg-purple-600 py-3.5 text-lg font-semibold text-white hover:bg-purple-500 disabled:opacity-40 flex items-center justify-center gap-2"
      >
        {loading && <Loader2 className="h-5 w-5 animate-spin" />}
        Search
      </button>
    </div>
  );
}

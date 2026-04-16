"use client";

import { PackageCard } from "./PackageCard";

interface Package {
  id: string;
  name: string;
  sessions: number | null;
  durationDays: number;
  price: number;
  perks: string | null;
  isActive: boolean;
}

interface SubscriptionOfferProps {
  playerName: string;
  packages: Package[];
  isNew: boolean;
  onSelect: (packageId: string) => void;
  onSkip: () => void;
}

export function SubscriptionOffer({
  playerName,
  packages,
  isNew,
  onSelect,
  onSkip,
}: SubscriptionOfferProps) {
  const greeting = isNew
    ? `Welcome to the club, ${playerName}!`
    : `Welcome back, ${playerName}!`;
  const subtitle = isNew
    ? "Want to save with a package?"
    : "Save with a package today?";

  return (
    <div className="flex flex-col items-center px-6 py-8 text-center">
      <h2 className="text-2xl font-bold text-white">{greeting}</h2>
      <p className="mt-2 text-lg text-neutral-400">{subtitle}</p>

      <div className="mt-8 w-full max-w-sm space-y-3">
        {packages.map((pkg) => (
          <PackageCard
            key={pkg.id}
            pkg={pkg}
            onSelect={onSelect}
            compact
          />
        ))}
      </div>

      <button
        onClick={onSkip}
        className="mt-6 text-sm text-neutral-500 underline underline-offset-2 hover:text-neutral-300"
      >
        Skip — pay today only
      </button>
    </div>
  );
}

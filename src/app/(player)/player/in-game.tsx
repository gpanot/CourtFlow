"use client";

interface InGameScreenProps {
  notification: Record<string, unknown> | null;
}

export function InGameScreen({ notification }: InGameScreenProps) {
  const courtLabel = (notification?.courtLabel as string) || "Court";

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-green-950/20 p-6 text-center">
      <div className="mb-6 rounded-full bg-green-600/20 px-4 py-1 text-sm font-medium text-green-400">
        Game in progress
      </div>

      <h1 className="text-6xl font-bold text-white">{courtLabel}</h1>

      <p className="mt-6 text-2xl text-green-300">You&apos;re playing — have fun!</p>

      <p className="mt-8 text-neutral-500">Staff will end the game when the court is free</p>
    </div>
  );
}

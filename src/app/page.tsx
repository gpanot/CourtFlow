import Link from "next/link";

export default function LandingPage() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-8 p-6">
      <div className="text-center">
        <h1 className="text-5xl font-bold tracking-tight text-green-500">CourtFlow</h1>
        <p className="mt-3 text-lg text-neutral-400">Pickleball Court Management</p>
      </div>

      <div className="grid w-full max-w-sm gap-3">
        <Link
          href="/signup"
          className="flex h-14 items-center justify-center rounded-xl bg-green-600 text-lg font-semibold text-white transition-colors hover:bg-green-500"
        >
          Sign Up
        </Link>
        <Link
          href="/staff"
          className="flex h-14 items-center justify-center rounded-xl bg-blue-600 text-lg font-semibold text-white transition-colors hover:bg-blue-500"
        >
          Login
        </Link>
      </div>

      <div className="h-px w-full max-w-sm bg-neutral-800" />

      <div className="grid w-full max-w-sm gap-3">
        <Link
          href="/player"
          className="flex h-12 items-center justify-center rounded-xl bg-neutral-800 text-sm font-medium text-neutral-300 transition-colors hover:bg-neutral-700"
        >
          Player App
        </Link>
        <Link
          href="/tv"
          className="flex h-12 items-center justify-center rounded-xl bg-neutral-800 text-sm font-medium text-neutral-300 transition-colors hover:bg-neutral-700"
        >
          TV Display
        </Link>
        <Link
          href="/tv-queue"
          className="flex h-12 items-center justify-center rounded-xl bg-neutral-800 text-sm font-medium text-neutral-300 transition-colors hover:bg-neutral-700"
        >
          TV Tablet (Queue Join)
        </Link>
      </div>

      <p className="text-sm text-neutral-600">v0.1.0</p>
    </div>
  );
}

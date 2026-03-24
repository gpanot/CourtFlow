export default function PlayerLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex h-dvh max-h-dvh max-w-lg flex-col overflow-hidden bg-neutral-950">
      {children}
    </div>
  );
}

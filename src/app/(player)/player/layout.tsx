export default function PlayerLayout({ children }: { children: React.ReactNode }) {
  return (
    <div id="player-app-shell" className="fixed inset-0 z-0 overflow-hidden overscroll-none bg-neutral-950">
      <div className="mx-auto flex h-full w-full max-w-lg flex-col overflow-hidden overscroll-none">
        {children}
      </div>
    </div>
  );
}

"use client";

interface ProgressDotsProps {
  total: number;
  active: number;
}

export function ProgressDots({ total, active }: ProgressDotsProps) {
  return (
    <div className="flex items-center justify-center gap-2">
      {Array.from({ length: total }, (_, i) => (
        <span
          key={i}
          className="rounded-full transition-all duration-300"
          style={{
            width: i === active ? 8 : 6,
            height: i === active ? 8 : 6,
            backgroundColor: i === active ? "#ffffff" : "#444444",
          }}
        />
      ))}
    </div>
  );
}

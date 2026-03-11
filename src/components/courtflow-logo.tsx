import Link from "next/link";

interface CourtFlowLogoProps {
  className?: string;
  asLink?: boolean;
  linkTo?: string;
  size?: "small" | "default" | "large";
  dark?: boolean;
}

const sizeMap = { small: 24, default: 32, large: 48 };
const textMap = { small: "text-base", default: "text-xl", large: "text-3xl" };

function CourtIcon({ px }: { px: number }) {
  return (
    <svg width={px} height={px} viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="cf-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#22c55e" />
          <stop offset="100%" stopColor="#15803d" />
        </linearGradient>
      </defs>
      <rect width="512" height="512" rx="112" fill="url(#cf-bg)" />
      <rect x="156" y="106" width="200" height="300" rx="18" fill="none" stroke="white" strokeWidth="18" opacity=".95" />
      <line x1="156" y1="256" x2="356" y2="256" stroke="white" strokeWidth="14" opacity=".95" />
      <line x1="256" y1="106" x2="256" y2="256" stroke="white" strokeWidth="6" opacity=".35" />
      <line x1="256" y1="256" x2="256" y2="406" stroke="white" strokeWidth="6" opacity=".35" />
      <line x1="156" y1="196" x2="356" y2="196" stroke="white" strokeWidth="6" opacity=".45" />
      <line x1="156" y1="316" x2="356" y2="316" stroke="white" strokeWidth="6" opacity=".45" />
      <circle cx="316" cy="152" r="28" fill="white" opacity=".95" />
    </svg>
  );
}

export function CourtFlowLogo({
  className = "",
  asLink = true,
  linkTo = "/",
  size = "default",
  dark = false,
}: CourtFlowLogoProps) {
  const px = sizeMap[size];
  const textCls = `${textMap[size]} font-bold ${dark ? "text-white" : "text-gray-900"}`;

  const content = (
    <>
      <CourtIcon px={px} />
      <span className={textCls}>CourtFlow</span>
    </>
  );

  if (asLink) {
    return (
      <Link href={linkTo} className={`flex items-center gap-2.5 ${className}`}>
        {content}
      </Link>
    );
  }

  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      {content}
    </div>
  );
}

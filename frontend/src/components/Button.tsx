import Link from "next/link";

// Every button is glass: tinted and blurred, so whatever is behind it shows through.
const VARIANTS = {
  // For photo and dark backgrounds.
  glass: "glass text-white hover:bg-white/25",
  // For white and pale backgrounds, where white glass would be invisible.
  "glass-light":
    "border border-navy/30 bg-navy/8 text-navy backdrop-blur-md hover:bg-navy/15",
};

export const BUTTON_BASE =
  "inline-flex h-12 items-center justify-center gap-2.5 rounded-full px-6 text-sm font-medium transition active:scale-[0.98]";

export const GLASS_BUTTON = `${BUTTON_BASE} ${VARIANTS.glass}`;

export function ButtonLink({
  href,
  variant = "glass",
  children,
  className = "",
  onClick,
  external = false,
}: {
  href: string;
  variant?: keyof typeof VARIANTS;
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
  external?: boolean;
}) {
  const classes = `${BUTTON_BASE} ${VARIANTS[variant]} ${className}`;

  if (external) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={classes}>
        {children}
      </a>
    );
  }
  return (
    <Link href={href} onClick={onClick} className={classes}>
      {children}
    </Link>
  );
}

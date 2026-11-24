import Image from "next/image";
import { site } from "@/lib/site";

// The logo files live in public/brand/:
//   mark-bridge.png / mark-road.png       - the header mark split into its white bridge and orange road,
//                                           so the road can be animated on its own
//   mark-white.png / wordmark-white.png   - the bridge and the name, white, for dark backgrounds
//   logo-white.png                        - the full stacked logo, white, for dark backgrounds
//   logo.png / mark.png                   - navy originals, for white backgrounds and the browser tab

/**
 * Bridge mark beside the name, in one row. Used in the header.
 * On page load the bridge rises in, the orange road drives across it, then the name slides in
 * (see .logo-* in globals.css). On hover the road glows.
 */
export function LogoRow({ className = "" }: { className?: string }) {
  return (
    <span className={`group/logo flex items-center gap-2.5 ${className}`}>
      <span className="relative block h-8 w-[98px]">
        <Image
          src="/brand/mark-bridge.png"
          alt=""
          width={495}
          height={161}
          priority
          className="logo-bridge absolute inset-0 h-full w-full"
        />
        <Image
          src="/brand/mark-road.png"
          alt=""
          width={495}
          height={161}
          priority
          className="logo-road absolute inset-0 h-full w-full"
        />
      </span>
      <Image
        src="/brand/wordmark-white.png"
        alt={site.name}
        width={494}
        height={121}
        priority
        className="logo-word h-6 w-auto"
      />
    </span>
  );
}

/** The full stacked logo. Used in the footer. */
export function LogoStacked({ className = "" }: { className?: string }) {
  return (
    <Image src="/brand/logo-white.png" alt={site.name} width={495} height={304} className={`h-auto w-44 ${className}`} />
  );
}

import Image from "next/image";

/** A real plane photo, cut out of its background, set still in the hero sky. Decorative only. */
export function HeroPlane() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      {/* The photo's nose points left, so it is mirrored to fly towards the headline. */}
      <Image
        src="/images/plane.png"
        alt=""
        width={812}
        height={736}
        priority
        sizes="(min-width: 1024px) 260px, (min-width: 640px) 200px, 120px"
        className="absolute right-[6%] top-[22%] h-auto w-30 -scale-x-100 rotate-[10deg] brightness-90 drop-shadow-[0_16px_28px_rgb(0_0_0/0.4)] sm:right-[10%] sm:top-[20%] sm:w-50 lg:right-[12%] lg:w-64"
      />
    </div>
  );
}

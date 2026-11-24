import Image from "next/image";
import { site } from "@/lib/site";

/**
 * The company truck, parked and filling the full width of the band.
 * The logo is laid over the trailer's side panel.
 */
export function TruckBand() {
  return (
    <section className="relative isolate overflow-hidden bg-ink text-white" aria-label={`${site.shortName} truck`}>
      {/* Sky to road gradient */}
      <div className="absolute inset-0 -z-20 bg-linear-to-b from-ink via-navy to-ink" aria-hidden />

      <div className="mx-auto max-w-7xl px-5 pt-16 sm:px-8 sm:pt-20">
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-orange">On the road</p>
        <h2 className="mt-4 max-w-2xl text-3xl font-light leading-tight tracking-tight sm:text-5xl">
          From our hub to your door, under our own name
        </h2>
      </div>

      <div className="relative mt-10 sm:mt-14">
        {/* Road surface behind the lower part of the wheels */}
        <div className="absolute inset-x-0 bottom-0 h-[16%] bg-[#1a1f27]" aria-hidden />
        <div className="absolute inset-x-0 bottom-[16%] h-px bg-white/15" aria-hidden />

        {/* The truck, edge to edge */}
        <div className="relative w-full">
          <Image
            src="/images/truck.png"
            alt={`${site.name} truck`}
            width={1600}
            height={474}
            sizes="100vw"
            className="h-auto w-full drop-shadow-[0_24px_30px_rgb(0_0_0/0.55)]"
          />
          {/* Logo on the trailer's side panel (the panel spans roughly 33%-97% across, 8%-66% down). */}
          <div
            className="absolute flex items-center justify-center"
            style={{ left: "36%", top: "12%", width: "58%", height: "50%" }}
          >
            <Image
              src="/brand/logo.png"
              alt=""
              width={495}
              height={304}
              className="h-full w-auto opacity-90 mix-blend-multiply"
            />
          </div>
        </div>
      </div>
    </section>
  );
}

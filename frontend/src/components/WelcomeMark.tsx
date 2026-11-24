/**
 * Big "WELCOME" across the hero. Each letter rises in bold and bright, one after another,
 * holds for a moment, then fades down to a faint watermark that stays behind the content.
 * Pure CSS (see .welcome-letter in globals.css), so it starts the moment the page paints.
 */
const WORD = "WELCOME";

export function WelcomeMark() {
  return (
    <div
      className="pointer-events-none absolute inset-x-0 top-[38%] flex select-none justify-center overflow-hidden sm:top-[40%]"
      aria-hidden
    >
      <span className="text-[clamp(4.75rem,17vw,16rem)] font-black leading-[0.8] tracking-[-0.04em] text-white">
        {WORD.split("").map((letter, index) => (
          <span key={index} className="welcome-letter inline-block" style={{ animationDelay: `${250 + index * 80}ms` }}>
            {letter}
          </span>
        ))}
      </span>
    </div>
  );
}

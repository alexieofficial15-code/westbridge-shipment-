import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { WhatsAppFloat } from "@/components/WhatsAppButton";

/** Shared layout for simple text pages such as the privacy policy and terms. */
export function LegalPage({
  title,
  sections,
}: {
  title: string;
  sections: { heading: string; text: string }[];
}) {
  return (
    <>
      <SiteHeader />
      <main>
        <section className="bg-ink px-5 pb-14 pt-32 text-white sm:px-8 sm:pt-40">
          <div className="mx-auto max-w-3xl">
            <h1 className="text-5xl font-light leading-none tracking-tight sm:text-6xl">{title}</h1>
          </div>
        </section>

        <section className="px-5 py-14 sm:px-8 sm:py-20">
          <div className="mx-auto max-w-3xl space-y-10">
            {sections.map((section) => (
              <div key={section.heading}>
                <h2 className="text-2xl font-medium tracking-tight">{section.heading}</h2>
                <p className="mt-3 text-lg leading-relaxed text-ink/70">{section.text}</p>
              </div>
            ))}
          </div>
        </section>
      </main>
      <SiteFooter />
      <WhatsAppFloat />
    </>
  );
}

import Image from "next/image";
import { ButtonLink } from "@/components/Button";
import { CountUp } from "@/components/CountUp";
import { HeroPlane } from "@/components/HeroPlane";
import { Reveal } from "@/components/Reveal";
import { TruckBand } from "@/components/TruckBand";
import { WelcomeMark } from "@/components/WelcomeMark";
import { Icon, type IconName } from "@/components/Icon";
import { QuoteForm } from "@/components/QuoteForm";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { TrackingForm } from "@/components/TrackingForm";
import { WhatsAppFloat, WhatsAppLink } from "@/components/WhatsAppButton";
import { STATUS_LABELS, type ShipmentStatus } from "@/lib/api";
import { site } from "@/lib/site";

// ---- Page content. Edit the text here. ----

// The business's own figures. Update them as they change.
// Numbers count up when they scroll into view; `countFrom` sets where the count starts (default 0).
const FACTS: { value: string; label: string; countFrom?: number }[] = [
  { value: "10,000+", label: "Shipments delivered" },
  { value: "45", label: "Countries and cities served" },
  { value: "2019", label: "Moving goods since", countFrom: 2000 },
  { value: "80%", label: "Delivered on time" },
];

// PLACEHOLDER: replace with the services the business really offers.
// Photos live in public/images/services/. `focus` is which part of the photo to keep when it is cropped.
const SERVICES: { icon: IconName; title: string; text: string; image: string; focus?: string }[] = [
  { icon: "truck", title: "Road freight", text: "Scheduled road transport between cities, for single parcels and full loads.", image: "road" },
  { icon: "plane", title: "Air freight", text: "The fastest option for urgent shipments that cannot wait.", image: "air", focus: "object-[center_75%]" },
  { icon: "globe", title: "Sea freight", text: "Cost-effective shipping for large and heavy cargo.", image: "sea" },
  { icon: "home", title: "Door-to-door delivery", text: "Collected from the sender and handed over at the recipient's address.", image: "door" },
  { icon: "box", title: "Warehousing", text: "Safe storage for your goods until they are ready to move.", image: "warehouse" },
  { icon: "shield", title: "Careful handling", text: "Every shipment is scanned at each handover, so nothing goes unaccounted for.", image: "handling" },
];

// Photos live in public/images/steps/.
const STEPS = [
  {
    title: "Check your email",
    text: "As soon as your shipment is booked, we email you its tracking number. Keep that email handy.",
    image: "email",
  },
  {
    title: "Enter the number here",
    text: "Type it into the box at the top of this page. No account to create and nothing to sign up for.",
    image: "enter",
  },
  {
    title: "Follow every stop",
    text: "Your private portal opens. Watch the status change from pickup to delivery, with the time and place of each update.",
    image: "follow",
  },
];

const PORTAL_FEATURES: { icon: IconName; title: string; text: string }[] = [
  { icon: "pin", title: "Live status", text: "One clear answer to the question that matters: where is it now?" },
  { icon: "route", title: "Full journey", text: "Every scan and handover in order, each with its location and time." },
  { icon: "calendar", title: "Delivery estimate", text: "The expected arrival date, kept up to date as the shipment moves." },
  { icon: "chat", title: "Direct help", text: "A WhatsApp button that opens a chat with your tracking number already filled in." },
];

const FAQ = [
  {
    question: "Do I need an account to track a shipment?",
    answer: "No. Your tracking number is all you need. Enter it and your shipment portal opens straight away.",
  },
  {
    question: "Where do I find my tracking number?",
    answer:
      "We email it to you as soon as your shipment is booked, so search your inbox (and spam folder) for our name. If you still can't find it, message us on WhatsApp and we will look it up with you.",
  },
  {
    question: "How often is the tracking information updated?",
    answer:
      "Each time your shipment is scanned or handed over. While your portal is open it checks for new updates by itself, so you never need to refresh.",
  },
  {
    question: "My number is not being found. What should I do?",
    answer:
      "Check for typing mistakes first, since letters and digits can look alike. A newly booked shipment can also take a short while to appear. If it still isn't found, contact us on WhatsApp.",
  },
  {
    question: "Can someone else track my shipment?",
    answer:
      "Only people who have the tracking number can open its portal, so share it only with those who need it, such as the recipient.",
  },
  {
    question: "How do I get a price for a shipment?",
    answer:
      "Fill in the quote form on this page with where it's going from and to, and roughly how heavy it is. We reply on WhatsApp or email with a price and transit time.",
  },
];

// What each status on the portal means, in the order a shipment moves through them.
const STATUS_GUIDE: { status: ShipmentStatus; text: string }[] = [
  { status: "pending", text: "Booked and waiting for collection." },
  { status: "picked_up", text: "Collected by our courier and on its way to our hub." },
  { status: "in_transit", text: "Moving between our hubs towards the destination." },
  { status: "at_customs", text: "Going through customs clearance. This can add a few days on international shipments." },
  { status: "out_for_delivery", text: "With the local courier and arriving today." },
  { status: "ready_for_pickup", text: "Waiting at our nearest office for you to collect. Bring your tracking number and ID." },
  { status: "delivered", text: "Handed over at the delivery address." },
  { status: "exception", text: "Something needs attention, such as a wrong address or a customs hold. We will contact you." },
];

// The five steps every shipment goes through; the others only happen on some shipments.
const MAIN_STEPS: ShipmentStatus[] = ["pending", "picked_up", "in_transit", "out_for_delivery", "delivered"];
const GUIDE_TAGS: Partial<Record<ShipmentStatus, string>> = {
  at_customs: "International only",
  ready_for_pickup: "Instead of delivery",
  exception: "If needed",
};

// PLACEHOLDER: confirm these against what the business and its carriers actually accept.
const PROHIBITED = [
  "Flammable liquids, gases and aerosols",
  "Loose lithium batteries and power banks",
  "Weapons, ammunition and explosives",
  "Illegal drugs and unprescribed medicines",
  "Cash, bank cards and bearer documents",
  "Perishable food without approved packaging",
  "Live animals and plants",
  "Counterfeit or pirated goods",
];

const PACKING: { icon: IconName; title: string; text: string }[] = [
  { icon: "box", title: "Use a sturdy box", text: "New double-wall cardboard with at least 5 cm of padding around every side of the item." },
  { icon: "tag", title: "Label it clearly", text: "Full name, phone number and address of the receiver, inside the box as well as outside." },
  { icon: "scale", title: "Know the weight and size", text: "Weigh and measure the packed parcel; the price is based on whichever is greater, actual or volumetric weight." },
  { icon: "shield", title: "Declare what's inside", text: "An honest content description and value speeds up customs and keeps your shipment insured." },
];

// ---- Building blocks ----

// The `light` flag is kept so call sites read the same on dark and light sections; orange works on both.
function Label({ children }: { children: React.ReactNode; light?: boolean }) {
  return (
    <p className="text-xs font-medium uppercase tracking-[0.2em] text-orange">
      {children}
    </p>
  );
}

const HEADING = "text-4xl font-light leading-[1.1] tracking-tight sm:text-5xl";
// On white sections the headings take the blue; on photos they stay white.
const HEADING_NAVY = `${HEADING} text-navy`;
const SECTION = "scroll-mt-24 py-20 sm:py-28";
const CONTAINER = "mx-auto max-w-7xl px-5 sm:px-8";

/** Glass preview of a shipment portal. Clearly marked as an example. */
function ExampleCard() {
  const rows = [
    { label: "Out for delivery", time: "Pending", active: false },
    { label: "In transit to destination", time: "Today 09:14", active: true },
    { label: "Picked up by courier", time: "Yesterday 16:40", active: false },
  ];

  return (
    <div className="glass w-full max-w-sm rounded-lg p-6 text-white">
      <div className="flex items-center justify-between text-xs">
        <span className="text-white/70">Example</span>
        <span className="flex items-center gap-2 font-medium">
          <span className="size-1.5 rounded-full bg-emerald-400" />
          In transit
        </span>
      </div>

      <p className="mt-6 text-xs text-white/70">Tracking number</p>
      <p className="mt-1 font-mono text-xl">TRK-4821-KD</p>

      <div className="mt-6 flex items-center justify-between gap-3 text-sm">
        <span>Origin hub</span>
        <span className="h-px flex-1 bg-white/25" />
        <span>Your door</span>
      </div>
      <div className="mt-3 h-1 overflow-hidden rounded-full bg-white/20">
        <div className="h-full w-[62%] rounded-full bg-orange" />
      </div>

      <ul className="mt-6 space-y-3 border-t border-white/15 pt-5 text-sm">
        {rows.map((row) => (
          <li key={row.label} className="flex items-center justify-between gap-4">
            <span className={row.active ? "text-white" : "text-white/60"}>{row.label}</span>
            <span className="shrink-0 text-xs text-white/60">{row.time}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function HeroHelpLine() {
  return (
    <p className="mt-4 border-t border-white/10 pt-4 text-sm leading-relaxed text-white/70">
      No sign-up and no password. Can&apos;t find your number? Check your spam folder, or message us on WhatsApp.
    </p>
  );
}

// ---- The page ----

export default function HomePage() {
  return (
    <>
      <SiteHeader />

      <main>
        {/* Hero: headline top-left, tracking box bottom-right, nothing else.
            On phones the tracking box moves below the photo, so it never covers the ship or the WELCOME. */}
        <section id="track" className="relative isolate overflow-hidden bg-ink text-white">
          <div className="relative isolate flex min-h-[min(44rem,82svh)] flex-col sm:min-h-[min(100dvh,64rem)] sm:justify-between sm:gap-16">
            {/* A big ship at sea, with the plane set still in the sky above it. */}
            <Image
              src="/images/hero-ship.jpg"
              alt=""
              fill
              priority
              sizes="100vw"
              className="slow-zoom -z-20 object-cover object-[center_70%]"
            />
            <div className="absolute inset-0 -z-10 bg-linear-to-b from-ink/65 via-ink/20 to-ink sm:to-ink/70" aria-hidden />
            <WelcomeMark />
            <HeroPlane />

            <div className={`${CONTAINER} relative w-full pt-28 sm:pt-40`}>
              <h1 className="rise max-w-4xl text-[2.6rem] font-light leading-[1.05] tracking-tight sm:text-7xl lg:text-[5.5rem]">
                Track your shipment, <span className="text-orange">every mile of the way</span>
              </h1>
            </div>

            {/* Tablet and desktop: over the photo, bottom right. */}
            <div className={`${CONTAINER} relative hidden w-full justify-end pb-16 sm:flex`}>
              <div className="rise glass-dark w-full max-w-2xl rounded-3xl p-7" style={{ animationDelay: "150ms" }}>
                <TrackingForm id="hero-tracking-number" size="lg" />
                <HeroHelpLine />
              </div>
            </div>
          </div>

          {/* Phones: below the photo, overlapping only the dark sea at its bottom edge. */}
          <div className="relative -mt-14 px-4 pb-12 sm:hidden">
            <div className="rise glass-dark rounded-3xl p-5" style={{ animationDelay: "150ms" }}>
              <TrackingForm id="hero-tracking-number-phone" size="lg" />
              <HeroHelpLine />
            </div>
          </div>
        </section>

        {/* About */}
        <section id="about" className={SECTION}>
          <div className={CONTAINER}>
            <div className="grid gap-8 lg:grid-cols-2 lg:gap-20">
              <Reveal>
                <Label>About us</Label>
                <h2 className={`mt-5 ${HEADING_NAVY}`}>Deliveries you can follow from start to finish</h2>
              </Reveal>
              <Reveal delay={120} className="space-y-5 text-lg leading-relaxed text-ink/65 lg:pt-9">
                <p>
                  {site.shortName} moves goods from where they are to where they need to be, and keeps you informed the
                  whole way. Every shipment gets a tracking number, and that number is your key to everything.
                </p>
                <p>
                  We built tracking to be as simple as possible: no app to install and no account to remember. If you
                  ever need a person, we are one WhatsApp message away.
                </p>
              </Reveal>
            </div>

            <dl className="mt-16 grid grid-cols-2 gap-y-10 border-t border-ink/10 pt-10 lg:grid-cols-4">
              {FACTS.map((fact, index) => (
                <Reveal key={fact.label} delay={index * 90} className="flex flex-col-reverse gap-2">
                  <dt className="text-sm text-ink/55">{fact.label}</dt>
                  <dd className="text-5xl font-light tracking-tight text-navy sm:text-6xl">
                    <CountUp value={fact.value} from={fact.countFrom} />
                  </dd>
                </Reveal>
              ))}
            </dl>
          </div>
        </section>

        {/* Services */}
        <section id="services" className={`${SECTION} bg-paper`}>
          <div className={CONTAINER}>
            <Reveal>
              <Label>Services</Label>
              <h2 className={`mt-5 max-w-xl ${HEADING_NAVY}`}>Whatever you are sending, we move it</h2>
            </Reveal>

            <ul className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-3 lg:gap-8">
              {SERVICES.map((service, index) => (
                <Reveal
                  as="li"
                  key={service.title}
                  delay={(index % 3) * 100}
                  className="group rounded-3xl border border-ink/8 bg-white p-3 transition duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-navy/10"
                >
                  <div className="relative aspect-[16/10] overflow-hidden rounded-2xl">
                    <Image
                      src={`/images/services/${service.image}.jpg`}
                      alt={service.title}
                      fill
                      sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
                      className={`object-cover transition duration-500 group-hover:scale-105 ${service.focus ?? ""}`}
                    />
                  </div>
                  <div className="p-5 pb-4 sm:p-6 sm:pb-5">
                    <div className="flex items-center gap-3">
                      <Icon name={service.icon} className="size-5 text-orange" />
                      <h3 className="text-xl font-medium tracking-tight">{service.title}</h3>
                    </div>
                    <p className="mt-3 leading-relaxed text-ink/60">{service.text}</p>
                  </div>
                </Reveal>
              ))}
            </ul>
          </div>
        </section>

        {/* How it works: glass cards over a photo */}
        <section id="how-it-works" className={`${SECTION} relative isolate overflow-hidden bg-ink text-white`}>
          <Image src="/images/port.jpg" alt="" fill sizes="100vw" className="-z-20 object-cover" />
          <div className="absolute inset-0 -z-10 bg-ink/55" aria-hidden />

          <div className={CONTAINER}>
            <Reveal>
              <Label light>How it works</Label>
              <h2 className={`mt-5 max-w-xl ${HEADING}`}>Three steps from number to doorstep</h2>
            </Reveal>

            <ol className="mt-14 grid gap-6 md:grid-cols-3 lg:gap-8">
              {STEPS.map((step, index) => (
                <Reveal as="li" key={step.title} delay={index * 120} className="glass group rounded-3xl p-3">
                  <div className="relative aspect-[16/10] overflow-hidden rounded-2xl">
                    <Image
                      src={`/images/steps/${step.image}.jpg`}
                      alt={step.title}
                      fill
                      sizes="(min-width: 768px) 33vw, 100vw"
                      className="object-cover transition duration-500 group-hover:scale-105"
                    />
                    {/* Step number on the photo, in a small glass badge. */}
                    <span className="glass absolute left-4 top-4 grid size-9 place-items-center rounded-full font-mono text-sm text-orange">
                      0{index + 1}
                    </span>
                  </div>
                  <div className="p-5 pb-4 sm:p-6 sm:pb-5">
                    <h3 className="text-xl font-medium tracking-tight">{step.title}</h3>
                    <p className="mt-2 leading-relaxed text-white/80">{step.text}</p>
                  </div>
                </Reveal>
              ))}
            </ol>
          </div>
        </section>

        {/* Company truck on the road */}
        <TruckBand />

        {/* The portal */}
        <section id="portal" className={SECTION}>
          <div className={`${CONTAINER} grid gap-12 lg:grid-cols-2 lg:items-center lg:gap-20`}>
            <Reveal>
              <Label>Your portal</Label>
              <h2 className={`mt-5 ${HEADING_NAVY}`}>Everything about your shipment on one page</h2>
              <p className="mt-5 max-w-md text-lg leading-relaxed text-ink/65">
                Your tracking number opens a page made for that shipment alone, on your phone or your computer.
              </p>

              <ul className="mt-10 grid gap-x-10 gap-y-8 sm:grid-cols-2">
                {PORTAL_FEATURES.map((feature) => (
                  <li key={feature.title}>
                    <Icon name={feature.icon} className="size-5 text-orange" />
                    <h3 className="mt-3 font-medium">{feature.title}</h3>
                    <p className="mt-1 text-sm leading-relaxed text-ink/60">{feature.text}</p>
                  </li>
                ))}
              </ul>

              <ButtonLink href="/#track" variant="glass-light" className="mt-10">
                Track a shipment
              </ButtonLink>
            </Reveal>

            <Reveal
              delay={150}
              className="relative isolate grid min-h-[28rem] place-items-center overflow-hidden rounded-3xl bg-ink p-6 sm:min-h-[34rem]"
            >
              <Image
                src="/images/ship.jpg"
                alt=""
                fill
                sizes="(min-width: 1024px) 50vw, 100vw"
                className="-z-10 object-cover"
              />
              <div className="absolute inset-0 -z-10 bg-ink/35" aria-hidden />
              <ExampleCard />
            </Reveal>
          </div>
        </section>

        {/* What each status means */}
        <section id="statuses" className={`${SECTION} bg-paper`}>
          <div className={CONTAINER}>
            <Reveal className="flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
              <div>
                <Label>Status guide</Label>
                <h2 className={`mt-5 max-w-xl ${HEADING_NAVY}`}>What each status on your portal means</h2>
              </div>
              <p className="max-w-sm leading-relaxed text-ink/65">
                A shipment moves through these in order. If you ever see the last one, we are already on it.
              </p>
            </Reveal>

            <ol className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {STATUS_GUIDE.map((item, index) => {
                const dot =
                  item.status === "exception" ? "bg-red-500" : item.status === "delivered" ? "bg-emerald-500" : "bg-orange";
                return (
                  <Reveal
                    as="li"
                    key={item.status}
                    delay={(index % 3) * 90}
                    className="flex gap-4 rounded-3xl border border-ink/8 bg-white p-6"
                  >
                    <span className="mt-1.5 flex size-2.5 shrink-0 rounded-full" aria-hidden>
                      <span className={`size-2.5 rounded-full ${dot}`} />
                    </span>
                    <div>
                      <p className="font-mono text-xs text-ink/45">{GUIDE_TAGS[item.status] ?? `Step ${MAIN_STEPS.indexOf(item.status) + 1}`}</p>
                      <h3 className="mt-1 font-medium">{STATUS_LABELS[item.status]}</h3>
                      <p className="mt-1 text-sm leading-relaxed text-ink/60">{item.text}</p>
                    </div>
                  </Reveal>
                );
              })}
            </ol>
          </div>
        </section>

        {/* Get a quote */}
        <section id="quote" className={`${SECTION} relative isolate overflow-hidden bg-ink text-white`}>
          <Image src="/images/ship.jpg" alt="" fill sizes="100vw" className="-z-20 object-cover" />
          <div className="absolute inset-0 -z-10 bg-ink/65" aria-hidden />

          <div className={`${CONTAINER} grid gap-12 lg:grid-cols-[1fr_1.3fr] lg:gap-20`}>
            <Reveal>
              <Label light>Get a quote</Label>
              <h2 className={`mt-5 ${HEADING}`}>Tell us what you're sending and we'll price it</h2>
              <p className="mt-5 max-w-md text-lg leading-relaxed text-white/80">
                No account needed. Fill in the basics and your request opens in WhatsApp, ready to send. We reply with a
                price and an estimated transit time.
              </p>
              <ul className="mt-8 space-y-3 text-white/85">
                {["Door-to-door or hub-to-hub", "Road, air or sea, or let us recommend", "Customs paperwork handled for you"].map((point) => (
                  <li key={point} className="flex items-center gap-3">
                    <Icon name="check" className="size-5 text-orange" />
                    {point}
                  </li>
                ))}
              </ul>
            </Reveal>
            <Reveal delay={150}>
              <QuoteForm />
            </Reveal>
          </div>
        </section>

        {/* Prohibited items and packing */}
        <section id="packing" className={SECTION}>
          <div className={`${CONTAINER} grid gap-12 lg:grid-cols-2 lg:gap-20`}>
            <Reveal>
              <Label>Before you ship</Label>
              <h2 className={`mt-5 ${HEADING_NAVY}`}>Pack it right, and know what we can't carry</h2>
              <p className="mt-5 max-w-md text-lg leading-relaxed text-ink/65">
                A few minutes of preparation avoids delays at the hub and at customs.
              </p>

              <ul className="mt-10 grid gap-x-8 gap-y-8 sm:grid-cols-2">
                {PACKING.map((item) => (
                  <li key={item.title}>
                    <Icon name={item.icon} className="size-5 text-orange" />
                    <h3 className="mt-3 font-medium">{item.title}</h3>
                    <p className="mt-1 text-sm leading-relaxed text-ink/60">{item.text}</p>
                  </li>
                ))}
              </ul>
            </Reveal>

            <Reveal delay={150} className="rounded-3xl border border-ink/8 bg-paper p-7 sm:p-9">
              <div className="flex items-center gap-3">
                <Icon name="ban" className="size-6 text-red-500" />
                <h3 className="text-xl font-medium tracking-tight">We can't carry</h3>
              </div>
              <ul className="mt-6 grid gap-3 sm:grid-cols-2">
                {PROHIBITED.map((item) => (
                  <li key={item} className="flex items-start gap-3 text-sm leading-relaxed text-ink/70">
                    <span className="mt-2 size-1.5 shrink-0 rounded-full bg-red-400" aria-hidden />
                    {item}
                  </li>
                ))}
              </ul>
              <p className="mt-7 border-t border-ink/10 pt-5 text-sm leading-relaxed text-ink/60">
                Not sure about an item? Ask us on WhatsApp before you pack it. Some goods are allowed with the right
                paperwork or packaging.
              </p>
            </Reveal>
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className={`${SECTION} bg-paper`}>
          <div className={`${CONTAINER} grid gap-10 lg:grid-cols-[1fr_1.4fr] lg:gap-20`}>
            <Reveal>
              <Label>FAQ</Label>
              <h2 className={`mt-5 ${HEADING_NAVY}`}>Questions, answered</h2>
            </Reveal>

            <Reveal delay={120} className="border-t border-ink/15">
              {FAQ.map((item) => (
                <details key={item.question} className="group border-b border-ink/15">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-5 font-medium [&::-webkit-details-marker]:hidden">
                    {item.question}
                    <span className="text-2xl font-light leading-none text-orange transition duration-300 group-open:rotate-45">
                      +
                    </span>
                  </summary>
                  <p className="max-w-2xl pb-6 leading-relaxed text-ink/60">{item.answer}</p>
                </details>
              ))}
            </Reveal>
          </div>
        </section>

        {/* Closing call to action */}
        <section className="relative isolate overflow-hidden bg-ink py-24 text-white sm:py-32">
          <Image src="/images/port.jpg" alt="" fill sizes="100vw" className="-z-20 object-cover" />
          <div className="absolute inset-0 -z-10 bg-ink/50" aria-hidden />

          <div className={`${CONTAINER} grid gap-10 lg:grid-cols-2 lg:items-end lg:gap-20`}>
            <Reveal as="h2" className="text-5xl font-light leading-[1.05] tracking-tight sm:text-7xl">
              Ready when <span className="text-orange">you are</span>
            </Reveal>
            <Reveal delay={150} className="w-full max-w-md lg:justify-self-end">
              <p className="leading-relaxed text-white/90">
                Have your tracking number? Your shipment is one step away. No number, or need a hand? Message us.
              </p>
              <div className="mt-5">
                <TrackingForm id="footer-tracking-number" />
              </div>
              <WhatsAppLink label="Chat with us on WhatsApp" />
            </Reveal>
          </div>
        </section>
      </main>

      <SiteFooter />
      <WhatsAppFloat />
    </>
  );
}

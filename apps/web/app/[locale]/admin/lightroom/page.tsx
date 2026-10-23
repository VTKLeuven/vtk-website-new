import { notFound } from "next/navigation";
import { Card } from "@vtk/ui";
import { hasLocale } from "@/lib/locale";
import { requirePermission } from "@/lib/session";
import { fetchLightroomStatus, getLightroomConfig } from "@/lib/lightroom";
import { LIGHTROOM_COMPUTER_NAME } from "@/lib/lightroom-view";
import { LightroomPanel } from "@/components/lightroom/LightroomPanel";

/**
 * De Lightroom-pc: een Windows-pc op kenny waarop communicatie via Parsec foto's
 * bewerkt. Hij leent de GPU van llm.vtk.be zolang iemand hem gebruikt, en gaat
 * na een halfuur zonder activiteit vanzelf in slaapstand (met al het werk erin).
 *
 * De site start en stopt hem; verbinden gebeurt in Parsec, met een eigen account
 * dat IT als vriend van de pc toevoegt. Zie docs/design-decisions.md
 * ("De Lightroom-pc") en infra/lightroom.
 */
export default async function AdminLightroom({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: localeParam } = await params;
  if (!hasLocale(localeParam)) notFound();
  const nl = localeParam === "nl";

  await requirePermission("lightroom.use");
  const [initial, config] = await Promise.all([fetchLightroomStatus(), getLightroomConfig()]);
  const host = config.parsecAccount;
  const idle = initial.status?.idleLimitMinutes ?? 30;

  const steps = nl
    ? [
        <>
          Installeer Parsec op je laptop (
          <a className="underline" href="https://parsec.app/downloads" target="_blank" rel="noreferrer">
            parsec.app/downloads
          </a>
          ) en maak een gratis account.
        </>,
        <>
          Vraag IT om je toe te voegen als vriend van{" "}
          {host ? <span className="font-mono text-vtk-ink">{host}</span> : "het Parsec-account van de Lightroom-pc"}, met
          toetsenbord, muis en verbinden zonder goedkeuring. Dat is één keer.
        </>,
        <>
          Start de Lightroom-pc hierboven. Is hij klaar, klik dan in Parsec bij Computers op Connect bij{" "}
          <span className="font-mono text-vtk-ink">{LIGHTROOM_COMPUTER_NAME}</span>.
        </>,
        <>
          Klaar met bewerken? Klik op <span className="font-medium text-vtk-ink">Ik ben klaar</span>. Vergeet je het,
          dan gaat hij na {idle} minuten zonder activiteit vanzelf in slaapstand. Lightroom staat de volgende keer nog open
          zoals je het liet.
        </>,
      ]
    : [
        <>
          Install Parsec on your laptop (
          <a className="underline" href="https://parsec.app/downloads" target="_blank" rel="noreferrer">
            parsec.app/downloads
          </a>
          ) and create a free account.
        </>,
        <>
          Ask IT to add you as a friend of{" "}
          {host ? <span className="font-mono text-vtk-ink">{host}</span> : "the Lightroom PC's Parsec account"}, with
          keyboard, mouse and connecting without approval. You only do this once.
        </>,
        <>
          Start the Lightroom PC above. Once it is ready, click Connect on{" "}
          <span className="font-mono text-vtk-ink">{LIGHTROOM_COMPUTER_NAME}</span> under Computers in Parsec.
        </>,
        <>
          Done editing? Click <span className="font-medium text-vtk-ink">I&apos;m done</span>. If you forget, it goes to
          sleep by itself after {idle} minutes without activity. Next time Lightroom is still open as you left it.
        </>,
      ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">{nl ? "Lightroom-pc" : "Lightroom PC"}</h1>
        <p className="mt-1 text-sm text-zinc-500">
          {nl
            ? "Een krachtige Windows-pc op kenny voor Lightroom, die je via Parsec op je eigen laptop bedient."
            : "A powerful Windows PC on kenny for Lightroom, which you use on your own laptop through Parsec."}
        </p>
      </div>

      <LightroomPanel locale={nl ? "nl" : "en"} initial={initial} />

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">{nl ? "Verbinden met Parsec" : "Connecting with Parsec"}</h2>
        <Card className="p-5 sm:p-6">
          <ol className="list-decimal space-y-2 pl-5 text-sm text-[#5c667f]">
            {steps.map((step, i) => (
              <li key={i}>{step}</li>
            ))}
          </ol>
          <p className="mt-4 text-xs text-zinc-500">
            {nl
              ? "Zijn jullie met meer? Iedereen die verbindt, ziet en bedient hetzelfde scherm. Kijk dus bovenaan wie er al verbonden is."
              : "More of you? Everyone who connects sees and controls the same screen, so check above who is already connected."}
          </p>
        </Card>
      </section>
    </div>
  );
}

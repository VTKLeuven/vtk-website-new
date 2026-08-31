import { copy, type LogistiekLocale } from '@/lib/i18n';

/**
 * Wat er in de plaats van het aanvraagformulier staat zolang externen nog niets
 * mogen indienen (S1, `externalRequestsBlocked` in lib/session.ts).
 *
 * Bewust een paneel op de gewone pagina en geen aparte foutpagina: de catalogus
 * en de voertuigen blijven eronder staan. Wie ziet wát er is, weet waarvoor hij
 * mailt; wie een leeg scherm krijgt, mailt niet.
 *
 * De accentbalk links is dezelfde als bij een uitgelichte kaart elders op de
 * site: dit is geen fout, het is een mededeling.
 */
export function ExternClosed({ locale }: { locale: LogistiekLocale }) {
  const t = copy[locale];
  return (
    <section className="grid gap-2 rounded-[18px] border border-vtk-navy/10 bg-vtk-surface p-6 shadow-[inset_3px_0_0_var(--yellow)] sm:p-7">
      <h2 className="text-lg font-semibold tracking-tight text-vtk-ink">{t.externClosedTitle}</h2>
      <p className="max-w-2xl leading-7 text-vtk-body">{t.externClosedLead}</p>
      <p className="max-w-2xl leading-7 text-vtk-body">
        {t.externClosedAction.split('logistiek@vtk.be')[0]}
        <a
          href="mailto:logistiek@vtk.be"
          className="font-semibold text-vtk-navy underline decoration-vtk-yellow underline-offset-4"
        >
          logistiek@vtk.be
        </a>
        {t.externClosedAction.split('logistiek@vtk.be')[1]}
      </p>
    </section>
  );
}

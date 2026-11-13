import {
  costSections,
  distributionOf,
  hasResult,
  missingResults,
  resultOverviewOf,
  locationOf,
  locationValue,
  overviewOf,
  priceOf,
  unitAmount,
  unitsOf,
  type CalcContext,
} from './calc';
import { applyFormulas } from './formula';
import { isUncheckableShopLink, openCheck, rowPriceIn, shopName } from './prices';
import type { BudgetContent } from './types';

/*
 * Wat de site nakijkt voor een budget naar het BO mag. Drie soorten:
 *
 * - `block`: zonder dit kan de post niet indienen (een verdeling die niet op
 *   100 % uitkomt, een regel zonder bron, een forfait zonder reden);
 * - `review`: mag, maar de GM bekijkt het (een prijs die afwijkt van de zaal,
 *   meer volk dan de zaal aankan, slechter dan de begroting);
 * - `info`: om te weten (het tarief van de post is nog niet ingevuld).
 *
 * Sommen staan er niet in: die rekent de site zelf, dus ze kunnen niet meer
 * een rij missen. Puur, zodat de editor en de server hetzelfde zeggen.
 */

export type CheckLevel = 'block' | 'review' | 'info';

export type Check = {
  level: CheckLevel;
  text: string;
  rowId?: string;
  sectionId?: string;
  /** Een veld van het budget zelf (begroting, verdeling, BTW). */
  field?: 'begroting' | 'allocation' | 'vat' | 'location' | 'persons' | 'target';
};

/** Wat het sjabloon laat staan zolang niemand iets invult. */
const PLACEHOLDER = /^(naam kost|naam|kost|x+|evenement)$/i;

function eur(n: number): string {
  const v = (Math.sign(n) * Math.round(Math.abs(n) * 100 + 1e-7)) / 100;
  return (
    (v < 0 ? '−' : '') +
    new Intl.NumberFormat('nl-BE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Math.abs(v))
  );
}

function pct(x: number): string {
  return new Intl.NumberFormat('nl-BE', { maximumFractionDigits: 2 }).format(Math.round(x * 100000) / 1000) + ' %';
}

export function checksOf(content: BudgetContent, ctx: CalcContext, nl: boolean): Check[] {
  const out: Check[] = [];
  const add = (check: Check) => out.push(check);

  // Berekeningen die niet uit te rekenen zijn: op een kopie, de controles wijzigen niets.
  for (const error of applyFormulas(structuredClone(content))) {
    add({
      level: 'block',
      rowId: error.rowId,
      sectionId: error.sectionId,
      field: error.paramId ? 'persons' : undefined,
      text: nl ? `Berekening klopt niet. ${error.text}` : `A calculation does not work. ${error.text}`,
    });
  }

  // Verdelingen
  for (const section of costSections(content)) {
    if (section.type !== 'variable' || !section.distribute || section.rows.length === 0) continue;
    const d = distributionOf(section);
    if (d.ok) continue;
    add({
      level: 'block',
      sectionId: section.id,
      text: d.restRow
        ? nl
          ? `${section.name}: de verdeling telt ${pct(d.sum)}, dus er blijft niets over voor ${d.restRow.name}.`
          : `${section.name}: the split adds up to ${pct(d.sum)}, leaving nothing for ${d.restRow.name}.`
        : nl
          ? `${section.name}: de verdeling telt ${pct(d.sum)} in plaats van 100 %.`
          : `${section.name}: the split adds up to ${pct(d.sum)} instead of 100 %.`,
    });
  }

  const share = content.allocation.reduce((sum, a) => sum + (a.share || 0), 0);
  if (Math.abs(share - 1) > 1e-9) {
    add({
      level: 'block',
      field: 'allocation',
      text: nl
        ? `De verdeling per organisatie telt ${pct(share)} in plaats van 100 %.`
        : `The split per organisation adds up to ${pct(share)} instead of 100 %.`,
    });
  }

  // BTW
  if (content.vat && !content.vat.reason.trim()) {
    add({
      level: 'block',
      field: 'vat',
      text: nl
        ? `Dit budget rekent met ${pct(content.vat.rate)} in plaats van het tarief van de post. Zeg waarom.`
        : `This budget uses ${pct(content.vat.rate)} instead of the post's rate. Say why.`,
    });
  } else if (content.vat) {
    add({
      level: 'review',
      field: 'vat',
      text: nl
        ? `Ander BTW-tarief (${pct(content.vat.rate)}): ${content.vat.reason}`
        : `Different VAT rate (${pct(content.vat.rate)}): ${content.vat.reason}`,
    });
  }

  for (const section of content.sections) {
    if (!section.name.trim() || PLACEHOLDER.test(section.name.trim())) {
      add({
        level: 'block',
        sectionId: section.id,
        text: nl
          ? `Geef de sectie "${section.name.trim() || 'zonder naam'}" een naam die zegt wat erin zit.`
          : `Give the section "${section.name.trim() || 'without a name'}" a name that says what is in it.`,
      });
    }
  }

  // Regels
  const location = locationOf(content, ctx);
  const fromMissingLocation: string[] = [];
  for (const section of costSections(content)) {
    for (const row of section.rows) {
      if (row.rest) continue;
      const name = row.name.trim() || (nl ? 'Regel zonder naam' : 'Row without a name');
      if (!row.name.trim())
        add({
          level: 'block',
          rowId: row.id,
          sectionId: section.id,
          text: nl ? 'Een regel heeft nog geen naam.' : 'A row has no name yet.',
        });
      if (row.service) continue;
      if (row.forfait) {
        if (!row.forfait.reason.trim()) {
          add({
            level: 'block',
            rowId: row.id,
            sectionId: section.id,
            text: nl
              ? `${name}: een bedrag zonder berekening vraagt een reden.`
              : `${name}: an amount without a calculation needs a reason.`,
          });
        } else {
          add({
            level: 'review',
            rowId: row.id,
            sectionId: section.id,
            text: nl
              ? `${name}: forfait van ${eur(row.forfait.amount)}, "${row.forfait.reason}".`
              : `${name}: lump sum of ${eur(row.forfait.amount)}, "${row.forfait.reason}".`,
          });
        }
        continue;
      }
      const source = row.source;
      if (!source) {
        add({
          level: 'block',
          rowId: row.id,
          sectionId: section.id,
          text: nl ? `${name}: waar komt de prijs vandaan?` : `${name}: where does the price come from?`,
        });
      } else if ((source.type === 'webshop' || source.type === 'collectgo') && !source.url?.trim()) {
        add({
          level: 'block',
          rowId: row.id,
          sectionId: section.id,
          text: nl ? `${name}: voeg de link naar het product toe.` : `${name}: add the link to the product.`,
        });
      } else if (
        (source.type === 'afspraak' || source.type === 'offerte') &&
        !source.note?.trim() &&
        !source.url?.trim()
      ) {
        add({
          level: 'block',
          rowId: row.id,
          sectionId: section.id,
          text:
            source.type === 'afspraak'
              ? nl
                ? `${name}: zeg wat de afspraak is.`
                : `${name}: say what was agreed.`
              : nl
                ? `${name}: zeg welke offerte het is, of link ze.`
                : `${name}: say which quote it is, or link it.`,
        });
      } else if (source.type === 'locatie' && source.field) {
        if (!location) {
          // Eén melding voor alle regels samen: een vers cantusbudget heeft er vijf.
          fromMissingLocation.push(name);
        } else if (row.override != null) {
          const fromLocation = locationValue(content, ctx, source.field);
          if (fromLocation != null && Math.abs(row.override - fromLocation) > 0.004) {
            add({
              level: row.overrideReason?.trim() ? 'review' : 'block',
              rowId: row.id,
              sectionId: section.id,
              text: row.overrideReason?.trim()
                ? nl
                  ? `${name}: ${eur(row.override)} in plaats van ${eur(fromLocation)} van ${location.name}, "${row.overrideReason.trim()}".`
                  : `${name}: ${eur(row.override)} instead of ${eur(fromLocation)} from ${location.name}, "${row.overrideReason.trim()}".`
                : nl
                  ? `${name}: ${eur(row.override)} wijkt af van ${location.name} (${eur(fromLocation)}). Zeg waarom, of neem ${eur(fromLocation)} over.`
                  : `${name}: ${eur(row.override)} differs from ${location.name} (${eur(fromLocation)}). Say why, or use ${eur(fromLocation)}.`,
            });
          }
        }
      }
      if (unitAmount(content, ctx, row).mode === 'nobasis' && priceOf(content, ctx, row) !== 0) {
        add({
          level: 'block',
          rowId: row.id,
          sectionId: section.id,
          text:
            source?.type === 'locatie' && row.override == null
              ? nl
                ? `${name}: zijn de prijzen van ${location?.name ?? 'de zaal'} incl. of excl. BTW? Dat kiest Beheer bij de locaties.`
                : `${name}: are the prices of ${location?.name ?? 'the venue'} incl. or excl. VAT? Finance sets that with the venues.`
              : nl
                ? `${name}: is ${eur(priceOf(content, ctx, row))} incl. of excl. BTW?`
                : `${name}: is ${eur(priceOf(content, ctx, row))} incl. or excl. VAT?`,
        });
      }
      // Wat collectandgo.be zei bij de laatste controle, tot iemand het overnam of bevestigde.
      const check = openCheck(row);
      if (check?.status === 'changed' && check.price != null) {
        const units = section.type === 'variable' ? unitsOf(content, section, row) : (row.qty ?? 0);
        const was = rowPriceIn(row, check.basis ?? 'incl');
        const effect = units * (check.price - was);
        const shop = shopName(check.shop ?? 'collectgo');
        const excl = check.basis === 'excl' ? (nl ? ' excl. BTW' : ' excl. VAT') : '';
        add({
          level: 'review',
          rowId: row.id,
          sectionId: section.id,
          text: nl
            ? `${name}: ${shop} vraagt nu ${eur(check.price)}${excl} in plaats van ${eur(was)} (ongeveer ${effect > 0 ? '+' : ''}${eur(effect)} op het totaal).`
            : `${name}: ${shop} now asks ${eur(check.price)}${excl} instead of ${eur(was)}.`,
        });
      } else if (check?.status === 'notfound') {
        add({
          level: 'review',
          rowId: row.id,
          sectionId: section.id,
          text: nl
            ? `${name}: dit product staat niet (meer) bij ${shopName(check.shop ?? 'collectgo')}. Kies een ander product.`
            : `${name}: this product is no longer at ${shopName(check.shop ?? 'collectgo')}. Choose another one.`,
        });
      } else if (check?.status === 'failed') {
        add({
          level: 'review',
          rowId: row.id,
          sectionId: section.id,
          text: nl
            ? `${name}: ${shopName(check.shop ?? 'collectgo')} gaf geen prijs (${check.reason ?? 'geen antwoord'}). Open de link, kijk de prijs na en bevestig.`
            : `${name}: ${shopName(check.shop ?? 'collectgo')} gave no price. Open the link, check it and confirm.`,
        });
      } else if (isUncheckableShopLink(row)) {
        add({
          level: 'review',
          rowId: row.id,
          sectionId: section.id,
          text: nl
            ? `${name}: de link wijst niet naar één product, dus de site kan de prijs niet nakijken. Open het product en kopieer die link.`
            : `${name}: the link does not point to one product, so the price cannot be checked. Open the product and copy that link.`,
        });
      }
      if (row.flesserke && row.flesserke > unitsOf(content, section, row)) {
        add({
          level: 'review',
          rowId: row.id,
          sectionId: section.id,
          text: nl
            ? `${name}: meer uit Flesserke (${row.flesserke}) dan er nodig is (${unitsOf(content, section, row)}).`
            : `${name}: more from Flesserke (${row.flesserke}) than needed (${unitsOf(content, section, row)}).`,
        });
      }
    }
  }

  // Locatie
  if (fromMissingLocation.length > 0) {
    const list = fromMissingLocation.join(', ');
    add({
      level: 'block',
      field: 'location',
      text: content.info.location.trim()
        ? nl
          ? `${content.info.location.trim()} staat niet bij de locaties, dus ${list} ${fromMissingLocation.length === 1 ? 'heeft' : 'hebben'} geen prijs. Kies een locatie uit de lijst, of geef die ${fromMissingLocation.length === 1 ? 'regel' : 'regels'} een eigen bedrag.`
          : `${content.info.location.trim()} is not in the venue list, so ${list} have no price. Choose a listed venue, or give those rows their own amount.`
        : nl
          ? `Kies de locatie: ${list} ${fromMissingLocation.length === 1 ? 'haalt zijn' : 'halen hun'} prijs uit de zaal.`
          : `Choose the venue: ${list} take their price from it.`,
    });
  }
  if (location?.capacity) {
    const people = (content.params.persons || 0) + (content.params.guests || 0);
    if (people > location.capacity) {
      add({
        level: 'review',
        field: 'persons',
        text: nl
          ? `${people} deelnemers, terwijl ${location.name} plaats heeft voor ${location.capacity}.`
          : `${people} participants, while ${location.name} holds ${location.capacity}.`,
      });
    }
  }
  if (content.params.memberShare != null && (content.params.honoraryShare ?? 0) > (content.params.memberShare ?? 0)) {
    add({
      level: 'block',
      field: 'persons',
      text: nl ? 'Er zijn meer ereleden dan leden.' : 'There are more honorary members than members.',
    });
  }

  // Begroting
  const overview = overviewOf(content, ctx);
  if (content.begroting == null) {
    add({
      level: 'block',
      field: 'begroting',
      text: nl ? 'Vul het bedrag uit de begroting in.' : 'Fill in the amount from the yearly budget.',
    });
  } else if (overview.diff != null && overview.diff < -0.004) {
    const pot = ctx.pot && ctx.pot.count > 0 ? ctx.pot : null;
    add({
      level: 'review',
      field: 'begroting',
      text: pot
        ? nl
          ? `Samen met ${pot.count === 1 ? 'het andere budget' : `de ${pot.count} andere budgetten`} op deze lijn (${eur(pot.others)}) gaat het potje ${eur(-overview.diff)} over de begroting (${eur(content.begroting)}).`
          : `Together with the other budgets on this line (${eur(pot.others)}) the pot exceeds the yearly budget (${eur(content.begroting)}) by ${eur(-overview.diff)}.`
        : nl
          ? `${eur(-overview.diff)} slechter dan de begroting (${eur(content.begroting)}).`
          : `${eur(-overview.diff)} worse than the yearly budget (${eur(content.begroting)}).`,
    });
  }

  // Resultaat
  if (hasResult(content)) {
    const missing = missingResults(content, ctx);
    if (missing > 0) {
      add({
        level: 'info',
        text: nl
          ? `${missing} ${missing === 1 ? 'regel heeft' : 'regels hebben'} nog geen resultaat. Vul 0 in als er niets uitgegeven of ontvangen is.`
          : `${missing} ${missing === 1 ? 'row has' : 'rows have'} no result yet. Enter 0 if nothing was spent or received.`,
      });
    }
    const result = resultOverviewOf(content, ctx);
    if (missing === 0 && result.diffBudget < -0.004) {
      add({
        level: 'review',
        text: nl
          ? `Het resultaat is ${eur(-result.diffBudget)} slechter dan het budget (${eur(overview.total)}).${content.result?.note?.trim() ? '' : ' Zeg bij de toelichting waarom.'}`
          : `The result is ${eur(-result.diffBudget)} worse than the budget (${eur(overview.total)}).`,
      });
    }
  }

  if (ctx.settings.vatByPost[ctx.postKey] == null && !content.vat) {
    add({
      level: 'info',
      field: 'vat',
      text: nl
        ? 'Beheer vulde het BTW-tarief van deze post nog niet in. Tot dan telt elke prijs zoals ingetypt.'
        : "Finance has not set this post's VAT rate yet. Until then every price counts as typed.",
    });
  }
  return out;
}

export function countChecks(checks: readonly Check[]): Record<CheckLevel, number> {
  return {
    block: checks.filter((c) => c.level === 'block').length,
    review: checks.filter((c) => c.level === 'review').length,
    info: checks.filter((c) => c.level === 'info').length,
  };
}

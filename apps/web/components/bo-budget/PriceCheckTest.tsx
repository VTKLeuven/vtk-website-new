'use client';

import { useState } from 'react';
import { Button } from '@vtk/ui';
import { UNSENT, unsentGuard } from '@/components/ui/unsentGuard';
import { testPriceLookupAction, type PriceTestResult } from '@/app/actions/boBudgets';
import { money } from './format';

/*
 * De prijscontrole proberen zonder een budget: plak een productlink en zie of
 * de site de winkel herkent en nu een prijs krijgt. Bedoeld voor na een deploy
 * of een wijziging aan de prijsbrowser. De uitkomst staat in het blok zelf en
 * niet in een toast: je wil ze naast de link blijven zien, en meer links na
 * elkaar proberen.
 */

type Row = { url: string; result: PriceTestResult };

export function PriceCheckTest({ browser, locale }: { browser: 'off' | 'down' | 'up'; locale: 'nl' | 'en' }) {
  const nl = locale === 'nl';
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);

  async function run() {
    const value = url.trim();
    if (!value || busy) return;
    setBusy(true);
    const result = await unsentGuard.run(() => testPriceLookupAction({ url: value }));
    setBusy(false);
    if (result === UNSENT) return;
    setRows((list) => [{ url: value, result }, ...list.filter((r) => r.url !== value)].slice(0, 8));
    setUrl('');
  }

  const browserText = {
    up: nl ? 'De prijsbrowser draait en antwoordt.' : 'The price browser is running.',
    down: nl
      ? 'De prijsbrowser is ingesteld maar antwoordt niet. Kijk of de container price-browser draait (docker ps) en of het profiel aan staat.'
      : 'The price browser is configured but does not answer. Check the price-browser container.',
    off: nl
      ? 'De prijsbrowser staat niet aan op deze server, dus bol.com, Partywinkel en Action geven "geen antwoord". Zie docs/bestuursorgaan.md, "De prijsbrowser".'
      : 'The price browser is not switched on, so bol.com, Partywinkel and Action give no answer.',
  }[browser];

  function describe(result: PriceTestResult): { tone: 'ok' | 'bad' | 'warn'; text: string } {
    if (!result.ok) {
      if (result.code === 'UNKNOWN_SHOP')
        return {
          tone: 'warn',
          text: nl
            ? 'Deze winkel kent de site niet: een prijs van hier bevestigt een mens.'
            : 'The site does not know this shop.',
        };
      if (result.code === 'NO_PRICE_ONLINE')
        return {
          tone: 'warn',
          text: nl
            ? `${result.shop} toont geen prijs zonder gekozen winkel. Gebruik de link van hetzelfde product op collectandgo.be.`
            : `${result.shop} shows no price without a chosen store.`,
        };
      return {
        tone: 'warn',
        text: nl
          ? `${result.shop}: deze link wijst niet naar één product (een zoekpagina of een categorie).`
          : `${result.shop}: this link does not point to one product.`,
      };
    }
    const how =
      result.via === 'browser'
        ? nl
          ? 'langs de prijsbrowser'
          : 'via the price browser'
        : nl
          ? 'met een gewone aanvraag'
          : 'with a plain request';
    const took = `${(result.ms / 1000).toLocaleString(nl ? 'nl-BE' : 'en-GB', { maximumFractionDigits: 1 })} s`;
    if (result.lookup.status === 'found')
      return {
        tone: 'ok',
        text: `${result.shop}: € ${money(result.lookup.price, nl)}${result.basis === 'excl' ? (nl ? ' excl. BTW' : ' excl. VAT') : ''} ${nl ? 'voor' : 'for'} "${result.lookup.name}" (${how}, ${took}).`,
      };
    if (result.lookup.status === 'notfound')
      return {
        tone: 'warn',
        text: nl
          ? `${result.shop} antwoordde (${how}, ${took}), maar op die pagina staat geen product meer.`
          : `${result.shop} answered, but there is no product on that page.`,
      };
    return {
      tone: 'bad',
      text: nl
        ? `${result.shop} gaf geen prijs (${how}, ${took}): ${result.lookup.reason}.`
        : `${result.shop} gave no price (${how}, ${took}): ${result.lookup.reason}.`,
    };
  }

  return (
    <section className="vtk-bud-card" aria-labelledby="bud-pricetest-h">
      <h2 id="bud-pricetest-h" className="vtk-bud-h2">
        {nl ? 'Prijscontrole testen' : 'Test the price check'}
      </h2>
      <p className="vtk-bud-fine">
        {nl
          ? 'Plak de link van een product bij Collect&Go, bol.com, Partywinkel, Helloprint, Drukzo of Action. De site vraagt de winkel nu op, zoals "Prijzen nakijken" in een budget dat doet, en bewaart niets.'
          : 'Paste a product link from one of the shops. The site asks the shop now, as "Check prices" does in a budget, and stores nothing.'}
      </p>
      <p className="vtk-bud-pricetest-state" data-state={browser}>
        {browserText}
      </p>
      <div className="vtk-bud-inline">
        <input
          className="vtk-bud-input"
          value={url}
          placeholder="https://www.bol.com/be/nl/p/..."
          inputMode="url"
          aria-label={nl ? 'Link naar een product' : 'Link to a product'}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              void run();
            }
          }}
        />
        <Button type="button" size="sm" disabled={busy || !url.trim()} onClick={() => void run()}>
          {busy ? (nl ? 'Bezig…' : 'Checking…') : nl ? 'Testen' : 'Test'}
        </Button>
      </div>
      {rows.length > 0 && (
        <ul className="vtk-bud-pricetest" aria-live="polite">
          {rows.map((row) => {
            const d = describe(row.result);
            return (
              <li key={row.url} data-tone={d.tone}>
                <span>{d.text}</span>
                <a href={row.url} target="_blank" rel="noreferrer">
                  {row.url.replace(/^https?:\/\/(www\.)?/, '').slice(0, 70)}
                </a>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

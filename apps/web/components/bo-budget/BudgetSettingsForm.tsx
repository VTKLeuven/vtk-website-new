'use client';

import { useState } from 'react';
import { ConfirmDialog } from '@vtk/ui';
import { IconButton } from '@/components/ui/IconButton';
import { PlusIcon, TrashIcon } from '@/components/ui/icons';
import { SaveForm } from '@/components/ui/SaveForm';
import { saveBudgetSettingsAction } from '@/app/actions/boBudgets';
import { POST_VAT_RATES, type BudgetLocation, type BudgetSettings } from '@/lib/bo/budget/types';
import { newId } from '@/lib/bo/budget/templates';
import { percent } from './format';
import { NumberField } from './NumberField';

/*
 * De instellingen van Beheer voor budgetten op de site. Het formulier houdt
 * alles in zijn eigen toestand en stuurt het als één document mee; bewaren
 * meldt zich met een toast, zoals elk formulier in de admin.
 */

type Post = { key: string; name: string; group: string };

const LOC_LABELS = {
  capacity: ['Plaatsen', 'Places'],
  zaal: ['Zaal', 'Venue'],
  vaten: ['Vat', 'Keg'],
  licht: ['Licht', 'Light'],
  stopsel: ['Stopsel', 'Corkage'],
  sangria: ['Sangria', 'Sangria'],
} as const;

const EMPTY_LOCATION: BudgetLocation = {
  name: '',
  capacity: null,
  zaal: null,
  vaten: null,
  licht: null,
  stopsel: null,
  sangria: null,
  basis: null,
  note: '',
};

export function BudgetSettingsForm({
  settings,
  posts,
  locale,
}: {
  settings: BudgetSettings;
  posts: Post[];
  locale: 'nl' | 'en';
}) {
  const nl = locale === 'nl';
  const [value, setValue] = useState<BudgetSettings>(settings);
  const [removing, setRemoving] = useState<number | null>(null);
  const [removingFixed, setRemovingFixed] = useState<number | null>(null);
  const set = (change: (draft: BudgetSettings) => void) =>
    setValue((prev) => {
      const next = structuredClone(prev);
      change(next);
      return next;
    });
  const groups = [...new Set(posts.map((p) => p.group))];
  const setLoc = (i: number, change: (l: BudgetLocation) => void) => set((d) => change(d.locations[i]));
  const known = posts.filter((p) => value.vatByPost[p.key] != null).length;
  const pilots = value.pilotPostKeys.length;

  return (
    <SaveForm
      action={saveBudgetSettingsAction}
      submitLabel={nl ? 'Instellingen bewaren' : 'Save settings'}
      savingLabel={nl ? 'Bewaren…' : 'Saving…'}
      savedMessage={nl ? 'Instellingen bewaard' : 'Settings saved'}
      resetOnSuccess={false}
      fallbackErrorMessage={nl ? 'Bewaren lukte niet. Probeer het opnieuw.' : 'Saving failed. Try again.'}
      errorMessages={{
        INVALID_SETTINGS: nl
          ? 'Een locatie of een vaste prijs heeft geen naam, of een bedrag is ongeldig.'
          : 'A venue or a fixed price has no name, or an amount is invalid.',
        DUPLICATE_LOCATION: nl ? 'Twee locaties hebben dezelfde naam.' : 'Two venues have the same name.',
      }}
      className="space-y-6"
      footer={({ submitButton }) => <div className="vtk-bud-savebar">{submitButton}</div>}
    >
      <input type="hidden" name="settings" value={JSON.stringify(value)} />

      <section className="vtk-bud-card" aria-labelledby="set-vat">
        <h2 id="set-vat" className="vtk-bud-h2">
          {nl ? 'Per post: proef en BTW' : 'Per post: trial and VAT'}
        </h2>
        <p className="vtk-bud-fine">
          {nl
            ? `Budgetten op de site zijn een proef naast de rekenbladen in Drive. Groep 5 mag het altijd proberen; een andere post pas als je ze hier aanvinkt (${pilots} aangevinkt). Een post die meedoet, downloadt haar budget als rekenblad voor de map Budgetten: het BO werkt verder met Drive.`
            : `Budgets on the site are a trial next to the spreadsheets in Drive. Group 5 can always try it; another post only once ticked here (${pilots} ticked).`}
        </p>
        <p className="vtk-bud-fine">
          {nl
            ? `BTW: een budget rekent een prijs excl. BTW × (1 + tarief van de post), en zet een winkelprijs eerst om naar excl. Zonder tarief telt elke prijs zoals ingetypt, zoals in de bladen. ${known} van ${posts.length} ingevuld.`
            : `VAT: a budget counts a price excl. VAT × (1 + the post's rate), and converts a shop price to excl. first. Without a rate every price counts as typed. ${known} of ${posts.length} set.`}
        </p>
        <div className="vtk-bud-vatgrid">
          {groups.map((group) => (
            <div key={group} className="vtk-bud-vatgroup">
              <h3 className="vtk-bud-colhead">{group}</h3>
              {posts
                .filter((p) => p.group === group)
                .map((p) => (
                  <div key={p.key} className="vtk-bud-vatrow">
                    <span>{p.name}</span>
                    {p.group === 'Groep 5' ? (
                      // Groep 5 mag de proef altijd: zij beslist erover.
                      <span className="vtk-bud-pilot vtk-bud-muted">{nl ? 'Altijd' : 'Always'}</span>
                    ) : (
                      <label
                        className="vtk-bud-pilot"
                        title={
                          nl ? `${p.name} mag budgetten op de site proberen` : `${p.name} may try budgets on the site`
                        }
                      >
                        <input
                          type="checkbox"
                          checked={value.pilotPostKeys.includes(p.key)}
                          onChange={(e) =>
                            set((d) => {
                              d.pilotPostKeys = e.target.checked
                                ? [...new Set([...d.pilotPostKeys, p.key])]
                                : d.pilotPostKeys.filter((k) => k !== p.key);
                            })
                          }
                        />
                        <span>{nl ? 'Proef' : 'Trial'}</span>
                      </label>
                    )}
                    <select
                      aria-label={nl ? `BTW-tarief van ${p.name}` : `VAT rate of ${p.name}`}
                      className="vtk-bud-input"
                      value={value.vatByPost[p.key] == null ? '' : String(value.vatByPost[p.key])}
                      onChange={(e) =>
                        set((d) => {
                          if (e.target.value === '') delete d.vatByPost[p.key];
                          else d.vatByPost[p.key] = Number(e.target.value);
                        })
                      }
                    >
                      <option value="">{nl ? 'Niet ingevuld' : 'Not set'}</option>
                      {POST_VAT_RATES.map((r) => (
                        <option key={r} value={String(r)}>
                          {percent(r, nl)}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
            </div>
          ))}
        </div>
      </section>

      <section className="vtk-bud-card" aria-labelledby="set-cg">
        <h2 id="set-cg" className="vtk-bud-h2">
          {nl ? 'Collect&Go en Flesserke' : 'Collect&Go and Flesserke'}
        </h2>
        <div className="vtk-bud-grid">
          <label className="vtk-bud-field">
            <span className="vtk-bud-label">{nl ? 'Servicekost per bestelling' : 'Service cost per order'}</span>
            <NumberField
              className="vtk-bud-input num"
              value={value.serviceCost}
              decimals={2}
              onValue={(v) => set((d) => (d.serviceCost = v ?? 0))}
            />
            <span className="vtk-bud-hint">
              {nl ? 'Incl. 21 % BTW, zoals Collect&Go ze aanrekent.' : 'Incl. 21 % VAT, as Collect&Go charges it.'}
            </span>
          </label>
          <label className="vtk-bud-field">
            <span className="vtk-bud-label">
              {nl ? 'Sangria zonder prijs van de zaal' : 'Sangria without a venue price'}
            </span>
            <NumberField
              className="vtk-bud-input num"
              value={value.sangriaFallback}
              decimals={2}
              onValue={(v) => set((d) => (d.sangriaFallback = v ?? 0))}
            />
            <span className="vtk-bud-hint">
              {nl
                ? 'Winkelprijs per fles, voor een cantus in een zaal zonder eigen sangria.'
                : 'Shop price per bottle, for a cantus at a venue without its own sangria.'}
            </span>
          </label>
        </div>
        <label className="vtk-bud-check">
          <input
            type="checkbox"
            checked={value.flesserkeCounts}
            onChange={(e) => set((d) => (d.flesserkeCounts = e.target.checked))}
          />
          <span>
            {nl
              ? 'Wat uit de voorraad van Flesserke komt, telt mee als kost'
              : 'What comes from the Flesserke stock counts as a cost'}
          </span>
        </label>
        <label className="vtk-bud-check">
          <input
            type="checkbox"
            checked={value.collectGoLive}
            onChange={(e) => set((d) => (d.collectGoLive = e.target.checked))}
          />
          <span>{nl ? 'Prijzen live nakijken bij de webshops' : 'Check prices live at the web shops'}</span>
        </label>
        <p className="vtk-bud-fine">
          {nl
            ? 'De site leest dan de productpagina, zoals een browser, voor elke regel met een link naar één product (Collect&Go, bol.com, Partywinkel, Helloprint, Drukzo, Action, Colruyt). Lukt het niet, dan zegt de editor dat en bevestigt de post de prijs zelf.'
            : 'The site then reads the product page, like a browser, for every row linking to one product. If it fails, the editor says so and the post confirms the price.'}
        </p>
        <label className="vtk-bud-field">
          <span className="vtk-bud-label">{nl ? 'Postcode van de Colruyt' : 'Postcode of the Colruyt store'}</span>
          <input
            className="vtk-bud-input vtk-bud-postcode"
            value={value.colruytPostcode}
            inputMode="numeric"
            maxLength={4}
            placeholder="0000"
            onChange={(e) => set((d) => (d.colruytPostcode = e.target.value.replace(/\D/g, '').slice(0, 4)))}
          />
        </label>
        <p className="vtk-bud-fine">
          {nl
            ? 'Colruyt heeft een prijs per winkel. De site neemt de Colruyt-winkel in deze postcode voor elke link naar colruyt.be; zonder postcode kijkt ze die links niet na.'
            : 'Colruyt has a price per store. The site uses the Colruyt store in this postcode; without one it does not check those links.'}
        </p>
      </section>

      <section className="vtk-bud-card" aria-labelledby="set-loc">
        <h2 id="set-loc" className="vtk-bud-h2">
          {nl ? 'Locaties' : 'Venues'}
        </h2>
        <p className="vtk-bud-fine">
          {nl
            ? 'Een cantus haalt de huur, de vaten, licht en geluid, het stopselgeld en de sangria uit de gekozen zaal, en waarschuwt wanneer er meer volk komt dan er plaats is. Kies per zaal of haar prijzen incl. of excl. BTW zijn.'
            : 'A cantus takes rent, kegs, light and sound, corkage and sangria from the chosen venue, and warns when more people come than it holds.'}
        </p>
        {value.locations.length === 0 ? (
          <p className="vtk-bud-empty">{nl ? 'Nog geen locaties.' : 'No venues yet.'}</p>
        ) : (
          <div className="vtk-bud-tablewrap">
            <table className="vtk-bud-table vtk-bud-loctable">
              <thead>
                <tr>
                  <th className="vtk-bud-col-name">{nl ? 'Naam' : 'Name'}</th>
                  <th className="num">{nl ? 'Plaatsen' : 'Places'}</th>
                  <th className="num">{nl ? 'Zaal' : 'Venue'}</th>
                  <th className="num">{nl ? 'Vat' : 'Keg'}</th>
                  <th className="num">{nl ? 'Licht' : 'Light'}</th>
                  <th className="num">{nl ? 'Stopsel' : 'Corkage'}</th>
                  <th className="num">Sangria</th>
                  <th>{nl ? 'Prijzen' : 'Prices'}</th>
                  <th className="vtk-bud-col-act">
                    <span className="sr-only">{nl ? 'Acties' : 'Actions'}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {value.locations.map((l, i) => (
                  <tr key={i}>
                    <td className="vtk-bud-col-name">
                      <input
                        className="vtk-bud-bare vtk-bud-cell"
                        value={l.name}
                        aria-label={nl ? 'Naam' : 'Name'}
                        placeholder={nl ? 'Naam van de zaal' : 'Venue name'}
                        onChange={(e) => setLoc(i, (x) => (x.name = e.target.value))}
                      />
                    </td>
                    {(['capacity', 'zaal', 'vaten', 'licht', 'stopsel', 'sangria'] as const).map((f) => (
                      <td key={f} className="num" data-label={LOC_LABELS[f][nl ? 0 : 1]}>
                        <NumberField
                          className="vtk-bud-bare vtk-bud-cell num"
                          value={l[f]}
                          allowEmpty
                          decimals={f === 'capacity' ? undefined : 2}
                          aria-label={`${f} ${l.name}`}
                          onValue={(v) => setLoc(i, (x) => (x[f] = v))}
                        />
                      </td>
                    ))}
                    <td data-label={nl ? 'Prijzen' : 'Prices'}>
                      <select
                        className="vtk-bud-bare vtk-bud-cell"
                        value={l.basis ?? ''}
                        aria-label={nl ? `Prijzen van ${l.name}: incl. of excl. BTW` : `Prices of ${l.name}`}
                        onChange={(e) =>
                          setLoc(i, (x) => (x.basis = (e.target.value || null) as BudgetLocation['basis']))
                        }
                      >
                        <option value="">{nl ? 'Nog kiezen' : 'Choose'}</option>
                        <option value="incl">{nl ? 'incl. BTW' : 'incl. VAT'}</option>
                        <option value="excl">{nl ? 'excl. BTW' : 'excl. VAT'}</option>
                      </select>
                    </td>
                    <td className="vtk-bud-col-act">
                      <IconButton
                        label={nl ? 'Locatie verwijderen' : 'Delete venue'}
                        srLabel={`${nl ? 'Locatie verwijderen' : 'Delete venue'}: ${l.name}`}
                        tone="danger"
                        onClick={() => setRemoving(i)}
                      >
                        <TrashIcon />
                      </IconButton>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <button
          type="button"
          className="vtk-bud-add"
          onClick={() => set((d) => void d.locations.push({ ...EMPTY_LOCATION }))}
        >
          <PlusIcon /> {nl ? 'Locatie' : 'Venue'}
        </button>
      </section>

      <section className="vtk-bud-card" aria-labelledby="set-fixed">
        <h2 id="set-fixed" className="vtk-bud-h2">
          {nl ? 'Vaste prijzen' : 'Fixed prices'}
        </h2>
        <p className="vtk-bud-fine">
          {nl
            ? 'Prijzen die vastliggen en waar geen link of offerte per activiteit voor bestaat: de huur van een zaal, een vat, licht en geluid. Een regel zonder bron met deze omschrijving en deze prijs vraagt in geen enkel budget nog "waar komt de prijs vandaan?". Met een locatie geldt de prijs enkel daar, en valt een regel met een andere prijs op. Vanuit een budget zet je er een bij met "Vaste prijs" naast de regel.'
            : 'Prices that are fixed and have no link or quote per activity. A row without a source with this description and this price no longer asks where the price comes from.'}
        </p>
        {value.fixedPrices.length === 0 ? (
          <p className="vtk-bud-empty">{nl ? 'Nog geen vaste prijzen.' : 'No fixed prices yet.'}</p>
        ) : (
          <div className="vtk-bud-tablewrap">
            <table className="vtk-bud-table vtk-bud-loctable">
              <thead>
                <tr>
                  <th className="vtk-bud-col-name">{nl ? 'Omschrijving' : 'Description'}</th>
                  <th className="num">{nl ? 'Prijs' : 'Price'}</th>
                  <th>{nl ? 'Locatie' : 'Venue'}</th>
                  <th>{nl ? 'Opmerking' : 'Note'}</th>
                  <th className="vtk-bud-col-act">
                    <span className="sr-only">{nl ? 'Acties' : 'Actions'}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {value.fixedPrices.map((f, i) => (
                  <tr key={f.id}>
                    <td className="vtk-bud-col-name">
                      <input
                        className="vtk-bud-bare vtk-bud-cell"
                        value={f.name}
                        aria-label={nl ? 'Omschrijving' : 'Description'}
                        placeholder={nl ? 'Zoals de regel heet' : 'As the row is called'}
                        onChange={(e) => set((d) => (d.fixedPrices[i].name = e.target.value))}
                      />
                    </td>
                    <td className="num" data-label={nl ? 'Prijs' : 'Price'}>
                      <NumberField
                        className="vtk-bud-bare vtk-bud-cell num"
                        value={f.price}
                        decimals={2}
                        aria-label={nl ? `Prijs van ${f.name}` : `Price of ${f.name}`}
                        onValue={(v) => set((d) => (d.fixedPrices[i].price = v ?? 0))}
                      />
                    </td>
                    <td data-label={nl ? 'Locatie' : 'Venue'}>
                      <input
                        className="vtk-bud-bare vtk-bud-cell"
                        value={f.location}
                        list="set-fixed-locations"
                        aria-label={nl ? `Locatie van ${f.name}` : `Venue of ${f.name}`}
                        placeholder={nl ? 'Overal' : 'Everywhere'}
                        onChange={(e) => set((d) => (d.fixedPrices[i].location = e.target.value))}
                      />
                    </td>
                    <td data-label={nl ? 'Opmerking' : 'Note'}>
                      <input
                        className="vtk-bud-bare vtk-bud-cell"
                        value={f.note}
                        aria-label={nl ? `Opmerking bij ${f.name}` : `Note for ${f.name}`}
                        onChange={(e) => set((d) => (d.fixedPrices[i].note = e.target.value))}
                      />
                    </td>
                    <td className="vtk-bud-col-act">
                      <IconButton
                        label={nl ? 'Vaste prijs verwijderen' : 'Delete fixed price'}
                        srLabel={`${nl ? 'Vaste prijs verwijderen' : 'Delete fixed price'}: ${f.name}`}
                        tone="danger"
                        onClick={() => setRemovingFixed(i)}
                      >
                        <TrashIcon />
                      </IconButton>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <datalist id="set-fixed-locations">
              {value.locations.map((l) => (
                <option key={l.name} value={l.name} />
              ))}
            </datalist>
          </div>
        )}
        <button
          type="button"
          className="vtk-bud-add"
          onClick={() =>
            set((d) => void d.fixedPrices.push({ id: newId(), name: '', price: 0, location: '', note: '' }))
          }
        >
          <PlusIcon /> {nl ? 'Vaste prijs' : 'Fixed price'}
        </button>
      </section>

      <ConfirmDialog
        open={removingFixed !== null}
        title={
          nl
            ? `Vaste prijs "${removingFixed !== null ? value.fixedPrices[removingFixed]?.name || 'zonder naam' : ''}" verwijderen?`
            : 'Delete this fixed price?'
        }
        description={
          nl
            ? 'De prijs verdwijnt uit de lijst zodra je de instellingen bewaart. Regels in budgetten die erop steunden, vragen daarna opnieuw waar hun prijs vandaan komt; de regels en hun bedragen zelf veranderen niet.'
            : 'The price leaves the list once you save. Rows that relied on it ask for a source again; the rows themselves do not change.'
        }
        confirmLabel={nl ? 'Vaste prijs verwijderen' : 'Delete fixed price'}
        cancelLabel={nl ? 'Annuleren' : 'Cancel'}
        onCancel={() => setRemovingFixed(null)}
        onConfirm={() => {
          const i = removingFixed;
          setRemovingFixed(null);
          if (i !== null) set((d) => void d.fixedPrices.splice(i, 1));
        }}
      />

      <ConfirmDialog
        open={removing !== null}
        title={
          nl
            ? `"${removing !== null ? value.locations[removing]?.name || 'Locatie zonder naam' : ''}" verwijderen?`
            : 'Delete this venue?'
        }
        description={
          nl
            ? 'De locatie verdwijnt uit de keuzelijst zodra je de instellingen bewaart. Een budget dat ze koos, toont geen zaalprijzen meer tot de post een andere locatie kiest. De andere locaties blijven staan.'
            : 'The venue leaves the list once you save. A budget that chose it shows no venue prices until another venue is chosen.'
        }
        confirmLabel={nl ? 'Locatie verwijderen' : 'Delete venue'}
        cancelLabel={nl ? 'Annuleren' : 'Cancel'}
        onCancel={() => setRemoving(null)}
        onConfirm={() => {
          const i = removing;
          setRemoving(null);
          if (i !== null) set((d) => void d.locations.splice(i, 1));
        }}
      />
    </SaveForm>
  );
}

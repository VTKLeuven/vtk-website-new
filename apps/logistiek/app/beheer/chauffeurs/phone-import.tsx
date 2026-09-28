'use client';

import { useMemo, useState } from 'react';
import { importDriverPhonesAction } from '@/app/actions/beheer';
import { SaveForm } from '@/components/ui/save-form';
import { planPhoneImport, teamPhone } from '@/lib/phone-import';
import { matchContacts, parseVcards, type PhoneProblem, type VcardContact } from '@/lib/vcard';
import type { DriverPoolEntry } from '@/lib/uitleen-server';

/**
 * De nummers van de chauffeurs uit de gedeelde contactenlijst halen (F4.3).
 *
 * Het praesidium houdt de gsm-nummers bij als contactenexport (`.vcf`) en die
 * lijst wordt elk jaar opnieuw gemaakt. Dit scherm is de tweede weg naar
 * `scripts/import-driver-phones.ts`, zonder shell en zonder container.
 *
 * **Het bestand blijft in de browser.** Het lezen, het opkuisen en het koppelen
 * op naam gebeuren hier (`lib/vcard.ts` is pure TypeScript en draait dus even
 * goed in een tabblad); naar de server gaan enkel de regels die aangevinkt
 * staan. Een lijst met vierennegentig namen en nummers hoort niet in een
 * request, niet in een log en al helemaal niet op schijf. Het bestand blijft om
 * dezelfde reden ook buiten de repo.
 *
 * **Een nakijklijst en geen knop.** De koppeling gebeurt op naam, en een naam die
 * op de verkeerde persoon valt, geeft de chauffeur van zaterdag het nummer van
 * iemand anders; dat merk je pas wanneer er niemand opneemt. Daarom staat hier
 * per regel wat er nu staat, waar dat vandaan komt en wat de lijst voorstelt.
 * Wie nog niets heeft, staat aangevinkt; wie een nummer heeft dat het team zelf
 * zette, staat uit, want dat is een bevestigd nummer en een import hoort daar
 * niet overheen te gaan.
 */

const PHONE_PROBLEMS: Record<PhoneProblem, string> = {
  leeg: 'geen nummer in het contact',
  'geen-belgisch-nummer': 'geen Belgisch nummer',
  'dubbele-nul': '0032 met de nationale nul erachter',
};

const IMPORT_ERRORS = {
  NOTHING_PICKED: 'Vink eerst minstens één nummer aan.',
  BAD_PICK: 'Een van de aangevinkte nummers is niet leesbaar. Laad het bestand opnieuw in.',
  NOT_FOUND: 'Een van deze leden bestaat niet meer op vtk.be. Laad het bestand opnieuw in.',
};

/** Wat er nu staat, met waar het vandaan komt. */
function currentLabel(driver: DriverPoolEntry): string {
  if (!driver.phone) return 'nog geen nummer';
  if (driver.phoneSource === 'PROFILE') return `${driver.phone}, van zijn profiel`;
  if (driver.phoneSource === 'HISTORY') return `${driver.phone}, uit een eerdere aanvraag`;
  return `${driver.phone}, door het team vastgelegd`;
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.08em] text-vtk-muted">{title}</p>
      {children}
    </div>
  );
}

/** Eén regel om aan of uit te vinken. */
function PickRow({
  driver,
  phone,
  flipped,
  checked,
  onToggle,
}: {
  driver: DriverPoolEntry;
  phone: string;
  /** De naam stond omgedraaid in het bestand; dat is het vermelden waard. */
  flipped: boolean;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <li>
      <label className="flex cursor-pointer items-start gap-3 rounded-[12px] border border-vtk-navy/10 bg-vtk-surface px-3 py-2">
        <input
          type="checkbox"
          name="pick"
          value={`${driver.id}|${phone}`}
          checked={checked}
          onChange={onToggle}
          className="mt-1 h-4 w-4 shrink-0 accent-[var(--emphasis)]"
        />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium text-vtk-ink">{driver.name}</span>
          <span className="block text-xs text-vtk-muted">
            nu {currentLabel(driver)}
            {flipped ? ' · naam stond omgedraaid in het bestand' : ''}
          </span>
        </span>
        <span className="shrink-0 text-sm tabular-nums text-vtk-body">{phone}</span>
      </label>
    </li>
  );
}

export function PhoneImport({ drivers }: { drivers: DriverPoolEntry[] }) {
  const [fileName, setFileName] = useState<string | null>(null);
  const [contacts, setContacts] = useState<VcardContact[] | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [problem, setProblem] = useState<string | null>(null);

  // Een gedeactiveerd lid staat nog in de lijst maar valt uit elke keuze weg; een
  // nummer voor hem inlezen heeft dus geen bestemming.
  const pool = useMemo(() => drivers.filter((driver) => !driver.inactive), [drivers]);

  const result = useMemo(() => (contacts ? matchContacts(contacts, pool) : null), [contacts, pool]);

  // De drie soorten koppeling (`lib/phone-import.ts`). `same` heeft geen vinkje
  // nodig: daar valt niets te veranderen, en een rij die niets doet, leest als
  // werk.
  const { fresh, same, different } = planPhoneImport(result?.matched ?? []);

  // Wie er na deze import nog altijd zonder nummer staat: dat is de lijst die
  // iemand met de hand moet nabellen, en die vraag komt hoe dan ook.
  const stillWithout = pool.filter(
    (driver) => !driver.phone && !result?.matched.some((match) => match.person.id === driver.id)
  );

  async function onFile(file: File | undefined) {
    if (!file) return;
    setFileName(file.name);
    setProblem(null);
    const found = parseVcards(await file.text());
    if (found.length === 0) {
      setContacts(null);
      setPicked(new Set());
      setProblem('Geen contacten met een naam én een nummer in dat bestand.');
      return;
    }
    setContacts(found);
    // Standaard aangevinkt wie nog niets van het team heeft; de rest zet je zelf
    // aan. Dezelfde verdeling als het scherm hieronder tekent, dus dezelfde
    // functie.
    setPicked(new Set(planPhoneImport(matchContacts(found, pool).matched).fresh.map((match) => match.person.id)));
  }

  function toggle(id: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="grid gap-4">
      <label className="grid gap-1 text-xs font-medium text-vtk-muted sm:max-w-md">
        Contactenbestand (.vcf)
        <input
          type="file"
          accept=".vcf,text/vcard,text/directory"
          onChange={(event) => void onFile(event.target.files?.[0])}
          className="text-sm text-vtk-body file:mr-3 file:rounded-full file:border file:border-vtk-navy/20 file:bg-vtk-surface file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-vtk-ink"
        />
      </label>

      {problem ? <p className="text-sm text-vtk-danger">{problem}</p> : null}

      {result && contacts ? (
        <SaveForm
          key={fileName ?? ''}
          action={importDriverPhonesAction}
          submitLabel={`${picked.size} nummer${picked.size === 1 ? '' : 's'} opslaan`}
          savingLabel="Opslaan..."
          savedMessage="Nummers opgeslagen."
          errorMessages={IMPORT_ERRORS}
          submitDisabled={picked.size === 0}
          className="grid justify-items-start gap-5"
        >
          {/* `justify-items-start` op het formulier houdt de opslaanknop op zijn
              eigen breedte; zonder dat rekt `SaveForm` hem over de hele kaart uit
              en leest hij niet meer als een knop. De nakijklijst wil die breedte
              wél, en haalt ze hier terug. */}
          <div className="grid w-full gap-5">
            <p className="text-sm text-vtk-body">
              {contacts.length} contacten gelezen, {pool.length} chauffeurs in de lijst.
            </p>

            {fresh.length > 0 ? (
              <Group title={`Krijgen een nummer (${fresh.length})`}>
                <ul className="mt-2 grid gap-1.5">
                  {fresh.map((match) => (
                    <PickRow
                      key={match.person.id}
                      driver={match.person}
                      phone={match.phone}
                      flipped={match.how === 'omgedraaide-naam'}
                      checked={picked.has(match.person.id)}
                      onToggle={() => toggle(match.person.id)}
                    />
                  ))}
                </ul>
              </Group>
            ) : null}

            {different.length > 0 ? (
              <Group title={`Het team zette hier zelf een ander nummer (${different.length})`}>
                <p className="mt-1 text-xs text-vtk-muted">
                  Staat uit: een nummer dat iemand hier invulde, is een bevestigd nummer. Vink aan wat de lijst toch mag
                  overschrijven.
                </p>
                <ul className="mt-2 grid gap-1.5">
                  {different.map((match) => (
                    <PickRow
                      key={match.person.id}
                      driver={match.person}
                      phone={match.phone}
                      flipped={match.how === 'omgedraaide-naam'}
                      checked={picked.has(match.person.id)}
                      onToggle={() => toggle(match.person.id)}
                    />
                  ))}
                </ul>
              </Group>
            ) : null}

            {same.length > 0 ? (
              <p className="text-sm text-vtk-muted">
                {same.length} chauffeur{same.length === 1 ? '' : 's'} staat al met precies dit nummer in de lijst.
              </p>
            ) : null}

            {result.badPhone.length > 0 ? (
              <Group title={`Naam gevonden, nummer niet te lezen (${result.badPhone.length})`}>
                <ul className="mt-2 grid gap-1 text-sm text-vtk-body">
                  {result.badPhone.map((bad) => (
                    <li key={bad.person.id}>
                      {bad.person.name}: {PHONE_PROBLEMS[bad.reason]}
                    </li>
                  ))}
                </ul>
                <p className="mt-1 text-xs text-vtk-muted">
                  Deze zet je met de hand recht bij de chauffeur hierboven; raden welk nummer bedoeld is, is precies wat
                  een import niet mag doen.
                </p>
              </Group>
            ) : null}

            {result.ambiguous.length > 0 ? (
              <Group title={`Meerdere chauffeurs met dezelfde naam (${result.ambiguous.length})`}>
                <ul className="mt-2 grid gap-1 text-sm text-vtk-body">
                  {result.ambiguous.map((entry) => (
                    <li key={entry.contact.name}>
                      {entry.contact.name}: {entry.candidates.length} chauffeurs met die naam
                    </li>
                  ))}
                </ul>
              </Group>
            ) : null}

            {/* Dichtgeklapt: dit zijn de praesidiumleden die geen chauffeur zijn, en
              dat zijn er tachtig. Ze horen erbij (je wil kunnen nakijken of er
              iemand ontbreekt), maar niet als muur van namen. */}
            {result.unmatched.length > 0 ? (
              <details>
                <summary className="cursor-pointer text-xs font-semibold text-vtk-navy">
                  Contacten zonder chauffeur in de lijst ({result.unmatched.length})
                </summary>
                <p className="mt-2 text-sm text-vtk-body">
                  {result.unmatched.map((contact) => contact.name).join(' · ')}
                </p>
              </details>
            ) : null}

            {stillWithout.length > 0 ? (
              <details>
                <summary className="cursor-pointer text-xs font-semibold text-vtk-navy">
                  Chauffeurs die hierna nog geen nummer hebben ({stillWithout.length})
                </summary>
                <p className="mt-2 text-sm text-vtk-body">{stillWithout.map((driver) => driver.name).join(' · ')}</p>
              </details>
            ) : null}
          </div>
        </SaveForm>
      ) : null}
    </div>
  );
}

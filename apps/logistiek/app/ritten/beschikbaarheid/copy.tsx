'use client';

import { createContext, useContext, type ReactNode } from 'react';
import type { AvailabilityKind } from '@/lib/availability-day';
import { AVAILABILITY_KIND_COPY } from '@/lib/availability-kinds';
import type { LogistiekLocale } from '@/lib/i18n-shared';

/**
 * De teksten van het intekenscherm, in beide talen (N3).
 *
 * Dit scherm was het enige van de ledenkant dat enkel Nederlands kende: wie de
 * site in het Engels zette, kreeg hier een half vertaalde pagina. Eén
 * woordenboek naast de componenten, en de taal via een context, zodat ze niet
 * door elke component heen moet.
 */
const COPY = {
  nl: {
    windowRemoved: 'Venster weggehaald.',
    windowChanged: 'Venster aangepast.',
    nowKind: (label: string) => `Nu: ${label}.`,
    typeTitle: 'Venster intikken',
    typeLead: 'Voor wie een uur precies wil zetten; het rooster hierboven gaat per uur.',
    howKeen: 'Hoe graag',
    from: 'Van',
    until: 'Tot',
    to: 'tot',
    saving: 'Opslaan...',
    saved: 'Bewaard',
    add: 'Toevoegen',
    listTitle: (count: number) => `Wanneer je kan rijden (${count})`,
    listEmpty:
      'Nog niets ingegeven. Zolang je niets ingeeft, gaat Logistiek er niet van uit dat je niet kan; ze weten het gewoon niet, en bellen je dan.',
    removeLabel: (when: string) => `Weghalen: ${when}`,
    remove: 'Weghalen',
    removeConfirm: 'Venster weghalen',
    removeTitle: 'Venster weghalen?',
    removeDescription:
      'Logistiek weet dan niet meer dat je op dat moment kan rijden. Ritten die al aan jou toegewezen zijn, blijven staan.',
    removeDescriptionFor: (window: string) =>
      `${window} verdwijnt; Logistiek weet dan niet meer dat je op dat moment kan rijden. Ritten die al aan jou toegewezen zijn, blijven staan.`,
    cancel: 'Annuleren',
    gridEmpty: 'Nog niets ingetekend deze week.',
    brushGroup: 'Wat duid je aan',
    dragHelp:
      'Sleep met de muis over een dag: het venster staat er meteen, in de gekozen soort. Trek aan de boven- of onderrand om het korter of langer te maken, en klik erop om de soort te veranderen of het weg te halen. Een dag loopt hier van 05:00 tot 05:00, dus de nacht van zaterdag op zondag staat onderaan bij zaterdag.',
    back: 'Terug naar mijn ritten',
    swipe: 'Veeg over de uren.',
    previousWeek: 'Vorige week',
    nextWeek: 'Volgende week',
    erase: 'Wissen',
    at: 'om',
    nightNote: 'De nacht hoort bij de avond ervoor.',
    nothingMarked: 'Nog niets aangeduid',
    hours: (count: number) => `${count}u`,
    notePlaceholderShort: 'Nota voor deze week (optioneel)',
    noteLabel: 'Algemene nota voor deze week',
    noteTitle: 'Nota voor deze week',
    noteLead:
      'Iets dat voor de hele week geldt en niet bij één venster hoort. Logistiek leest het onder de beschikbaarheid in de planning. Leeg laten mag.',
    notePlaceholder: 'Bijvoorbeeld: die week examens, bel me liever dan te mailen.',
    editWindow: 'Venster aanpassen',
    copied: 'Vorige week overgenomen.',
    copying: 'Overnemen...',
    copyButton: 'Neem vorige week over',
    copyTitle: 'Vorige week overnemen?',
    copyConfirm: 'Vorige week overnemen',
    copyDescription: (current: number, previous: number) =>
      `${
        current === 1
          ? 'Het venster dat nu in deze week staat, verdwijnt'
          : `De ${current} vensters die nu in deze week staan, verdwijnen`
      }; in de plaats ${
        previous === 1 ? 'komt het venster' : `komen de ${previous} vensters`
      } van vorige week, op dezelfde uren. Je weeknota blijft staan.`,
    undo: 'Ongedaan maken',
    restored: 'Teruggezet zoals het stond.',
  },
  en: {
    windowRemoved: 'Window removed.',
    windowChanged: 'Window changed.',
    nowKind: (label: string) => `Now: ${label}.`,
    typeTitle: 'Type in a window',
    typeLead: 'For an exact time; the grid above works per hour.',
    howKeen: 'How keen',
    from: 'From',
    until: 'Until',
    to: 'to',
    saving: 'Saving...',
    saved: 'Saved',
    add: 'Add',
    listTitle: (count: number) => `When you can drive (${count})`,
    listEmpty:
      'Nothing entered yet. As long as you enter nothing, Logistics does not assume you cannot drive; they simply do not know, and will call you.',
    removeLabel: (when: string) => `Remove: ${when}`,
    remove: 'Remove',
    removeConfirm: 'Remove window',
    removeTitle: 'Remove this window?',
    removeDescription:
      'Logistics will no longer know that you can drive at that time. Trips already assigned to you stay as they are.',
    removeDescriptionFor: (window: string) =>
      `${window} disappears; Logistics will no longer know that you can drive at that time. Trips already assigned to you stay as they are.`,
    cancel: 'Cancel',
    gridEmpty: 'Nothing entered this week yet.',
    brushGroup: 'What are you marking',
    dragHelp:
      'Drag over a day with the mouse: the window appears straight away, in the chosen kind. Pull the top or bottom edge to make it shorter or longer, and click it to change the kind or remove it. A day runs from 05:00 to 05:00 here, so the night from Saturday to Sunday sits at the bottom of Saturday.',
    back: 'Back to my trips',
    swipe: 'Swipe over the hours.',
    previousWeek: 'Previous week',
    nextWeek: 'Next week',
    erase: 'Erase',
    at: 'at',
    nightNote: 'The night belongs to the evening before.',
    nothingMarked: 'Nothing marked yet',
    hours: (count: number) => `${count}h`,
    notePlaceholderShort: 'Note for this week (optional)',
    noteLabel: 'General note for this week',
    noteTitle: 'Note for this week',
    noteLead:
      'Something that applies to the whole week rather than one window. Logistics reads it under the availability in the planning. Leaving it empty is fine.',
    notePlaceholder: 'For example: exams that week, call me rather than email.',
    editWindow: 'Edit window',
    copied: 'Last week copied.',
    copying: 'Copying...',
    copyButton: 'Copy last week',
    copyTitle: 'Copy last week?',
    copyConfirm: 'Copy last week',
    copyDescription: (current: number, previous: number) =>
      `${
        current === 1
          ? 'The window that is in this week now disappears'
          : `The ${current} windows that are in this week now disappear`
      }; instead ${
        previous === 1 ? 'the window' : `the ${previous} windows`
      } from last week come in, at the same times. Your week note stays.`,
    undo: 'Undo',
    restored: 'Restored as it was.',
  },
} satisfies Record<LogistiekLocale, Record<string, unknown>>;

export type AvailabilityCopy = (typeof COPY)['nl'] & {
  locale: LogistiekLocale;
  kindLabel: (kind: AvailabilityKind) => string;
  kindShort: (kind: AvailabilityKind) => string;
  kindHint: (kind: AvailabilityKind) => string;
};

function build(locale: LogistiekLocale): AvailabilityCopy {
  const kinds = AVAILABILITY_KIND_COPY[locale];
  return {
    ...COPY[locale],
    locale,
    kindLabel: (kind) => kinds.label[kind],
    kindShort: (kind) => kinds.short[kind],
    kindHint: (kind) => kinds.hint[kind],
  };
}

const BUILT: Record<LogistiekLocale, AvailabilityCopy> = { nl: build('nl'), en: build('en') };

const AvailabilityCopyContext = createContext<AvailabilityCopy>(BUILT.nl);

export function AvailabilityCopyProvider({ locale, children }: { locale: LogistiekLocale; children: ReactNode }) {
  return <AvailabilityCopyContext.Provider value={BUILT[locale]}>{children}</AvailabilityCopyContext.Provider>;
}

/** De teksten van het intekenscherm, in de taal van de pagina. */
export function useAvailabilityCopy(): AvailabilityCopy {
  return useContext(AvailabilityCopyContext);
}

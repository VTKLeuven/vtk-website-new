'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@vtk/ui';
import { addEventExtraItemAction, removeEventExtraItemAction } from '@/app/actions/uitleen';

/**
 * Materiaal dat niet van Logistiek komt (E5): het theokot, de vicepraeses,
 * iemands eigen boxen.
 *
 * Het staat hier zodat de materiaallijst die de dag zelf meegaat compleet is.
 * Geen voorraad en geen goedkeuring: het is een notitie, geen aanvraag.
 */
export type ExtraItem = {
  id: string;
  source: string;
  itemName: string;
  quantity: number;
  note: string | null;
};

const inputClass = 'h-10 rounded-lg border border-vtk-navy/15 bg-white px-3 text-sm text-vtk-ink';

export function EventExtraItems({
  eventId,
  items,
  en,
}: {
  eventId: string;
  items: ExtraItem[];
  en: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [draft, setDraft] = useState({ source: '', itemName: '', quantity: '1', note: '' });
  const [notice, setNotice] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  function add() {
    startTransition(async () => {
      const result = await addEventExtraItemAction({ eventId, ...draft });
      if (!result.ok) {
        setNotice({ kind: 'error', text: result.error });
        return;
      }
      setDraft({ source: '', itemName: '', quantity: '1', note: '' });
      setNotice({ kind: 'ok', text: result.message ?? (en ? 'Added.' : 'Toegevoegd.') });
      router.refresh();
    });
  }

  function remove(itemId: string) {
    startTransition(async () => {
      const result = await removeEventExtraItemAction(itemId);
      if (!result.ok) {
        setNotice({ kind: 'error', text: result.error });
        return;
      }
      router.refresh();
    });
  }

  return (
    <section className="rounded-[18px] border border-vtk-navy/10 bg-vtk-surface p-6">
      <h2 className="text-lg font-semibold tracking-tight text-vtk-ink">
        {en ? 'Material from elsewhere' : 'Materiaal van elders'}
      </h2>
      <p className="mt-1 text-sm text-vtk-muted">
        {en
          ? 'Anything not borrowed from Logistics: the theokot, the vice-president, your own gear. Purely a note, so the list that goes out that day is complete.'
          : 'Alles wat je niet bij Logistiek leent: het theokot, de vicepraeses, je eigen spullen. Puur een notitie, zodat de lijst die de dag zelf meegaat compleet is.'}
      </p>

      {items.length > 0 ? (
        <ul className="mt-4 divide-y divide-vtk-navy/10">
          {items.map((item) => (
            <li key={item.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2.5 text-sm">
              <span className="min-w-0 flex-1">
                <span className="font-medium text-vtk-ink">
                  {item.quantity}× {item.itemName}
                </span>
                <span className="ml-2 rounded-full bg-vtk-paper-2 px-2 py-0.5 text-[11px] font-semibold text-vtk-navy">
                  {item.source}
                </span>
                {item.note ? (
                  <span className="block text-xs italic text-vtk-body">{item.note}</span>
                ) : null}
              </span>
              <button
                type="button"
                onClick={() => remove(item.id)}
                disabled={pending}
                className="text-xs text-vtk-muted underline underline-offset-2 disabled:opacity-50"
              >
                {en ? 'Remove' : 'Weghalen'}
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_5rem]">
        <label className="grid gap-1 text-sm">
          <span className="font-medium text-vtk-ink">{en ? 'What' : 'Wat'}</span>
          <input
            type="text"
            value={draft.itemName}
            onChange={(field) => setDraft({ ...draft, itemName: field.target.value })}
            placeholder={en ? 'E.g. beamer' : 'Bv. beamer'}
            className={inputClass}
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="font-medium text-vtk-ink">{en ? 'From' : 'Van wie'}</span>
          <input
            type="text"
            value={draft.source}
            onChange={(field) => setDraft({ ...draft, source: field.target.value })}
            placeholder={en ? 'E.g. Theokot' : 'Bv. Theokot'}
            className={inputClass}
            list={`extra-sources-${eventId}`}
          />
          <datalist id={`extra-sources-${eventId}`}>
            <option value="Theokot" />
            <option value="Vicepraeses" />
            <option value="Eigen materiaal" />
          </datalist>
        </label>
        <label className="grid gap-1 text-sm">
          <span className="font-medium text-vtk-ink">{en ? 'How many' : 'Aantal'}</span>
          <input
            type="number"
            min={1}
            value={draft.quantity}
            onChange={(field) => setDraft({ ...draft, quantity: field.target.value })}
            className={inputClass}
          />
        </label>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Button
          type="button"
          size="sm"
          onClick={add}
          disabled={pending || !draft.itemName.trim() || !draft.source.trim()}
        >
          {en ? 'Add to the list' : 'Aan de lijst toevoegen'}
        </Button>
        {notice ? (
          <p
            role="status"
            aria-live="polite"
            className={`text-sm font-medium ${
              notice.kind === 'error' ? 'text-red-700' : 'text-vtk-ink'
            }`}
          >
            {notice.text}
          </p>
        ) : null}
      </div>
    </section>
  );
}

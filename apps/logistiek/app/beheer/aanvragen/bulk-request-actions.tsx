'use client';

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  useTransition,
  type ReactNode,
} from 'react';
import { useRouter } from 'next/navigation';
import { Button, ConfirmDialog } from '@vtk/ui';
import { useToast } from '@/components/ui/toast';
import {
  bulkMarkPickedUpAction,
  bulkMarkReturnedAction,
  type BulkActionResult,
} from '@/app/actions/beheer';

type Selection = {
  selected: Set<string>;
  /** Ids van de zichtbare aanvragen die flesserke-lijnen hebben (zie `BulkActionBar`). */
  flesserkeIds: Set<string>;
  toggle: (id: string, checked: boolean) => void;
  setMany: (ids: string[], checked: boolean) => void;
  clear: () => void;
};

const SelectionContext = createContext<Selection | null>(null);

function useSelection(): Selection {
  const ctx = useContext(SelectionContext);
  if (!ctx) throw new Error('useSelection must be used within a <BulkSelectionProvider>');
  return ctx;
}

/**
 * Bewaart welke "Lopend"-aanvragen aangevinkt zijn voor een bulk-actie (N4).
 * Enkel rond die sectie: "Te beslissen" en "Afgelopen" krijgen geen
 * bulk-acties, dus die rijen hebben geen checkbox en delen deze context niet.
 *
 * `flesserkeIds` komt van de server (welke van de getoonde aanvragen
 * flesserke-lijnen hebben) zodat de actiebalk vóór de klik al kan waarschuwen
 * dat een bulk-terugbrenging die aanvragen overslaat.
 */
export function BulkSelectionProvider({
  children,
  flesserkeIds,
}: {
  children: ReactNode;
  flesserkeIds: string[];
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const flesserkeSet = useMemo(() => new Set(flesserkeIds), [flesserkeIds]);

  const toggle = useCallback((id: string, checked: boolean) => {
    setSelected((current) => {
      const next = new Set(current);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const setMany = useCallback((ids: string[], checked: boolean) => {
    setSelected((current) => {
      const next = new Set(current);
      for (const id of ids) {
        if (checked) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  }, []);

  const clear = useCallback(() => setSelected(new Set()), []);

  const value = useMemo(
    () => ({ selected, flesserkeIds: flesserkeSet, toggle, setMany, clear }),
    [selected, flesserkeSet, toggle, setMany, clear]
  );

  return <SelectionContext.Provider value={value}>{children}</SelectionContext.Provider>;
}

export function RowSelectCheckbox({ id, label }: { id: string; label: string }) {
  const { selected, toggle } = useSelection();
  return (
    <label className="flex cursor-pointer items-start pt-1">
      <input
        type="checkbox"
        checked={selected.has(id)}
        onChange={(event) => toggle(id, event.target.checked)}
        aria-label={label}
        className="h-4 w-4 shrink-0"
      />
    </label>
  );
}

/** Vinkje in de sectiekop dat alle zichtbare rijen tegelijk (de)selecteert. */
export function SelectAllCheckbox({ ids }: { ids: string[] }) {
  const { selected, setMany } = useSelection();
  const allSelected = ids.length > 0 && ids.every((id) => selected.has(id));
  if (ids.length === 0) return null;
  return (
    <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-vtk-muted">
      <input
        type="checkbox"
        checked={allSelected}
        onChange={(event) => setMany(ids, event.target.checked)}
        className="h-4 w-4"
      />
      Alles selecteren
    </label>
  );
}

type PendingAction = 'pickedUp' | 'returned' | null;

/**
 * Actiebalk boven "Lopend": de twee bulk-knoppen worden pas getoond zodra er
 * iets aangevinkt is, met het aantal in de knoptekst. Een aanvraag die de
 * overgang niet kan maken (verkeerde status, ondertussen gewijzigd) blokkeert
 * de rest van de batch niet: de server action verwerkt wat kan en de toast
 * meldt hoeveel er gelukt zijn.
 */
export function BulkActionBar() {
  const { selected, flesserkeIds, clear } = useSelection();
  const router = useRouter();
  const showToast = useToast();
  const [pending, startTransition] = useTransition();
  const [confirmAction, setConfirmAction] = useState<PendingAction>(null);

  const count = selected.size;

  function run(kind: 'pickedUp' | 'returned') {
    const ids = Array.from(selected);
    startTransition(async () => {
      const result: BulkActionResult =
        kind === 'pickedUp' ? await bulkMarkPickedUpAction(ids) : await bulkMarkReturnedAction(ids);
      setConfirmAction(null);
      if (result.succeeded > 0) {
        clear();
        router.refresh();
      }
      // Overgeslagen aanvragen tellen hier als "niet gelukt": ze blijven wachten
      // op iemand, dus de melding mag niet vanzelf verdwijnen.
      const incomplete = result.failed > 0 || result.skipped > 0;
      showToast({
        message: result.message,
        variant: incomplete ? 'error' : 'success',
        duration: incomplete ? 0 : undefined,
      });
    });
  }

  if (count === 0) return null;

  const plural = count === 1 ? 'aanvraag' : 'aanvragen';
  // Vóór de klik zeggen wat er niet mee zal gaan; achteraf melden dat er iets
  // overgeslagen is, leest als een fout van de gebruiker.
  const drinksSelected = Array.from(selected).filter((id) => flesserkeIds.has(id)).length;

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-[14px] border border-vtk-navy/15 bg-vtk-paper-2 px-4 py-3">
      <p className="text-sm font-medium text-vtk-ink">
        {count} {plural} geselecteerd
      </p>
      <div className="ml-auto flex flex-wrap gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setConfirmAction('pickedUp')}
          disabled={pending}
        >
          Markeer als afgehaald ({count})
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setConfirmAction('returned')}
          disabled={pending}
        >
          Markeer als teruggebracht ({count})
        </Button>
      </div>

      <ConfirmDialog
        open={confirmAction === 'pickedUp'}
        title={`${count} ${plural} als afgehaald markeren?`}
        description={`Dit zet ${count === 1 ? 'de geselecteerde aanvraag' : 'de geselecteerde aanvragen'} op "Afgehaald". Enkel goedgekeurde aanvragen kunnen deze stap maken; de rest wordt overgeslagen en gemeld.`}
        confirmLabel="Markeer als afgehaald"
        cancelLabel="Annuleren"
        destructive={false}
        pending={pending}
        onConfirm={() => run('pickedUp')}
        onCancel={() => setConfirmAction(null)}
      />
      <ConfirmDialog
        open={confirmAction === 'returned'}
        title={`${count} ${plural} als teruggebracht markeren?`}
        description={`Dit zet ${count === 1 ? 'de geselecteerde aanvraag' : 'de geselecteerde aanvragen'} op "Teruggebracht". Enkel afgehaalde aanvragen kunnen deze stap maken; de rest wordt overgeslagen en gemeld.${
          drinksSelected > 0
            ? ` ${drinksSelected} van je selectie ${drinksSelected === 1 ? 'bevat' : 'bevatten'} flesserke en ${drinksSelected === 1 ? 'blijft' : 'blijven'} staan: daar moet je per lijn invullen hoeveel er terugkwam, anders wordt alles als verbruikt afgeboekt.`
            : ''
        }`}
        confirmLabel="Markeer als teruggebracht"
        cancelLabel="Annuleren"
        destructive={false}
        pending={pending}
        onConfirm={() => run('returned')}
        onCancel={() => setConfirmAction(null)}
      />
    </div>
  );
}

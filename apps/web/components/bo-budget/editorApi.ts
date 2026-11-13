import type { CalcContext } from '@/lib/bo/budget/calc';
import type { Check } from '@/lib/bo/budget/checks';
import type { BudgetContent } from '@/lib/bo/budget/types';

/** Wat de onderdelen van de editor van het budget weten en mogen doen. */
export type EditorApi = {
  content: BudgetContent;
  ctx: CalcContext;
  nl: boolean;
  readOnly: boolean;
  /** Wijzigt het budget; de editor bewaart het kort daarna zelf. */
  mutate: (change: (draft: BudgetContent) => void) => void;
  /** Opent het paneel met alles over één regel. */
  openRow: (rowId: string, opener?: HTMLElement | null) => void;
  /** De controles per regel, voor het bolletje in de tabel. */
  checksByRow: Map<string, Check[]>;
  /** Een regel die net toegevoegd werd en de focus moet krijgen. */
  focusRowId: string | null;
  clearFocusRow: () => void;
  addRow: (sectionId: string, kind?: 'row' | 'forfait' | 'rest') => void;
  locationNames: string[];
  /** Mag de site prijzen opvragen bij de webshops (instellingen, en niet ingediend)? */
  liveCollectGo: boolean;
  /** De regels waarvan de prijs nu opgevraagd wordt, of null. */
  checkingRows: string[] | null;
  checkPrices: (rowIds?: string[]) => void;
  /** Staat het resultaat aan? Dan tonen de tabellen de kolom Resultaat. */
  resultOn: boolean;
  /** De prijs die de webshop gaf, overnemen in de regel. */
  acceptPrice: (rowId: string) => void;
  /** Iemand keek de prijs zelf na (of trekt dat in). De server zet de echte naam bij het bewaren. */
  confirmPrice: (rowId: string, on: boolean) => void;
  /** Groep 5: deze prijs onthouden als vaste prijs, voor elk budget. Null voor wie dat niet mag. */
  rememberFixed: ((rowId: string) => void) | null;
};

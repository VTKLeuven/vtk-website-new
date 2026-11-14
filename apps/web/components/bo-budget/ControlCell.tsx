'use client';

import type { ReactElement } from 'react';
import { IconButton } from '@/components/ui/IconButton';
import {
  AlertIcon,
  CheckIcon,
  CheckSquareIcon,
  ClockIcon,
  InfoIcon,
  LinkOffIcon,
  TakeOverIcon,
  UndoIcon,
  UserCheckIcon,
} from '@/components/ui/icons';
import { CONTROL_TONE, type Control, type ControlState } from '@/lib/bo/budget/control';
import type { CostRow } from '@/lib/bo/budget/types';
import { money } from './format';

export const CONTROL_ICON: Record<ControlState, () => ReactElement> = {
  ok: CheckIcon,
  fixed: CheckIcon,
  confirmed: UserCheckIcon,
  waiting: ClockIcon,
  byhand: InfoIcon,
  changed: AlertIcon,
  notfound: AlertIcon,
  failed: AlertIcon,
  offfixed: AlertIcon,
  nolink: LinkOffIcon,
  nosource: LinkOffIcon,
};

export type ControlActions = {
  /** Iemand keek de prijs zelf na, of trekt dat in. */
  confirm: (rowId: string, on: boolean) => void;
  /** De prijs die de winkel gaf, overnemen. */
  accept: (rowId: string) => void;
};

/**
 * De kolom Controle: een icoon met de uitleg in de tooltip, en enkel voor wat
 * aandacht vraagt een kort woord. "Zelf nagekeken" en "Intrekken" zijn
 * rij-acties en verschijnen bij hover of focus (op een aanraakscherm altijd);
 * de prijs van de winkel overnemen staat er meteen, want die vraagt iets.
 * Zonder `actions` (alleen bekijken, of het budget ligt vast) enkel de stand.
 */
export function ControlCell({
  control,
  row,
  nl,
  actions,
}: {
  control: Control;
  row: CostRow;
  nl: boolean;
  actions?: ControlActions;
}) {
  const Icon = CONTROL_ICON[control.state];
  const tone = CONTROL_TONE[control.state];
  const name = row.name || '…';
  return (
    <span className="vtk-rev-check">
      {control.word && (
        <span className="vtk-rev-word" data-tone={tone}>
          {control.word}
        </span>
      )}
      {actions && control.shopPrice != null && (
        <IconButton
          className="vtk-rev-ico"
          label={nl ? `${money(control.shopPrice)} overnemen` : `Use ${money(control.shopPrice, false)}`}
          srLabel={
            nl ? `Prijs van de winkel overnemen: ${name}, ${money(control.shopPrice)}` : `Use the shop price: ${name}`
          }
          onClick={() => actions.accept(row.id)}
        >
          <TakeOverIcon />
        </IconButton>
      )}
      {actions && control.offer && (
        <IconButton
          className="vtk-rev-ico vtk-rev-hover"
          label={nl ? 'Zelf nagekeken' : 'Checked by hand'}
          srLabel={nl ? `Prijs zelf nagekeken: ${name}` : `Price checked by hand: ${name}`}
          onClick={() => actions.confirm(row.id, true)}
        >
          <CheckSquareIcon />
        </IconButton>
      )}
      {actions && control.state === 'confirmed' && (
        <IconButton
          className="vtk-rev-ico vtk-rev-hover"
          label={nl ? 'Zelf nagekeken intrekken' : 'Undo checked by hand'}
          srLabel={nl ? `Zelf nagekeken intrekken: ${name}` : `Undo checked by hand: ${name}`}
          onClick={() => actions.confirm(row.id, false)}
        >
          <UndoIcon />
        </IconButton>
      )}
      <span className="vtk-rev-state" data-tone={tone} role="img" title={control.tip} aria-label={control.tip}>
        <Icon />
      </span>
    </span>
  );
}

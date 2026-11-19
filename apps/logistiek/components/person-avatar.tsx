import { driverColorVar } from '@/lib/driver-colors';

/**
 * Een rondje met initialen, voor iedereen rond een rit op "Mijn ritten".
 *
 * De kleur komt uit het chauffeurspalet (`--driver-*`): een chauffeur draagt zo
 * dezelfde kleur als in de planning, en iemand anders krijgt er een uit zijn
 * naam. Die tinten zijn op `--driver-ink` gecontroleerd en draaien mee in de
 * donkere modus. Jij bent altijd geel.
 */
export function initials(name: string): string {
  const words = name.split(/\s+/).filter((word) => /^\p{L}/u.test(word));
  if (words.length === 0) return '?';
  const first = words[0].charAt(0);
  const last = words.length > 1 ? words[words.length - 1].charAt(0) : '';
  return (first + last).toUpperCase();
}

export function Avatar({
  name = '',
  color,
  me = false,
  en = false,
  size = 'normal',
}: {
  name?: string;
  color?: string;
  me?: boolean;
  en?: boolean;
  size?: 'normal' | 'small';
}) {
  const className = `trips-avatar${size === 'small' ? ' trips-avatar-small' : ''}${me ? ' trips-avatar-me' : ''}`;
  return (
    <span
      className={className}
      style={me ? undefined : { background: color ?? driverColorVar(name) }}
      aria-hidden
    >
      {me ? (en ? 'YOU' : 'JIJ') : initials(name)}
    </span>
  );
}

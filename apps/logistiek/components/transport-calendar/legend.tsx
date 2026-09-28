import { vehiclePatternClass } from '@/lib/driver-colors';
import type { LogistiekLocale } from '@/lib/i18n-shared';

/**
 * De legende onder de transportplanning (F4.16).
 *
 * **Ze tekent de echte blokken, met dezelfde klassen**, in plaats van in woorden
 * te beschrijven hoe een blok eruitziet. Dat is de hele reden dat dit bestaat:
 * de zin die hier stond, beloofde "geel met een rode streepjesrand" terwijl de
 * CSS al een ronde lang grijs tekende. Een legende die uit tekst bestaat, is een
 * tweede waarheid over hetzelfde, en die twee lopen uit elkaar zodra iemand er
 * één aanpast. Verandert de arcering of de rand nu, dan verandert deze legende
 * mee, want het zijn dezelfde klassen.
 *
 * Wat er per scherm in staat, verschilt: zonder login staan er geen chauffeurs
 * op het rooster, en dan hoort er ook geen vulkleur in de legende.
 */

/** Eén voorbeeldblok met zijn uitleg ernaast. */
function Sample({
  className,
  style,
  children,
}: {
  className?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {/* Een echt blok in het klein: dezelfde klassen, dus ook dezelfde randen.
          De hairline staat er altijd onder, zodat de klasse die erbij komt haar
          eigen rand kan overschrijven precies zoals op de kalender. */}
      <span
        aria-hidden
        className={`h-5 w-8 shrink-0 rounded-[4px] border border-vtk-navy/15 ${className ?? ''}`}
        style={style}
      />
      {children}
    </span>
  );
}

/**
 * De uitleg naast elk voorbeeldblok, in beide talen.
 *
 * Het bezettingsoverzicht is ledenoppervlak en volgt de taal van de bezoeker;
 * de planning van het team staat altijd in het Nederlands, zoals de rest van
 * het beheer, en geeft `locale` gewoon niet mee.
 */
const WORDS = {
  nl: {
    driver: 'de vulkleur is de',
    driverStrong: 'chauffeur',
    requested: 'nog te beslissen, dit moment kan vrijkomen',
    noDriver: 'nog geen chauffeur',
    mine: 'van jouw post of werkgroep',
    conflict: 'hetzelfde voertuig staat dubbel geboekt',
    done: 'afgerond',
  },
  en: {
    driver: 'the fill colour is the',
    driverStrong: 'driver',
    requested: 'not decided yet, this slot may free up',
    noDriver: 'no driver yet',
    mine: 'of your post or working group',
    conflict: 'this vehicle is double-booked',
    done: 'completed',
  },
} as const;

export function TransportLegend({
  vehicles,
  showDriver,
  showConflict = false,
  showMine = false,
  locale = 'nl',
}: {
  /** De voertuigen met hun arcering, zodat het patroon een naam krijgt. */
  vehicles: Array<{ name: string; pattern: string | null | undefined }>;
  /** Staan er chauffeursnamen op het rooster? Zo niet, dan zegt de kleur niets. */
  showDriver: boolean;
  /** Enkel op de planning van het team: daar kan je ritten laten botsen. */
  showConflict?: boolean;
  /** Enkel waar een post naar de hele kring kijkt (F4.15). */
  showMine?: boolean;
  locale?: LogistiekLocale;
}) {
  const words = WORDS[locale === 'en' ? 'en' : 'nl'];
  const hatched = vehicles.filter((vehicle) => vehiclePatternClass(vehicle.pattern) !== '');
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-vtk-muted">
      {showDriver ? (
        <Sample style={{ backgroundColor: 'var(--driver-11)' }}>
          {words.driver} <strong className="font-semibold text-vtk-ink">{words.driverStrong}</strong>
        </Sample>
      ) : null}

      {/* De arcering per voertuig, met de naam erbij: een patroon zonder naam is
          een raadsel, en met drie voertuigen past het gewoon op één regel.

          Enkel de voertuigen die er écht een hebben. Een voertuig zonder
          arcering valt weg in plaats van als leeg vakje in de rij te staan: drie
          identieke vakjes met drie namen ernaast beweren dat je ze uit elkaar
          kan houden, en dat is precies het soort belofte waar deze legende van
          af moest. */}
      {hatched.map((vehicle) => (
        <Sample
          key={vehicle.name}
          className={vehiclePatternClass(vehicle.pattern)}
          style={{ backgroundColor: showDriver ? 'var(--driver-none)' : 'var(--surface)' }}
        >
          {vehicle.name}
        </Sample>
      ))}

      <Sample className="trip-requested" style={{ backgroundColor: 'var(--driver-none)' }}>
        {words.requested}
      </Sample>

      {showDriver ? (
        <Sample className="border-2 trip-no-driver" style={{ backgroundColor: 'var(--driver-none)' }}>
          {words.noDriver}
        </Sample>
      ) : null}

      {showMine ? (
        <Sample className="trip-mine" style={{ backgroundColor: 'var(--driver-none)' }}>
          {words.mine}
        </Sample>
      ) : null}

      {showConflict ? (
        <Sample className="border-2 border-vtk-danger bg-vtk-danger-soft">
          {words.conflict}
        </Sample>
      ) : null}

      <Sample className="opacity-60" style={{ backgroundColor: 'var(--driver-none)' }}>
        {words.done}
      </Sample>
    </div>
  );
}

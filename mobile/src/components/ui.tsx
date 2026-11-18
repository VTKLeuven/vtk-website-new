import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { COLORS, RADIUS, SPACING, TYPE } from '../theme/tokens';

/**
 * De bouwstenen die op elk scherm terugkomen, in de taal van de site:
 * witte kaarten met een dunne navy-getinte rand op een papieren grond, een
 * donkere primaire knop, en geel enkel als accent.
 *
 * Geen gradiënten, geen schaduwspel, geen kaart in een kaart. Dat is geen smaak
 * maar de afspraak in CLAUDE.md, en ze houdt de app en de site op elkaar.
 */

// ── Kaart ───────────────────────────────────────────────────────────────────

export function Card({
  children,
  style,
  /** Markeert een uitgelichte kaart met een gele rail, zoals op de site. */
  featured = false,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  featured?: boolean;
}) {
  return (
    <View style={[styles.card, featured && styles.cardFeatured, style]}>{children}</View>
  );
}

/**
 * Een aanraakbare kaart. Bewust een lichte indruk bij het indrukken en geen
 * beweging: de site houdt hover ook ingetogen.
 */
export function CardButton({
  children,
  onPress,
  style,
  accessibilityLabel,
}: {
  children: React.ReactNode;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed, style]}
    >
      {children}
    </Pressable>
  );
}

// ── Knoppen ─────────────────────────────────────────────────────────────────

export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled = false,
  busy = false,
  /** Op een donkere band keert de primaire knop om, net als op de site. */
  onDark = false,
}: {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'ghost';
  disabled?: boolean;
  busy?: boolean;
  onDark?: boolean;
}) {
  const inactive = disabled || busy;
  const primary = variant === 'primary';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: inactive, busy }}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        primary ? (onDark ? styles.buttonPrimaryOnDark : styles.buttonPrimary) : styles.buttonGhost,
        onDark && !primary && styles.buttonGhostOnDark,
        pressed && styles.buttonPressed,
        inactive && styles.buttonDisabled,
      ]}
    >
      {busy ? (
        <ActivityIndicator color={primary && !onDark ? COLORS.paper : COLORS.ink} size="small" />
      ) : (
        <Text
          style={[
            styles.buttonLabel,
            primary
              ? onDark
                ? styles.buttonLabelOnDarkPrimary
                : styles.buttonLabelPrimary
              : styles.buttonLabelGhost,
            onDark && !primary && styles.buttonLabelOnDarkGhost,
          ]}
        >
          {label}
        </Text>
      )}
    </Pressable>
  );
}

// ── Toestanden ──────────────────────────────────────────────────────────────

/**
 * Een leeg scherm zegt wát er leeg is en wat je eraan kan doen. "Geen resultaten"
 * zonder meer is een doodlopende straat.
 */
export function Empty({
  title,
  hint,
  action,
}: {
  title: string;
  hint?: string;
  action?: { label: string; onPress: () => void };
}) {
  return (
    <View style={styles.state}>
      <Text style={styles.stateTitle}>{title}</Text>
      {hint ? <Text style={styles.stateHint}>{hint}</Text> : null}
      {action ? <Button label={action.label} onPress={action.onPress} variant="ghost" /> : null}
    </View>
  );
}

/**
 * Iets ging mis. Onderscheidt bewust "geen verbinding" van "de server zei nee":
 * bij het eerste helpt opnieuw proberen, bij het tweede zelden.
 */
export function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <View style={styles.state}>
      <Text style={styles.stateTitle}>Dat lukte niet</Text>
      <Text style={styles.stateHint}>{message}</Text>
      {onRetry ? <Button label="Opnieuw proberen" onPress={onRetry} variant="ghost" /> : null}
    </View>
  );
}

export function Loading({ label = 'Bezig met laden' }: { label?: string }) {
  return (
    <View style={styles.state}>
      <ActivityIndicator color={COLORS.navy} />
      <Text style={styles.stateHint}>{label}</Text>
    </View>
  );
}

/**
 * De strook boven een scherm dat uit de cache komt. Verzwijgen dat je oude
 * inhoud toont is erger dan een leeg scherm: iemand plant er zijn avond mee.
 */
export function StaleNotice({ onRetry }: { onRetry: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onRetry} style={styles.stale}>
      <Text style={styles.staleText}>
        Niet vernieuwd. Je ziet wat er de vorige keer opgehaald is. Tik om opnieuw te proberen.
      </Text>
    </Pressable>
  );
}

/**
 * Een kop met de gele lijn eronder, zo breed als de kop zelf: de behandeling van
 * een h2 op de site (`.prose-vtk h2::after`, de titel van een eventtegel, "Over
 * dit event"). Een lijn over de hele breedte leest als een scheiding tussen twee
 * delen, niet als een lijn onder een titel.
 */
export function SectionHeading({
  children,
  right,
}: {
  children: string;
  /** Een link of actie rechts op dezelfde hoogte, zoals "Kalender ->". */
  right?: React.ReactNode;
}) {
  return (
    <View style={styles.headingRow}>
      <View style={styles.heading}>
        <Text style={styles.headingText}>{children}</Text>
      </View>
      {right ?? null}
    </View>
  );
}

/**
 * De kop van een week in een agenda, zoals op /shift: een haarlijn erboven, de
 * naam ("Deze week") en het bereik ernaast.
 */
export function WeekHead({ name, range }: { name: string; range: string }) {
  return (
    <View style={styles.week}>
      <Text style={styles.weekName}>{name}</Text>
      <Text style={styles.weekRange}>{range}</Text>
    </View>
  );
}

export function SectionTitle({ children }: { children: string }) {
  return <Text style={styles.sectionTitle}>{children}</Text>;
}

const styles = StyleSheet.create({
  headingRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: SPACING.md,
  },
  heading: {
    alignSelf: 'flex-start',
    paddingBottom: 6,
    borderBottomWidth: 3,
    borderBottomColor: COLORS.yellow,
  },
  headingText: { ...TYPE.heading, color: COLORS.ink },
  week: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: SPACING.sm,
    paddingTop: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: COLORS.line2,
  },
  weekName: { ...TYPE.cardTitle, fontSize: 17, color: COLORS.ink },
  weekRange: { ...TYPE.small, color: COLORS.muted },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.line,
    padding: SPACING.lg,
    gap: SPACING.sm,
  },
  cardFeatured: {
    borderLeftWidth: 3,
    borderLeftColor: COLORS.yellow,
  },
  cardPressed: { backgroundColor: COLORS.paper2 },

  button: {
    minHeight: 44,
    paddingHorizontal: SPACING.xl,
    borderRadius: RADIUS.pill,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  buttonPrimary: { backgroundColor: COLORS.ink, borderColor: COLORS.ink },
  buttonPrimaryOnDark: { backgroundColor: COLORS.surface, borderColor: COLORS.surface },
  buttonGhost: { backgroundColor: 'transparent', borderColor: COLORS.line2 },
  buttonGhostOnDark: { borderColor: 'rgba(255,255,255,0.28)' },
  buttonPressed: { opacity: 0.85 },
  buttonDisabled: { opacity: 0.45 },
  buttonLabel: { ...TYPE.body, fontFamily: TYPE.cardTitle.fontFamily },
  buttonLabelPrimary: { color: COLORS.paper },
  buttonLabelOnDarkPrimary: { color: COLORS.ink },
  buttonLabelGhost: { color: COLORS.ink },
  buttonLabelOnDarkGhost: { color: COLORS.onDark },

  state: { padding: SPACING.xl, gap: SPACING.md, alignItems: 'flex-start' },
  stateTitle: { ...TYPE.cardTitle, color: COLORS.ink },
  stateHint: { ...TYPE.body, color: COLORS.muted },

  stale: {
    backgroundColor: COLORS.paper2,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.line,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
  },
  staleText: { ...TYPE.small, color: COLORS.body },

  sectionTitle: { ...TYPE.sectionTitle, color: COLORS.ink },
});

import * as WebBrowser from 'expo-web-browser';
import {
  BookOpen,
  CalendarCheck,
  Check,
  Eye,
  EyeOff,
  Flag,
  Link2,
  RefreshCw,
  Repeat,
  ExternalLink,
  Trash2,
  Unlink,
  Users,
  X,
} from 'lucide-react-native';
import { useState } from 'react';
import {
  Alert,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { AppPlanning } from '../../api/contract';
import { mondayOf, shortDay, TYPE_LABELS, type Ref } from '../../planning/grid';
import type { PlanningHandle } from '../../planning/usePlanning';
import { COLORS, FONTS, PLANNING, RADIUS, SPACING, TYPE } from '../../theme/tokens';
import { Button } from '../ui';

/** Een blad dat van onder inschuift, op papier, zoals de rest van de app. */
export function Sheet({
  visible,
  title,
  onClose,
  children,
}: {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.root}>
        <Pressable style={styles.scrim} onPress={onClose} accessibilityLabel="Sluiten" />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + SPACING.lg }]}>
          <View style={styles.header}>
            <Text style={styles.title} numberOfLines={3}>
              {title}
            </Text>
            <Pressable onPress={onClose} hitSlop={12} accessibilityLabel="Sluiten" accessibilityRole="button">
              <X size={20} color={COLORS.muted} />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
            {children}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

/** Een regel met een actie: icoon, tekst, en eventueel een korte uitleg eronder. */
function ActionRow({
  icon: Icon,
  label,
  hint,
  onPress,
  disabled,
  destructive,
}: {
  icon: typeof Check;
  label: string;
  hint?: string;
  onPress: () => void;
  disabled?: boolean;
  destructive?: boolean;
}) {
  const colour = destructive ? PLANNING.dangerText : COLORS.ink;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed, disabled && styles.disabled]}
    >
      <Icon size={18} color={colour} />
      <View style={styles.rowText}>
        <Text style={[styles.rowLabel, { color: colour }]}>{label}</Text>
        {hint ? <Text style={styles.rowHint}>{hint}</Text> : null}
      </View>
    </Pressable>
  );
}

function Fact({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <View style={styles.fact}>
      <Text style={styles.factLabel}>{label}</Text>
      <Text style={styles.factValue}>{value}</Text>
    </View>
  );
}

/** Wat er geselecteerd is, opgezocht in de nieuwste planning zodat het blad meeverandert. */
export type Selection = { kind: 'session' | 'item' | 'vtk'; id: string; occurrence?: string } | null;

export function selectionOf(ref: Ref): Selection {
  if (ref.kind === 'session') return { kind: 'session', id: ref.session.uid };
  if (ref.kind === 'item') return { kind: 'item', id: ref.item.id };
  return { kind: 'vtk', id: ref.event.id, occurrence: ref.occurrence.key };
}

function resolve(planning: AppPlanning, selection: Selection): Ref | null {
  if (!selection) return null;
  if (selection.kind === 'session') {
    const session = planning.sessions.find((s) => s.uid === selection.id);
    return session ? { kind: 'session', session } : null;
  }
  if (selection.kind === 'item') {
    const item = planning.items.find((i) => i.id === selection.id);
    return item ? { kind: 'item', item } : null;
  }
  const event = planning.vtkEvents.find((v) => v.id === selection.id);
  const occurrence = event?.occurrences.find((o) => o.key === selection.occurrence) ?? event?.occurrences[0];
  return event && occurrence ? { kind: 'vtk', event, occurrence } : null;
}

const range = (start: string | null, end: string | null) => (start ? (end ? `${start} - ${end}` : start) : null);

/**
 * Wat je met één les, deadline of VTK-evenement kan doen. Dezelfde handelingen
 * als het dialoogvenster op Burgieclan; wat je hier doet, staat daar ook.
 */
export function DetailSheet({
  handle,
  selection,
  onClose,
  onOpenEvent,
}: {
  handle: PlanningHandle;
  selection: Selection;
  onClose: () => void;
  onOpenEvent: (id: string) => void;
}) {
  const planning = handle.data;
  const ref = planning ? resolve(planning, selection) : null;
  const busy = handle.busy;

  if (!planning || !ref) {
    return <Sheet visible={false} title="" onClose={onClose}>{null}</Sheet>;
  }

  if (ref.kind === 'vtk') {
    const { event, occurrence } = ref;
    return (
      <Sheet visible title={event.title} onClose={onClose}>
        <Text style={styles.kicker}>VTK-evenement</Text>
        <Fact label="Wanneer" value={`${shortDay(occurrence.date)}${occurrence.allDay ? '' : `, ${range(occurrence.start, occurrence.end)}`}${occurrence.endDate !== occurrence.date ? ` tot ${shortDay(occurrence.endDate)}` : ''}`} />
        <Fact label="Moment" value={occurrence.label} />
        <Fact label="Waar" value={occurrence.location ?? event.location} />
        <View style={styles.actions}>
          <ActionRow
            icon={CalendarCheck}
            label="Bekijk het evenement"
            onPress={() => {
              onClose();
              onOpenEvent(event.id);
            }}
          />
          <ActionRow
            icon={Trash2}
            label="Uit mijn planning halen"
            hint="Het evenement blijft op de kalender staan; het verdwijnt enkel uit je planning en je geëxporteerde agenda."
            disabled={busy}
            destructive
            onPress={() => {
              void handle.run({ op: 'removeVtkEvent', vtkEventId: event.id }).then((ok) => ok && onClose());
            }}
          />
        </View>
      </Sheet>
    );
  }

  if (ref.kind === 'item') {
    const { item } = ref;
    return (
      <Sheet visible title={item.title} onClose={onClose}>
        <Text style={styles.kicker}>{item.kind === 'deadline' ? 'Deadline' : 'Verplichte sessie'}</Text>
        <Fact label="Vak" value={item.subjectLabel} />
        <Fact
          label={item.kind === 'deadline' ? 'Tegen' : 'Wanneer'}
          value={`${shortDay(item.date)}${item.time ? `, ${range(item.time, item.end)}` : item.kind === 'deadline' ? ', einde van de dag' : ''}`}
        />
        <Fact label="Notitie" value={item.note} />
        <View style={styles.actions}>
          <ActionRow
            icon={Check}
            label={item.done ? 'Niet meer afgevinkt' : 'Afvinken'}
            disabled={busy}
            onPress={() => void handle.run({ op: 'itemDone', id: item.id, value: !item.done })}
          />
          <ActionRow
            icon={Trash2}
            label="Verwijderen"
            disabled={busy}
            destructive
            onPress={() =>
              Alert.alert(
                'Deze deadline verwijderen?',
                `"${item.title}" verdwijnt uit je planning, ook op Burgieclan en uit je geëxporteerde agenda. Je lessen en je andere deadlines blijven staan.`,
                [
                  { text: 'Annuleren', style: 'cancel' },
                  {
                    text: 'Verwijderen',
                    style: 'destructive',
                    onPress: () => void handle.run({ op: 'deleteItem', id: item.id }).then((ok) => ok && onClose()),
                  },
                ],
              )
            }
          />
        </View>
      </Sheet>
    );
  }

  const { session } = ref;
  const week = mondayOf(session.date);
  const parallel = planning.sessions.some(
    (other) => other.uid !== session.uid && other.course === session.course && mondayOf(other.date) === week,
  );
  const run = handle.run;

  return (
    <Sheet visible title={session.course} onClose={onClose}>
      <Text style={styles.kicker}>
        {TYPE_LABELS[session.type] ?? TYPE_LABELS.other}
        {session.code ? `, ${session.code}` : ''}
      </Text>
      <Fact label="Wanneer" value={`${shortDay(session.date)}, ${range(session.start, session.end)}`} />
      <Fact label="Waar" value={session.location} />
      <Fact label="Door" value={session.people} />
      <Fact
        label="Staat"
        value={[
          session.done ? 'Afgevinkt' : null,
          session.mandatory === 'event' ? 'Verplicht' : session.mandatory === 'rule' ? 'Elke week verplicht' : null,
          session.hidden === 'event' ? 'Verborgen' : session.hidden === 'rule' ? 'Elke week verborgen' : null,
        ]
          .filter(Boolean)
          .join(', ')}
      />

      <View style={styles.actions}>
        <ActionRow
          icon={Check}
          label={session.done ? 'Niet meer afgevinkt' : 'Afvinken'}
          hint={session.done ? undefined : 'Gevolgd of ingehaald.'}
          disabled={busy}
          onPress={() => void run({ op: 'done', uid: session.uid, value: !session.done })}
        />

        {session.mandatory === 'rule' && session.mandatoryRule ? (
          <ActionRow
            icon={Repeat}
            label="Niet meer elke week verplicht"
            disabled={busy}
            onPress={() => void run({ op: 'removeRule', id: session.mandatoryRule as string })}
          />
        ) : session.mandatory === 'event' ? (
          <ActionRow
            icon={Flag}
            label="Niet meer verplicht"
            disabled={busy}
            onPress={() => void run({ op: 'mandatory', uid: session.uid, value: false })}
          />
        ) : (
          <>
            <ActionRow
              icon={Flag}
              label="Verplicht"
              hint="Komt in je agenda als MANDATORY."
              disabled={busy}
              onPress={() => void run({ op: 'mandatory', uid: session.uid, value: true })}
            />
            <ActionRow
              icon={Repeat}
              label="Elke week verplicht"
              hint="Elke les van dit vak op deze dag, dit uur en in dit lokaal."
              disabled={busy}
              onPress={() => void run({ op: 'addRule', uid: session.uid, action: 'mandatory' })}
            />
          </>
        )}

        {session.hidden === 'rule' && session.hiddenRule ? (
          <ActionRow
            icon={Eye}
            label="Niet meer elke week verbergen"
            disabled={busy}
            onPress={() => void run({ op: 'removeRule', id: session.hiddenRule as string })}
          />
        ) : session.hidden === 'event' ? (
          <ActionRow
            icon={Eye}
            label="Terug tonen"
            disabled={busy}
            onPress={() => void run({ op: 'hide', uid: session.uid, value: false })}
          />
        ) : (
          <>
            {parallel ? (
              <ActionRow
                icon={Users}
                label="Ik ga naar deze groep"
                hint="Verbergt de andere groepen van dit vak deze week."
                disabled={busy}
                onPress={() => void run({ op: 'keepOnly', uid: session.uid })}
              />
            ) : null}
            <ActionRow
              icon={EyeOff}
              label="Verbergen"
              disabled={busy}
              onPress={() => void run({ op: 'hide', uid: session.uid, value: true })}
            />
            <ActionRow
              icon={Repeat}
              label="Elke week verbergen"
              hint="Elke les van dit vak op deze dag, dit uur en in dit lokaal."
              disabled={busy}
              onPress={() => void run({ op: 'addRule', uid: session.uid, action: 'hide' })}
            />
          </>
        )}

        {session.courseUrl ? (
          <ActionRow
            icon={BookOpen}
            label="Vak op Burgieclan"
            hint="Cursussen, examens en samenvattingen."
            onPress={() => void WebBrowser.openBrowserAsync(session.courseUrl as string)}
          />
        ) : null}
      </View>
    </Sheet>
  );
}

/** De geëxporteerde agenda: lessen, deadlines en VTK-evenementen in één abonnement. */
export function ExportSheet({
  visible,
  handle,
  onClose,
}: {
  visible: boolean;
  handle: PlanningHandle;
  onClose: () => void;
}) {
  const planning = handle.data;
  const feed = planning?.feedUrl ?? null;
  const webcal = planning?.webcalUrl ?? null;

  return (
    <Sheet visible={visible} title="Je planning in je eigen agenda" onClose={onClose}>
      <Text style={styles.text}>
        Een link waarop Apple Agenda, Google Agenda of Outlook zich kan abonneren. Je lessen zonder
        de verborgen, verplichte lessen als MANDATORY, je deadlines, en de VTK-evenementen die je in
        je planning zette. Het is dezelfde link als op Burgieclan.
      </Text>
      {feed ? (
        <Text selectable style={styles.link}>
          {feed}
        </Text>
      ) : null}
      <View style={styles.buttons}>
        {webcal ? (
          <Button
            label="Abonneren in mijn agenda"
            onPress={() =>
              void Linking.openURL(webcal).catch(() =>
                Alert.alert('Geen agenda-app gevonden', 'Deel de link en voeg hem toe als agenda via URL.'),
              )
            }
          />
        ) : null}
        {feed ? (
          <Button label="Link delen" variant="ghost" onPress={() => void Share.share({ message: feed })} />
        ) : null}
      </View>
      <Text style={styles.hint}>
        Zeg je abonnement op het KU Leuven-rooster op, anders staat elke les er twee keer. Google
        Agenda ververst een geabonneerde agenda maar om de paar uur.
      </Text>
      <View style={styles.actions}>
        <ActionRow
          icon={Link2}
          label="Maak een nieuwe link"
          hint="Iedereen met de link kan je planning zien."
          disabled={handle.busy}
          onPress={() =>
            Alert.alert(
              'Een nieuwe link maken?',
              'De huidige link werkt meteen niet meer, ook niet in een agenda die erop geabonneerd is. Je planning zelf blijft zoals ze is.',
              [
                { text: 'Annuleren', style: 'cancel' },
                { text: 'Nieuwe link', style: 'destructive', onPress: () => void handle.rotateFeed() },
              ],
            )
          }
        />
      </View>
    </Sheet>
  );
}

/** Instellingen van de planning: synchroniseren, verborgen lessen, de link, ontkoppelen. */
export function SettingsSheet({
  visible,
  handle,
  showHidden,
  onToggleHidden,
  onChangeLink,
  onClose,
}: {
  visible: boolean;
  handle: PlanningHandle;
  showHidden: boolean;
  onToggleHidden: () => void;
  onChangeLink: () => void;
  onClose: () => void;
}) {
  const planning = handle.data;
  return (
    <Sheet visible={visible} title="Planning" onClose={onClose}>
      <View style={styles.actions}>
        <ActionRow
          icon={RefreshCw}
          label="Nu synchroniseren"
          hint={planning?.lastSync ? `Laatst met KU Leuven: ${new Date(planning.lastSync).toLocaleString('nl-BE')}` : undefined}
          disabled={handle.busy}
          onPress={() => void handle.sync()}
        />
        <ActionRow
          icon={showHidden ? EyeOff : Eye}
          label={showHidden ? 'Verborgen lessen niet tonen' : 'Verborgen lessen tonen'}
          onPress={() => {
            onToggleHidden();
            onClose();
          }}
        />
        <ActionRow icon={Link2} label="Ander lessenrooster koppelen" onPress={onChangeLink} />
        {planning ? (
          <ActionRow
            icon={ExternalLink}
            label="Open op Burgieclan"
            hint="Het overzicht per vak en deadlines toevoegen."
            onPress={() => void WebBrowser.openBrowserAsync(planning.burgieclanUrl)}
          />
        ) : null}
        <ActionRow
          icon={Unlink}
          label="Lessenrooster ontkoppelen"
          destructive
          disabled={handle.busy}
          onPress={() =>
            Alert.alert(
              'Je planning wissen?',
              'Je lessenrooster wordt ontkoppeld en je hele planning gaat weg, ook op Burgieclan: wat je afvinkte, je deadlines, je wekelijkse regels en de VTK-evenementen erin. De geëxporteerde agenda werkt niet meer. De evenementen zelf blijven op de VTK-kalender.',
              [
                { text: 'Annuleren', style: 'cancel' },
                {
                  text: 'Wissen',
                  style: 'destructive',
                  onPress: () => void handle.unsubscribe().then((ok) => ok && onClose()),
                },
              ],
            )
          }
        />
      </View>
    </Sheet>
  );
}

/**
 * Een lessenrooster koppelen. Enkel de link van KU Leuven; Burgieclan kijkt na of
 * het er een is en de site vertaalt de fout.
 */
export function SetupForm({
  handle,
  initial,
  onDone,
}: {
  handle: PlanningHandle;
  initial?: string | null;
  onDone?: () => void;
}) {
  const [link, setLink] = useState(initial ?? '');
  return (
    <View style={styles.setup}>
      <View style={styles.steps}>
        <Text style={styles.step}>1. Open je rooster op de KU Leuven-roosterwebsite (TimeEdit).</Text>
        <Text style={styles.step}>
          2. Kies Abonneren en kopieer de link. Ze begint met webcal://cloud.timeedit.net/be_kuleuven/.
        </Text>
        <Text style={styles.step}>3. Plak ze hieronder.</Text>
      </View>
      <TextInput
        value={link}
        onChangeText={setLink}
        placeholder="webcal://cloud.timeedit.net/be_kuleuven/..."
        placeholderTextColor={COLORS.muted}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        accessibilityLabel="Abonnementslink van je KU Leuven-lessenrooster"
        style={styles.input}
      />
      <Button
        label="Rooster koppelen"
        busy={handle.busy}
        disabled={link.trim() === ''}
        onPress={() => void handle.subscribe(link.trim()).then((ok) => ok && onDone?.())}
      />
      <Text style={styles.hint}>
        Alleen jij ziet je planning. Ze is dezelfde als op Burgieclan, en Burgieclan kijkt ongeveer
        elk uur of je rooster veranderde.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  scrim: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(10, 15, 31, 0.45)' },
  sheet: {
    maxHeight: '85%',
    backgroundColor: COLORS.paper,
    borderTopLeftRadius: RADIUS.lg,
    borderTopRightRadius: RADIUS.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.md,
    paddingHorizontal: SPACING.xl - 4,
    paddingTop: SPACING.lg,
    paddingBottom: SPACING.sm,
  },
  title: { ...TYPE.heading, color: COLORS.ink, flex: 1 },
  body: { paddingHorizontal: SPACING.xl - 4, gap: SPACING.md, paddingBottom: SPACING.md },
  kicker: { ...TYPE.kicker, color: COLORS.muted, textTransform: 'uppercase' },
  fact: { flexDirection: 'row', gap: SPACING.md },
  factLabel: {
    width: 78,
    paddingTop: 2,
    fontFamily: FONTS.semibold,
    fontSize: 11.5,
    letterSpacing: 0.7,
    textTransform: 'uppercase',
    color: COLORS.muted,
  },
  factValue: { ...TYPE.body, color: COLORS.ink, flex: 1 },
  actions: { borderTopWidth: 1, borderTopColor: COLORS.line2, marginTop: SPACING.xs },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.md,
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.line,
  },
  rowText: { flex: 1, gap: 2 },
  rowLabel: { fontFamily: FONTS.semibold, fontSize: 15, lineHeight: 20 },
  rowHint: { ...TYPE.small, color: COLORS.muted },
  pressed: { opacity: 0.6 },
  disabled: { opacity: 0.45 },
  text: { ...TYPE.body, color: COLORS.body },
  hint: { ...TYPE.small, color: COLORS.muted },
  link: {
    ...TYPE.small,
    color: COLORS.ink,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.line2,
    borderRadius: RADIUS.sm,
    padding: SPACING.md,
  },
  buttons: { gap: SPACING.sm },
  setup: { gap: SPACING.md },
  steps: { gap: SPACING.xs },
  step: { ...TYPE.body, color: COLORS.body },
  input: {
    ...TYPE.body,
    color: COLORS.ink,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.line2,
    borderRadius: RADIUS.sm,
    paddingHorizontal: SPACING.md,
    paddingVertical: 11,
  },
});

import { useFocusEffect, useRouter } from 'expo-router';
import { ChevronRight, Pause, Play, Plus, Settings2, Square } from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AppState,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Image } from 'expo-image';

import type { AppStudyGroup, AppStudyMemberState, AppStudyOverview } from '../../src/api/contract';
import {
  fetchStudyOverview,
  startStudySession,
  stopStudySession,
  updateStudySession,
} from '../../src/api/endpoints';
import { messageFor, useResource } from '../../src/api/useResource';
import { PageHead } from '../../src/components/PageHead';
import {
  Skyline,
  buildingFor,
  relativeBuildings,
  type Building,
} from '../../src/components/Skyline';
import { Button, Card, ErrorState, Loading, StaleNotice } from '../../src/components/ui';
import { formatClock, formatSpan } from '../../src/format';
import { useApp } from '../../src/state/app';
import { COLORS, RADIUS, SPACING, TYPE } from '../../src/theme/tokens';

/**
 * Samen blokken.
 *
 * **De groep staat vooraan, niet je eigen cijfer.** Dat is de hele keuze achter
 * dit scherm. Een ranglijst motiveert de eerste drie; een lege plaats naast je
 * vrienden motiveert iedereen, en het is meteen het enige wat een app kan en een
 * website niet. Je eigen getallen staan er wel, maar onderaan.
 *
 * **De klok loopt hier lokaal en de waarheid staat op de server.** De app telt elke
 * seconde door vanaf wat ze kreeg, en meldt zich elke minuut opnieuw. Blijft dat
 * levensteken weg, dan telt de server de sessie tot het laatste moment waarop hij
 * wist dat ze liep; zie `lib/app-api/study.ts` aan de andere kant.
 *
 * **Weg uit de app is pauze.** Dat is de afgesproken vorm van eerlijkheid: geen
 * teller die doorloopt terwijl je op iets anders zit, maar ook geen straf voor
 * even een bericht lezen, want een pauze korter dan een minuut telt niet mee.
 */

/** Hoe vaak de app zich meldt terwijl er een sessie loopt. */
const HEARTBEAT_MS = 60_000;
/** Hoe vaak de zaal ververst wanneer er geen sessie loopt maar het scherm openstaat. */
const ROOM_REFRESH_MS = 45_000;
/** De hoogte van het skylinepaneel; bepaalt hoeveel verdiepingen er passen. */
const SKYLINE_HEIGHT = 126;

export default function StuderenScreen() {
  const router = useRouter();
  const { viewer } = useApp();

  const resource = useResource(
    'studeren',
    () => (viewer ? fetchStudyOverview() : Promise.resolve(null)),
    viewer?.id ?? 'anon',
  );

  const [overview, setOverview] = useState<AppStudyOverview | null>(null);
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  // De klok telt lokaal door vanaf wat de server zei. `setTick` heeft geen waarde
  // die iemand leest; het enige doel is opnieuw tekenen, één keer per seconde.
  const [, setTick] = useState(0);
  const anchor = useRef<{ seconds: number; at: number } | null>(null);

  const applyOverview = useCallback((next: AppStudyOverview) => {
    setOverview(next);
    anchor.current = next.session ? { seconds: next.session.seconds, at: Date.now() } : null;
    setTick((value) => value + 1);
  }, []);

  useEffect(() => {
    if (resource.data) applyOverview(resource.data);
  }, [resource.data, applyOverview]);

  const session = overview?.session ?? null;
  const groups = overview?.groups ?? [];
  const group = groups.find((item) => item.id === activeGroupId) ?? groups[0] ?? null;

  /** De klok tikt enkel wanneer er iets te tikken valt. */
  useEffect(() => {
    if (!session || session.paused) return;
    const timer = setInterval(() => setTick((value) => value + 1), 1000);
    return () => clearInterval(timer);
  }, [session]);

  const liveSeconds = (() => {
    if (!session) return 0;
    if (session.paused || !anchor.current) return session.seconds;
    return session.seconds + Math.floor((Date.now() - anchor.current.at) / 1000);
  })();

  const call = useCallback(
    async (action: () => Promise<AppStudyOverview>) => {
      setBusy(true);
      setProblem(null);
      try {
        applyOverview(await action());
      } catch (error) {
        setProblem(messageFor(error instanceof Error ? error : null));
      } finally {
        setBusy(false);
      }
    },
    [applyOverview],
  );

  /**
   * Het levensteken, en meteen de verversing van de zaal.
   *
   * Eén tijdklok voor allebei: het antwoord op een levensteken is het volledige
   * overzicht, dus wie zit er nu en hoelang al komt er gratis bij. Een tweede
   * timer die hetzelfde ophaalt, zou enkel dubbel werk zijn.
   */
  useEffect(() => {
    if (!viewer) return;
    const period = session ? HEARTBEAT_MS : ROOM_REFRESH_MS;
    const timer = setInterval(() => {
      if (AppState.currentState !== 'active') return;
      if (session) {
        void updateStudySession({ action: 'heartbeat' }).then(applyOverview).catch(() => {});
      } else {
        void fetchStudyOverview().then(applyOverview).catch(() => {});
      }
    }, period);
    return () => clearInterval(timer);
  }, [viewer, session, applyOverview]);

  /**
   * Weg uit de app is pauze, terug is hervatten.
   *
   * Er wordt op elke toestand buiten `active` gepauzeerd en niet enkel op
   * `background`: iOS zet een app ook op `inactive` bij een inkomend gesprek of
   * een bedieningspaneel, en dat zijn precies de momenten waarop je niet aan het
   * studeren bent. De marge van een minuut aan de serverkant vangt het korte
   * geval op.
   */
  useEffect(() => {
    if (!session) return;
    const subscription = AppState.addEventListener('change', (state) => {
      const action = state === 'active' ? 'resume' : 'pause';
      void updateStudySession({ action }).then(applyOverview).catch(() => {});
    });
    return () => subscription.remove();
  }, [session, applyOverview]);

  // Terugkomen van het groepsscherm hoort de lijst bij te werken; daar kan net
  // een groep bijgekomen of verdwenen zijn.
  useFocusEffect(
    useCallback(() => {
      if (viewer) void resource.refresh();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [viewer?.id]),
  );

  if (!viewer) {
    return (
      <>
        <PageHead title="Studeren" subtitle="Blok samen met je vrienden" back={false} />
        <ScrollView style={styles.root} contentContainerStyle={styles.content}>
          <Card>
            <Text style={styles.cardTitle}>Log eerst in</Text>
            <Text style={styles.body}>
              Je studietijd en je groepen hangen aan je account.
            </Text>
            <Button label="Inloggen" onPress={() => router.push('/inloggen')} />
          </Card>
        </ScrollView>
      </>
    );
  }

  if (resource.loading && !overview) return <Loading label="Studeren ophalen" />;
  if (!overview) {
    return (
      <ErrorState message={messageFor(resource.error)} onRetry={() => void resource.refresh()} />
    );
  }

  const yours = group?.members.find((member) => member.isYou) ?? null;

  return (
    <>
      <PageHead
        title="Studeren"
        kicker={group?.name ?? null}
        subtitle={roomLine(group, overview)}
        back={false}
        right={
          group ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Instellingen van ${group.name}`}
              onPress={() => router.push(`/studiegroep/${group.id}`)}
              hitSlop={10}
            >
              <Settings2 color={COLORS.yellow} size={21} />
            </Pressable>
          ) : undefined
        }
      />

      <ScrollView
        style={styles.root}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={resource.refreshing}
            onRefresh={() => void resource.refresh()}
          />
        }
      >
        {resource.stale ? <StaleNotice onRetry={() => void resource.refresh()} /> : null}

        {groups.length > 0 ? (
          <GroupChips
            groups={groups}
            activeId={group?.id ?? null}
            onPick={setActiveGroupId}
            onNew={() => router.push('/studiegroep/nieuw')}
          />
        ) : null}

        <SessionPanel
          overview={overview}
          group={group}
          seconds={liveSeconds}
          busy={busy}
          onStart={(subject) => call(() => startStudySession({ subject }))}
          onPause={() =>
            call(() => updateStudySession({ action: session?.paused ? 'resume' : 'pause' }))
          }
          onStop={() => call(async () => (await stopStudySession()).overview)}
        />

        {problem ? <Text style={styles.problem}>{problem}</Text> : null}

        {group ? (
          <Room group={group} onOpen={() => router.push(`/studiegroep/${group.id}`)} />
        ) : (
          <NoGroups onNew={() => router.push('/studiegroep/nieuw')} />
        )}

        {group?.weeklyGoalMinutes ? <GroupGoal group={group} /> : null}
        {group ? <Leaderboard group={group} /> : null}

        <YourWeek overview={overview} yours={yours} />
      </ScrollView>
    </>
  );
}

function roomLine(group: AppStudyGroup | null, overview: AppStudyOverview): string {
  if (!group) return 'Maak een groep en deel de code met je vrienden';
  if (group.liveCount === 0) {
    return overview.session ? 'Je bent de eerste die zit' : 'Niemand studeert nu';
  }
  return `${group.liveCount} van de ${group.memberCount} ${group.liveCount === 1 ? 'is' : 'zijn'} nu bezig`;
}

// ── De sessie ───────────────────────────────────────────────────────────────

function SessionPanel({
  overview,
  group,
  seconds,
  busy,
  onStart,
  onPause,
  onStop,
}: {
  overview: AppStudyOverview;
  group: AppStudyGroup | null;
  seconds: number;
  busy: boolean;
  onStart: (subject?: string) => void;
  onPause: () => void;
  onStop: () => void;
}) {
  const [subject, setSubject] = useState('');
  const session = overview.session;

  if (!session) {
    return (
      <View style={styles.panel}>
        <Skyline buildings={idleSkyline(overview, group)} height={SKYLINE_HEIGHT} moon />
        <View style={styles.panelBody}>
          <Text style={styles.panelTitle}>Kom erbij</Text>
          <Text style={styles.panelHint}>
            Elke tien minuten komt er een verdieping bij. Ga je weg uit de app, dan
            pauzeert de teller.
          </Text>

          <SubjectRow
            value={subject}
            onChange={setSubject}
            suggestions={overview.subjects}
          />

          <Button
            label={busy ? 'Bezig' : 'Beginnen'}
            onPress={() => onStart(subject.trim() || undefined)}
          />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.panel}>
      <Skyline
        buildings={[buildingFor('jij', seconds, !session.paused)]}
        height={SKYLINE_HEIGHT}
        moon
      />
      <View style={styles.panelBody}>
        <Text style={styles.clock}>{formatClock(seconds)}</Text>
        <Text style={styles.panelHint}>
          {session.paused
            ? 'Gepauzeerd. De bouw ligt stil.'
            : session.subject
              ? `Bezig met ${session.subject}`
              : 'Bezig'}
        </Text>

        <View style={styles.controls}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={session.paused ? 'Hervatten' : 'Pauzeren'}
            disabled={busy}
            onPress={onPause}
            style={({ pressed }) => [styles.control, pressed && styles.controlPressed]}
          >
            {session.paused ? (
              <Play color={COLORS.onDark} size={17} />
            ) : (
              <Pause color={COLORS.onDark} size={17} />
            )}
            <Text style={styles.controlLabel}>{session.paused ? 'Hervatten' : 'Pauze'}</Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Sessie stoppen"
            disabled={busy}
            onPress={onStop}
            style={({ pressed }) => [
              styles.control,
              styles.controlStop,
              pressed && styles.controlPressed,
            ]}
          >
            <Square color={COLORS.ink} size={15} />
            <Text style={[styles.controlLabel, styles.controlStopLabel]}>Stoppen</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

/**
 * De skyline zonder lopende sessie: wat je groep vandaag deed, of anders je eigen
 * week. Een leeg stuk grond zou zeggen dat er niets is, terwijl je vanochtend
 * misschien vier uur zat.
 *
 * Hier telt de **onderlinge** verhouding en niet de absolute tijd: de langste zit
 * staat op volle hoogte en de rest daaronder. In de sessie zelf is dat net
 * omgekeerd, want daar is tien minuten per verdieping juist de beloning.
 */
function idleSkyline(overview: AppStudyOverview, group: AppStudyGroup | null): Building[] {
  if (group && group.members.length > 1) {
    return relativeBuildings(
      group.members.slice(0, 8).map((member) => ({
        key: member.userId,
        seconds: member.todaySeconds,
        active: member.studying,
      })),
      SKYLINE_HEIGHT,
    );
  }
  return relativeBuildings(
    overview.week.map((day) => ({ key: day.date, seconds: day.seconds })),
    SKYLINE_HEIGHT,
  );
}

function SubjectRow({
  value,
  onChange,
  suggestions,
}: {
  value: string;
  onChange: (value: string) => void;
  suggestions: string[];
}) {
  return (
    <View style={styles.subject}>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder="Waaraan werk je? (mag leeg blijven)"
        placeholderTextColor={COLORS.onDarkMuted}
        style={styles.subjectInput}
        maxLength={60}
        returnKeyType="done"
      />
      {suggestions.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}>
          {suggestions.map((item) => (
            <Pressable
              key={item}
              accessibilityRole="button"
              accessibilityLabel={item}
              onPress={() => onChange(item)}
              style={[styles.chip, value === item && styles.chipOn]}
            >
              <Text style={[styles.chipText, value === item && styles.chipTextOn]}>{item}</Text>
            </Pressable>
          ))}
        </ScrollView>
      ) : null}
    </View>
  );
}

// ── De zaal ─────────────────────────────────────────────────────────────────

function Room({ group, onOpen }: { group: AppStudyGroup; onOpen: () => void }) {
  const present = group.members.filter((member) => member.studying || member.paused);

  return (
    <Card>
      <Text style={styles.label}>Nu aan het studeren</Text>

      {present.length === 0 ? (
        <Text style={styles.body}>
          Niemand van {group.name} zit nu. Begin jij, dan krijgen ze een bericht.
        </Text>
      ) : (
        present.map((member) => <Seat key={member.userId} member={member} />)
      )}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`De groep ${group.name} openen`}
        onPress={onOpen}
        style={({ pressed }) => [styles.groupLink, pressed && styles.rowPressed]}
      >
        <Text style={styles.groupLinkText}>
          {group.memberCount} {group.memberCount === 1 ? 'lid' : 'leden'} &middot; code {group.code}
        </Text>
        <ChevronRight color={COLORS.muted} size={17} />
      </Pressable>
    </Card>
  );
}

function Seat({ member }: { member: AppStudyMemberState }) {
  return (
    <View style={styles.seat}>
      <Avatar member={member} live={member.studying} />
      <View style={styles.seatText}>
        <Text style={styles.seatName} numberOfLines={1}>
          {member.isYou ? 'Jij' : member.name}
        </Text>
        <Text style={styles.seatSub} numberOfLines={1}>
          {member.paused ? 'Even gepauzeerd' : (member.subject ?? 'Aan het studeren')}
        </Text>
      </View>
      <Text style={[styles.seatTime, member.paused && styles.seatTimeDim]}>
        {formatSpan(member.liveSeconds ?? 0)}
      </Text>
    </View>
  );
}

function Avatar({ member, live }: { member: AppStudyMemberState; live: boolean }) {
  if (member.avatarUrl) {
    return (
      <Image
        source={{ uri: member.avatarUrl }}
        style={[styles.avatar, live && styles.avatarLive]}
        contentFit="cover"
      />
    );
  }
  return (
    <View style={[styles.avatar, styles.avatarEmpty, live && styles.avatarLive]}>
      <Text style={styles.initials}>{initialsOf(member.name)}</Text>
    </View>
  );
}

function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

// ── Het groepsdoel ──────────────────────────────────────────────────────────

function GroupGoal({ group }: { group: AppStudyGroup }) {
  const goal = (group.weeklyGoalMinutes ?? 0) * 60;
  const share = goal > 0 ? Math.min(1, group.weekSeconds / goal) : 0;

  return (
    <Card>
      <Text style={styles.label}>Samen deze week</Text>
      <Text style={styles.goalLine}>
        {formatSpan(group.weekSeconds)} van de {formatSpan(goal)}
      </Text>
      <View style={styles.track}>
        <View style={[styles.trackFill, { width: `${Math.round(share * 100)}%` }]} />
      </View>
      <Text style={styles.hint}>
        {share >= 1
          ? 'Gehaald. Iedereen heeft eraan meegedaan.'
          : `Nog ${formatSpan(goal - group.weekSeconds)} te gaan.`}
      </Text>
    </Card>
  );
}

// ── De ranglijst ────────────────────────────────────────────────────────────

function Leaderboard({ group }: { group: AppStudyGroup }) {
  const best = Math.max(1, ...group.members.map((member) => member.weekSeconds));

  return (
    <Card>
      <Text style={styles.label}>Deze week</Text>
      {group.members.map((member, index) => (
        <View key={member.userId} style={styles.rank}>
          <Text style={styles.pos}>{index + 1}</Text>
          <Avatar member={member} live={member.studying} />
          <View style={styles.rankText}>
            <Text style={styles.rankName} numberOfLines={1}>
              {member.isYou ? 'Jij' : member.name}
            </Text>
            <View style={styles.bar}>
              <View
                style={[
                  styles.barFill,
                  member.isYou && styles.barFillMine,
                  { width: `${Math.round((member.weekSeconds / best) * 100)}%` },
                ]}
              />
            </View>
          </View>
          <Text style={styles.rankTime}>{formatSpan(member.weekSeconds)}</Text>
        </View>
      ))}
    </Card>
  );
}

// ── Jouw week ───────────────────────────────────────────────────────────────

function YourWeek({
  overview,
  yours,
}: {
  overview: AppStudyOverview;
  yours: AppStudyMemberState | null;
}) {
  const best = Math.max(1, ...overview.week.map((day) => day.seconds));
  const days = ['ma', 'di', 'wo', 'do', 'vr', 'za', 'zo'];

  return (
    <Card>
      <Text style={styles.label}>Jouw week</Text>

      <View style={styles.stats}>
        <Stat label="Vandaag" value={formatSpan(overview.todaySeconds)} />
        <Stat label="Deze week" value={formatSpan(overview.weekSeconds)} />
        <Stat
          label="Reeks"
          value={overview.streak === 0 ? '0 d' : `${overview.streak} d`}
        />
      </View>

      <View style={styles.week}>
        {overview.week.map((day, index) => (
          <View key={day.date} style={styles.weekDay}>
            <View style={styles.weekTrack}>
              <View
                style={[
                  styles.weekFill,
                  day.goalMet && styles.weekFillMet,
                  { height: `${Math.round((day.seconds / best) * 100)}%` },
                ]}
              />
            </View>
            <Text style={styles.weekLabel}>
              {days[(new Date(day.date).getUTCDay() + 6) % 7] ?? days[index]}
            </Text>
          </View>
        ))}
      </View>

      <Text style={styles.hint}>
        Je dagdoel staat op {formatSpan(overview.dailyGoalMinutes * 60)}.
        {yours && yours.todaySeconds >= overview.dailyGoalMinutes * 60
          ? ' Vandaag gehaald.'
          : ''}
      </Text>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label.toUpperCase()}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

// ── Groepen ─────────────────────────────────────────────────────────────────

function GroupChips({
  groups,
  activeId,
  onPick,
  onNew,
}: {
  groups: AppStudyGroup[];
  activeId: string | null;
  onPick: (id: string) => void;
  onNew: () => void;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}>
      {groups.map((group) => {
        const active = group.id === activeId;
        return (
          <Pressable
            key={group.id}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={`${group.name}, ${group.liveCount} nu bezig`}
            onPress={() => onPick(group.id)}
            style={[styles.groupChip, active && styles.groupChipOn]}
          >
            {group.liveCount > 0 ? <View style={styles.pip} /> : null}
            <Text style={[styles.groupChipText, active && styles.groupChipTextOn]}>
              {group.name}
            </Text>
          </Pressable>
        );
      })}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Groep maken of deelnemen"
        onPress={onNew}
        style={[styles.groupChip, styles.groupChipAdd]}
      >
        <Plus color={COLORS.navy} size={15} />
      </Pressable>
    </ScrollView>
  );
}

function NoGroups({ onNew }: { onNew: () => void }) {
  return (
    <Card>
      <Text style={styles.cardTitle}>Blok samen</Text>
      <Text style={styles.body}>
        Maak een groep, deel de code met je vrienden, en jullie zien van elkaar wie
        er zit. Je tijd is enkel zichtbaar voor wie in dezelfde groep zit.
      </Text>
      <Button label="Groep maken of deelnemen" onPress={onNew} />
    </Card>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.paper },
  content: { padding: SPACING.lg, gap: SPACING.lg, paddingBottom: SPACING.xxl },

  panel: {
    backgroundColor: COLORS.navy,
    borderRadius: RADIUS.lg,
    overflow: 'hidden',
  },
  panelBody: { padding: SPACING.lg, gap: SPACING.sm },
  panelTitle: { ...TYPE.sectionTitle, color: COLORS.onDark },
  panelHint: { ...TYPE.small, color: COLORS.onDarkMuted },
  clock: {
    ...TYPE.pageTitle,
    fontSize: 40,
    lineHeight: 46,
    color: COLORS.onDark,
    fontVariant: ['tabular-nums'],
  },

  controls: { flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.sm },
  control: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    paddingVertical: 13,
    borderRadius: RADIUS.pill,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
  },
  controlPressed: { opacity: 0.75 },
  controlLabel: { ...TYPE.body, fontFamily: TYPE.cardTitle.fontFamily, color: COLORS.onDark },
  controlStop: { backgroundColor: COLORS.yellow, borderColor: COLORS.yellow },
  controlStopLabel: { color: COLORS.ink },

  subject: { gap: SPACING.sm },
  subjectInput: {
    ...TYPE.body,
    color: COLORS.onDark,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    borderRadius: RADIUS.sm,
    paddingHorizontal: SPACING.md,
    paddingVertical: 10,
  },

  chipRow: { flexGrow: 0 },
  chip: {
    paddingHorizontal: SPACING.md,
    paddingVertical: 7,
    borderRadius: RADIUS.pill,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    marginRight: SPACING.sm,
  },
  chipOn: { backgroundColor: COLORS.yellow, borderColor: COLORS.yellow },
  chipText: { ...TYPE.small, color: COLORS.onDarkMuted },
  chipTextOn: { color: COLORS.ink, fontFamily: TYPE.cardTitle.fontFamily },

  groupChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: SPACING.md,
    paddingVertical: 8,
    borderRadius: RADIUS.pill,
    borderWidth: 1,
    borderColor: COLORS.line2,
    backgroundColor: COLORS.surface,
    marginRight: SPACING.sm,
  },
  groupChipOn: { backgroundColor: COLORS.yellow, borderColor: COLORS.yellow },
  groupChipAdd: { paddingHorizontal: SPACING.md },
  groupChipText: { ...TYPE.small, color: COLORS.body },
  groupChipTextOn: { color: COLORS.ink, fontFamily: TYPE.cardTitle.fontFamily },
  pip: { width: 6, height: 6, borderRadius: 3, backgroundColor: COLORS.yellowDeep },

  label: {
    ...TYPE.kicker,
    color: COLORS.muted,
    marginBottom: SPACING.sm,
  },
  cardTitle: { ...TYPE.cardTitle, color: COLORS.ink },
  body: { ...TYPE.body, color: COLORS.body },
  hint: { ...TYPE.small, color: COLORS.muted, marginTop: SPACING.sm },
  problem: { ...TYPE.small, color: COLORS.ink, textAlign: 'center' },

  seat: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, paddingVertical: 9 },
  seatText: { flex: 1, minWidth: 0 },
  seatName: { ...TYPE.body, fontFamily: TYPE.cardTitle.fontFamily, color: COLORS.ink },
  seatSub: { ...TYPE.small, color: COLORS.muted },
  seatTime: {
    ...TYPE.body,
    fontFamily: TYPE.cardTitle.fontFamily,
    color: COLORS.ink,
    fontVariant: ['tabular-nums'],
  },
  seatTimeDim: { color: COLORS.muted },

  avatar: { width: 34, height: 34, borderRadius: 17, backgroundColor: COLORS.paper2 },
  avatarEmpty: { alignItems: 'center', justifyContent: 'center' },
  avatarLive: { borderWidth: 2, borderColor: COLORS.yellow },
  initials: { ...TYPE.small, fontFamily: TYPE.cardTitle.fontFamily, color: COLORS.navy },

  groupLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: COLORS.line,
    marginTop: SPACING.sm,
    paddingTop: SPACING.md,
  },
  groupLinkText: { ...TYPE.small, color: COLORS.muted, flex: 1 },
  rowPressed: { opacity: 0.6 },

  goalLine: { ...TYPE.sectionTitle, color: COLORS.ink },
  track: {
    height: 8,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.paper2,
    overflow: 'hidden',
    marginTop: SPACING.sm,
  },
  trackFill: { height: '100%', backgroundColor: COLORS.yellowDeep, borderRadius: RADIUS.pill },

  rank: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, paddingVertical: 8 },
  pos: {
    ...TYPE.small,
    fontFamily: TYPE.cardTitle.fontFamily,
    color: COLORS.muted,
    width: 14,
    fontVariant: ['tabular-nums'],
  },
  rankText: { flex: 1, minWidth: 0, gap: 5 },
  rankName: { ...TYPE.small, fontFamily: TYPE.cardTitle.fontFamily, color: COLORS.ink },
  bar: { height: 4, borderRadius: RADIUS.pill, backgroundColor: COLORS.paper2, overflow: 'hidden' },
  barFill: { height: '100%', backgroundColor: COLORS.navy, borderRadius: RADIUS.pill },
  barFillMine: { backgroundColor: COLORS.yellowDeep },
  rankTime: {
    ...TYPE.small,
    fontFamily: TYPE.cardTitle.fontFamily,
    color: COLORS.body,
    fontVariant: ['tabular-nums'],
  },

  stats: { flexDirection: 'row', gap: SPACING.sm },
  stat: {
    flex: 1,
    backgroundColor: COLORS.paper2,
    borderRadius: RADIUS.sm,
    paddingVertical: SPACING.md,
    alignItems: 'center',
  },
  statLabel: { ...TYPE.kicker, fontSize: 9.5, color: COLORS.muted },
  statValue: {
    ...TYPE.sectionTitle,
    fontSize: 17,
    color: COLORS.ink,
    marginTop: 2,
    fontVariant: ['tabular-nums'],
  },

  week: { flexDirection: 'row', gap: 6, marginTop: SPACING.lg, height: 74 },
  weekDay: { flex: 1, gap: 5 },
  weekTrack: {
    flex: 1,
    backgroundColor: COLORS.paper2,
    borderRadius: 5,
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  weekFill: { backgroundColor: COLORS.navy, borderRadius: 5 },
  weekFillMet: { backgroundColor: COLORS.yellowDeep },
  weekLabel: { ...TYPE.small, fontSize: 10, color: COLORS.muted, textAlign: 'center' },
});

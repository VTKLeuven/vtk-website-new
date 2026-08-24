import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { Bell, ChevronRight, Sandwich, TicketCheck, Wrench } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { baseUrl } from '../../src/api/client';
import { fetchProfile } from '../../src/api/endpoints';
import { useResource } from '../../src/api/useResource';
import { signOut } from '../../src/auth/session';
import { PageHead } from '../../src/components/PageHead';
import { Button, Card, SectionTitle } from '../../src/components/ui';
import { formatDay, formatTimeRange } from '../../src/format';
import { disablePush, enablePush, hasBeenAsked, pushIsOn, refreshPushRegistration } from '../../src/push';
import { useApp } from '../../src/state/app';
import { COLORS, RADIUS, SPACING, TYPE } from '../../src/theme/tokens';

/**
 * Profiel: wie je bent, waar je heen kan, en je shiften.
 *
 * Wat hier níét in staat is even bewust als wat er wel in staat. Je gegevens
 * wijzigen, je privacygegevens opvragen en je verbonden apps beheren blijven op
 * de site. Dat zijn formulieren met eigen validatie en juridische gevolgen, en
 * die twee keer bouwen is twee keer kunnen mislopen; het is een beslissing en
 * geen achterstand.
 */
export default function ProfielScreen() {
  const router = useRouter();
  const { viewer, gate, refresh, locale, setLocale } = useApp();
  const [signingOut, setSigningOut] = useState(false);

  const profile = useResource('profiel', () => fetchProfile(locale), locale);

  // Het besturingssysteem kan een pushtoken vervangen zonder dat de app het
  // merkt, dus melden we een bestaand token bij elke start opnieuw aan. Dit
  // vraagt nooit om toestemming; dat gebeurt enkel via de knop hieronder.
  useEffect(() => {
    void refreshPushRegistration();
  }, []);

  if (!viewer) {
    return (
      <>
        <PageHead title="Profiel" subtitle="Log in met je VTK-account" />
        <ScrollView contentContainerStyle={styles.content} style={styles.root}>
          <Card>
            <Text style={styles.title}>Nog niet ingelogd</Text>
            <Text style={styles.body}>
              Je kan de app zonder account gebruiken om alles te lezen. Bestellen, tickets en je
              gegevens vragen wel een login. Dat gaat met hetzelfde account als op vtk.be,
              KU Leuven-login inbegrepen.
            </Text>
            <Button label="Inloggen" onPress={() => router.push('/inloggen')} />
          </Card>
          <Settings
            locale={locale}
            setLocale={setLocale}
            onOpenServer={() => router.push('/instellingen')}
          />
        </ScrollView>
      </>
    );
  }

  const data = profile.data;

  return (
    <>
      <PageHead title="Profiel" subtitle={viewer.email} />
      <ScrollView
        contentContainerStyle={styles.content}
        style={styles.root}
        refreshControl={
          <RefreshControl refreshing={profile.refreshing} onRefresh={() => void profile.refresh()} />
        }
      >
        <Card>
          <View style={styles.person}>
            {viewer.avatarUrl ? (
              <Image source={{ uri: viewer.avatarUrl }} style={styles.avatar} contentFit="cover" />
            ) : (
              <View style={[styles.avatar, styles.avatarEmpty]}>
                <Text style={styles.initials}>{initialsOf(viewer.name)}</Text>
              </View>
            )}
            <View style={styles.personText}>
              <Text style={styles.title}>{viewer.name}</Text>
              <Text style={styles.hint}>{data?.rNumber ?? viewer.email}</Text>
            </View>
          </View>
          {data && data.studyProgrammes.length > 0 ? (
            <Text style={styles.hint}>{data.studyProgrammes.join(', ')}</Text>
          ) : null}
        </Card>

        {gate ? (
          <Card featured>
            <Text style={styles.title}>
              {gate === 'onboarding'
                ? 'Je profiel is nog niet af'
                : 'Je studie is nog niet bevestigd'}
            </Text>
            <Text style={styles.body}>
              Zolang dit openstaat, blijven bestellen en tickets gesloten.
            </Text>
            <Button
              label="Nu afwerken"
              onPress={() => router.push({ pathname: '/poort', params: { gate } })}
            />
          </Card>
        ) : null}

        <Row
          icon={<TicketCheck color={COLORS.navy} size={20} />}
          label="Mijn tickets"
          onPress={() => router.push('/mijn-tickets')}
        />
        <Row
          icon={<Sandwich color={COLORS.navy} size={20} />}
          label="Mijn broodjes"
          onPress={() => router.push('/bestellen')}
        />
        <Row
          icon={<Wrench color={COLORS.navy} size={20} />}
          label="Shiften"
          onPress={() => router.push('/shiften')}
        />

        <PushCard />

        {data && data.upcomingShifts.length > 0 ? (
          <>
            <SectionTitle>Jouw shiften</SectionTitle>
            <Card>
              {data.upcomingShifts.map((shift) => (
                <View key={shift.id} style={styles.shift}>
                  <Text style={styles.shiftName}>{shift.name}</Text>
                  <Text style={styles.hint}>
                    {formatDay(shift.start, locale)}, {formatTimeRange(shift.start, shift.end, locale)}
                  </Text>
                  <Text style={styles.hint}>{shift.location}</Text>
                </View>
              ))}
            </Card>
          </>
        ) : null}

        {data && data.totalShifts > 0 ? (
          <Card>
            <View style={styles.statRow}>
              <Text style={styles.body}>Shiften gedaan</Text>
              <Text style={styles.title}>{data.totalShifts}</Text>
            </View>
            {data.unpaidShiftsThisYear > 0 ? (
              <View style={styles.statRow}>
                <Text style={styles.body}>Nog uit te betalen dit jaar</Text>
                <Text style={styles.title}>{data.unpaidShiftsThisYear}</Text>
              </View>
            ) : null}
          </Card>
        ) : null}

        {viewer.groups.length > 0 ? (
          <>
            <SectionTitle>Jouw posten en werkgroepen</SectionTitle>
            <Card>
              {viewer.groups.map((group) => (
                <View key={group.id} style={styles.groupRow}>
                  <Text style={styles.groupName}>{group.name}</Text>
                  <Text style={styles.hint}>
                    {group.type === 'PRAESIDIUM' ? 'Post' : 'Werkgroep'}
                  </Text>
                </View>
              ))}
            </Card>
          </>
        ) : null}

        <SectionTitle>Op de site</SectionTitle>
        <Card>
          <Text style={styles.body}>
            Je gegevens wijzigen, je verbonden apps en je privacygegevens staan op de site. Die
            formulieren hebben hun eigen regels, en die willen we niet op twee plaatsen hebben.
          </Text>
          <Button
            label="Mijn account op vtk.be"
            variant="ghost"
            onPress={() => void WebBrowser.openBrowserAsync(`${baseUrl()}/account`)}
          />
        </Card>

        <Settings
          locale={locale}
          setLocale={setLocale}
          onOpenServer={() => router.push('/instellingen')}
        />

        <Button
          label="Uitloggen"
          variant="ghost"
          busy={signingOut}
          onPress={() => {
            setSigningOut(true);
            void signOut()
              .then(() => refresh())
              .finally(() => setSigningOut(false));
          }}
        />
      </ScrollView>
    </>
  );
}

/**
 * De schakelaar voor pushberichten.
 *
 * De toestemming wordt hier gevraagd en niet bij de eerste start van de app. Een
 * systeemvenster dat meteen na het installeren verschijnt, wordt in de regel
 * weggeklikt, en op iOS is dat definitief: wie één keer weigert, moet daarna naar
 * de systeeminstellingen. Vandaar dat er een zin bij staat die zegt waarover het
 * gaat, voor het venster verschijnt.
 *
 * Er wordt vandaag nog niets verstuurd. Dat staat er ook bij; iemand die dit
 * aanzet en dan weken niets hoort, hoort te weten dat dat klopt.
 */
function PushCard() {
  const [on, setOn] = useState(pushIsOn);
  const [busy, setBusy] = useState(false);

  const toggle = async () => {
    setBusy(true);
    try {
      if (on) {
        await disablePush();
        setOn(false);
        return;
      }
      const ok = await enablePush();
      setOn(ok);
      if (!ok) {
        Alert.alert(
          'Pushberichten staan uit',
          hasBeenAsked()
            ? 'Je toestel laat geen berichten toe voor deze app. Dat kan je aanzetten in de instellingen van je telefoon.'
            : 'Er kon geen toestemming opgehaald worden.',
        );
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <View style={styles.pushHead}>
        <Bell color={COLORS.navy} size={20} />
        <Text style={styles.title}>Pushberichten</Text>
      </View>
      <Text style={styles.body}>
        {on
          ? 'Je krijgt een bericht wanneer er iets is dat je moet weten: je broodje dat klaarligt, een shift die begint, tickets die opengaan.'
          : 'Zet dit aan om een bericht te krijgen bij je broodje, je shiften en nieuwe tickets.'}
      </Text>
      <Text style={styles.hint}>
        Er wordt op dit moment nog niets verstuurd; dit legt enkel vast dat je ze wil.
      </Text>
      <Button
        label={on ? 'Uitzetten' : 'Aanzetten'}
        variant="ghost"
        busy={busy}
        onPress={() => void toggle()}
      />
    </Card>
  );
}

function Row({
  icon,
  label,
  onPress,
}: {
  icon: React.ReactNode;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
    >
      {icon}
      <Text style={styles.rowLabel}>{label}</Text>
      <ChevronRight color={COLORS.muted} size={18} />
    </Pressable>
  );
}

function Settings({
  locale,
  setLocale,
  onOpenServer,
}: {
  locale: 'nl' | 'en';
  setLocale: (locale: 'nl' | 'en') => void;
  onOpenServer: () => void;
}) {
  return (
    <>
      <SectionTitle>Instellingen</SectionTitle>
      <Card>
        <Text style={styles.title}>Taal</Text>
        <Text style={styles.body}>
          {locale === 'nl' ? 'De app staat in het Nederlands.' : 'The app is set to English.'}
        </Text>
        <Button
          label={locale === 'nl' ? 'Switch to English' : 'Zet terug op Nederlands'}
          variant="ghost"
          onPress={() => setLocale(locale === 'nl' ? 'en' : 'nl')}
        />
      </Card>
      <Card>
        <Text style={styles.title}>Server</Text>
        <Text style={styles.body}>
          Standaard praat de app met vtk.be. Wijzig dit enkel om te testen tegen een andere
          omgeving.
        </Text>
        <Button label="Server instellen" variant="ghost" onPress={onOpenServer} />
      </Card>
    </>
  );
}

function initialsOf(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.paper },
  content: { padding: SPACING.lg, gap: SPACING.md, paddingBottom: SPACING.xxl },
  person: { flexDirection: 'row', alignItems: 'center', gap: SPACING.lg },
  personText: { flex: 1, gap: SPACING.xs },
  avatar: { width: 56, height: 56, borderRadius: RADIUS.pill, backgroundColor: COLORS.paper2 },
  avatarEmpty: { alignItems: 'center', justifyContent: 'center' },
  initials: { ...TYPE.cardTitle, color: COLORS.navy },
  title: { ...TYPE.cardTitle, color: COLORS.ink },
  body: { ...TYPE.body, color: COLORS.body },
  hint: { ...TYPE.small, color: COLORS.muted },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.line,
    padding: SPACING.lg,
  },
  rowPressed: { backgroundColor: COLORS.paper2 },
  rowLabel: { ...TYPE.cardTitle, color: COLORS.ink, flex: 1 },

  shift: { paddingVertical: SPACING.sm, gap: 2 },
  shiftName: { ...TYPE.body, fontFamily: TYPE.cardTitle.fontFamily, color: COLORS.ink },
  statRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },

  groupRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SPACING.md,
    paddingVertical: SPACING.xs,
  },
  groupName: { ...TYPE.body, color: COLORS.ink, flex: 1 },
  pushHead: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
});

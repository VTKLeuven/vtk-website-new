import { useRouter } from 'expo-router';
import { Globe, MapPin, Users } from 'lucide-react-native';
import { useState } from 'react';
import { Alert, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { ApiError } from '../../src/api/client';
import type { AppShift } from '../../src/api/contract';
import { fetchShifts, registerForShift, unregisterFromShift } from '../../src/api/endpoints';
import { messageFor, useResource } from '../../src/api/useResource';
import { PageHead } from '../../src/components/PageHead';
import { Prose } from '../../src/components/Prose';
import { Button, Card, Empty, ErrorState, Loading, SectionTitle, StaleNotice } from '../../src/components/ui';
import { formatDay, formatTimeRange } from '../../src/format';
import { useApp } from '../../src/state/app';
import { COLORS, SPACING, TYPE } from '../../src/theme/tokens';

/**
 * Shiften: waar je op staat, en waar je nog op kan.
 *
 * Alle regels staan op de server. Of je nog kan uitschrijven is een veld dat de
 * API meestuurt (`canUnregister`) en geen berekening hier: de 24-uursgrens en de
 * bedenktijd na een misklik horen op één plek te leven, en dat is de plek die ze
 * ook afdwingt.
 */
export default function ShiftenScreen() {
  const router = useRouter();
  const { locale, viewer } = useApp();
  const resource = useResource('shiften', () => fetchShifts(locale), locale);

  if (!viewer) {
    return (
      <>
        <PageHead title="Shiften" subtitle="Help mee en verdien wat" />
        <ScrollView contentContainerStyle={styles.content} style={styles.root}>
          <Card>
            <Text style={styles.title}>Log eerst in</Text>
            <Text style={styles.body}>
              Inschrijven op een shift hangt aan je account.
            </Text>
            <Button label="Inloggen" onPress={() => router.push('/inloggen')} />
          </Card>
        </ScrollView>
      </>
    );
  }

  if (resource.loading) return <Loading label="Shiften ophalen" />;
  if (!resource.data) {
    return (
      <ErrorState message={messageFor(resource.error)} onRetry={() => void resource.refresh()} />
    );
  }

  const { mine, available } = resource.data;

  return (
    <>
      <PageHead title="Shiften" subtitle="Help mee en verdien wat" />
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

        {mine.length > 0 ? (
          <>
            <SectionTitle>Jouw shiften</SectionTitle>
            {mine.map((shift) => (
              <ShiftCard
                key={shift.id}
                shift={shift}
                locale={locale}
                onChanged={() => void resource.refresh()}
              />
            ))}
          </>
        ) : null}

        <SectionTitle>Nog vrij</SectionTitle>
        {available.length === 0 ? (
          <Empty
            title="Geen vrije shiften"
            hint="Er staat nu niets open. Nieuwe shiften verschijnen hier zodra ze ingepland zijn."
          />
        ) : (
          available.map((shift) => (
            <ShiftCard
              key={shift.id}
              shift={shift}
              locale={locale}
              onChanged={() => void resource.refresh()}
            />
          ))
        )}
      </ScrollView>
    </>
  );
}

function ShiftCard({
  shift,
  locale,
  onChanged,
}: {
  shift: AppShift;
  locale: 'nl' | 'en';
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);

  const act = async (kind: 'register' | 'unregister') => {
    setBusy(true);
    try {
      if (kind === 'register') await registerForShift(shift.id);
      else await unregisterFromShift(shift.id);
      onChanged();
    } catch (error) {
      Alert.alert(
        kind === 'register' ? 'Inschrijven lukte niet' : 'Uitschrijven lukte niet',
        shiftErrorText(error),
      );
      // Ook bij een fout opnieuw ophalen: "vol" en "al begonnen" betekenen
      // allebei dat dit scherm achterloopt.
      onChanged();
    } finally {
      setBusy(false);
    }
  };

  const confirmUnregister = () => {
    Alert.alert(
      'Uitschrijven',
      `Je schrijft je uit voor ${shift.name} op ${formatDay(shift.start, locale)}. De plaats komt weer vrij voor iemand anders.`,
      [
        { text: 'Blijven staan', style: 'cancel' },
        { text: 'Uitschrijven', style: 'destructive', onPress: () => void act('unregister') },
      ],
    );
  };

  const free = shift.maxParticipants - shift.takenSpots;

  return (
    <Card featured={shift.registered}>
      <Text style={styles.shiftName}>{shift.name}</Text>

      <View style={styles.facts}>
        <Text style={styles.factDay}>{formatDay(shift.start, locale)}</Text>
        <Text style={styles.fact}>{formatTimeRange(shift.start, shift.end, locale)}</Text>
      </View>

      <View style={styles.factRow}>
        <MapPin color={COLORS.muted} size={15} />
        <Text style={styles.fact}>{shift.location}</Text>
      </View>
      <View style={styles.factRow}>
        <Users color={COLORS.muted} size={15} />
        <Text style={styles.fact}>
          {shift.takenSpots} van {shift.maxParticipants}
          {free > 0 ? `, nog ${free} vrij` : ', volzet'}
        </Text>
      </View>
      {shift.openToInternationals ? (
        <View style={styles.factRow}>
          <Globe color={COLORS.muted} size={15} />
          <Text style={styles.fact}>Ook zonder Nederlands</Text>
        </View>
      ) : null}

      {shift.description ? <Text style={styles.body}>{shift.description}</Text> : null}

      {shift.instructions ? (
        <>
          <Button
            label={open ? 'Minder uitleg' : 'Wat houdt dit in?'}
            variant="ghost"
            onPress={() => setOpen(!open)}
          />
          {open ? <Prose>{shift.instructions}</Prose> : null}
        </>
      ) : null}

      {shift.registered ? (
        shift.canUnregister ? (
          <Button label="Uitschrijven" variant="ghost" busy={busy} onPress={confirmUnregister} />
        ) : (
          <Text style={styles.hint}>
            Uitschrijven kan niet meer: de shift begint binnen het etmaal. Kan je echt niet, laat
            het dan weten aan de verantwoordelijke.
          </Text>
        )
      ) : (
        <Button
          label="Inschrijven"
          busy={busy}
          disabled={!shift.canRegister}
          onPress={() => void act('register')}
        />
      )}
    </Card>
  );
}

/**
 * De melding bij een geweigerde in- of uitschrijving.
 *
 * De bestaande route antwoordt met Engelse zinnen en geen codes, dus dit leest de
 * status en de tekst. Zou die route ooit codes krijgen, dan hoort dit mee te
 * veranderen; tot dan is de status het betrouwbaarste deel.
 */
function shiftErrorText(error: unknown): string {
  if (!(error instanceof ApiError)) {
    return 'Geen verbinding met vtk.be. Probeer het straks opnieuw.';
  }
  const text = error.message.toLowerCase();
  if (text.includes('overlap')) return 'Je staat al op een shift die hiermee overlapt.';
  if (text.includes('full')) return 'Deze shift is intussen volzet.';
  if (text.includes('started')) return 'Deze shift is al begonnen.';
  if (text.includes('already registered')) return 'Je stond hier al op ingeschreven.';
  if (error.status === 409) {
    return 'Uitschrijven kan niet meer: de shift begint binnen het etmaal.';
  }
  if (error.isNotFound) return 'Deze shift bestaat niet meer.';
  return error.message;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.paper },
  content: { padding: SPACING.lg, gap: SPACING.md, paddingBottom: SPACING.xxl },
  title: { ...TYPE.cardTitle, color: COLORS.ink },
  body: { ...TYPE.body, color: COLORS.body },
  hint: { ...TYPE.small, color: COLORS.muted },
  shiftName: { ...TYPE.sectionTitle, color: COLORS.ink },
  facts: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm, alignItems: 'baseline' },
  factDay: { ...TYPE.body, fontFamily: TYPE.cardTitle.fontFamily, color: COLORS.ink },
  factRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  fact: { ...TYPE.small, color: COLORS.muted, flex: 1 },
});

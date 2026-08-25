import { useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { ApiError } from '../api/client';
import type { AppPianoSlot } from '../api/contract';
import { cancelPianoSlot, fetchPiano, reservePianoSlot } from '../api/endpoints';
import { messageFor, useResource } from '../api/useResource';
import { PageHead } from '../components/PageHead';
import { Prose } from '../components/Prose';
import { Button, Card, Empty, ErrorState, Loading, StaleNotice } from '../components/ui';
import { formatDay, formatTime } from '../format';
import { useApp } from '../state/app';

import { useTabRouter } from '../navigation';
import { COLORS, RADIUS, SPACING, TYPE } from '../theme/tokens';

/**
 * De piano in het kasteel reserveren.
 *
 * Een dag is een rij knoppen, één per tijdslot. Dat is compacter dan een lijst en
 * je ziet in één blik hoe vol een avond zit; op een telefoon is dat het verschil
 * tussen scrollen en kiezen.
 *
 * De naam van wie een slot heeft, staat erbij. Dat is een keuze van de site en
 * geen lek: zo weet je met wie je kan ruilen. Daarom vraagt dit scherm ook een
 * login.
 */
export default function PianoScreen() {
  const router = useTabRouter();
  const { locale, viewer } = useApp();
  const resource = useResource('piano', () => fetchPiano(locale), locale);
  const [busy, setBusy] = useState<string | null>(null);

  if (!viewer) {
    return (
      <>
        <PageHead title="Piano" subtitle="Reserveer het lokaal in het kasteel" />
        <ScrollView contentContainerStyle={styles.content} style={styles.root}>
          <Card>
            <Text style={styles.title}>Log eerst in</Text>
            <Text style={styles.body}>
              De agenda toont wie welk uur heeft, dus die staat achter een login.
            </Text>
            <Button label="Inloggen" onPress={() => router.push('/inloggen')} />
          </Card>
        </ScrollView>
      </>
    );
  }

  if (resource.loading) return <Loading label="Agenda ophalen" />;
  if (!resource.data) {
    return (
      <ErrorState message={messageFor(resource.error)} onRetry={() => void resource.refresh()} />
    );
  }

  const piano = resource.data;
  const full = piano.usedThisWeek >= piano.maxPerWeek;

  const press = async (slot: AppPianoSlot) => {
    setBusy(slot.startsAt);
    try {
      if (slot.state === 'MINE') {
        if (!slot.reservationId) return;
        await cancelPianoSlot(slot.reservationId);
      } else {
        await reservePianoSlot(slot.startsAt);
      }
      void resource.refresh();
    } catch (error) {
      Alert.alert('Dat lukte niet', pianoErrorText(error));
      void resource.refresh();
    } finally {
      setBusy(null);
    }
  };

  const confirmCancel = (slot: AppPianoSlot) => {
    Alert.alert(
      'Reservatie loslaten',
      `Je laat ${formatDay(slot.startsAt, locale)} om ${formatTime(slot.startsAt, locale)} los. Het uur komt weer vrij voor iemand anders.`,
      [
        { text: 'Houden', style: 'cancel' },
        { text: 'Loslaten', style: 'destructive', onPress: () => void press(slot) },
      ],
    );
  };

  return (
    <>
      <PageHead title="Piano" subtitle="Reserveer het lokaal in het kasteel" />
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

        <Card featured={full}>
          <Text style={styles.title}>
            {piano.usedThisWeek} van {piano.maxPerWeek} deze week
          </Text>
          <Text style={styles.body}>
            {full
              ? 'Je zit aan je maximum voor deze week. Laat een uur los om er een ander te nemen.'
              : `Je kan er deze week nog ${piano.maxPerWeek - piano.usedThisWeek} nemen, van ${piano.slotMinutes} minuten elk.`}
          </Text>
        </Card>

        {piano.info ? (
          <Card>
            <Prose>{piano.info}</Prose>
          </Card>
        ) : null}

        {piano.days.length === 0 ? (
          <Empty
            title="Geen uren beschikbaar"
            hint="Er staan momenteel geen tijdsloten open. Dat kan aan een sluitingsperiode liggen."
          />
        ) : null}

        {piano.days.map((day) => (
          <Card key={day.date}>
            <Text style={styles.day}>{formatDay(`${day.date}T12:00:00.000Z`, locale)}</Text>
            <View style={styles.slots}>
              {day.slots.map((slot) => (
                <Pressable
                  key={slot.startsAt}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: !slot.bookable && slot.state !== 'MINE' }}
                  accessibilityLabel={
                    slot.state === 'MINE'
                      ? `${formatTime(slot.startsAt, locale)}, van jou`
                      : slot.state === 'TAKEN'
                        ? `${formatTime(slot.startsAt, locale)}, bezet door ${slot.takenByName}`
                        : `${formatTime(slot.startsAt, locale)}, vrij`
                  }
                  disabled={busy !== null || (!slot.bookable && slot.state !== 'MINE')}
                  onPress={() => (slot.state === 'MINE' ? confirmCancel(slot) : void press(slot))}
                  style={[
                    styles.slot,
                    slot.state === 'MINE' && styles.slotMine,
                    slot.state === 'TAKEN' && styles.slotTaken,
                    !slot.bookable && slot.state === 'FREE' && styles.slotOff,
                  ]}
                >
                  <Text
                    style={[
                      styles.slotTime,
                      slot.state === 'MINE' && styles.slotTimeMine,
                      slot.state === 'TAKEN' && styles.slotTimeTaken,
                    ]}
                  >
                    {formatTime(slot.startsAt, locale)}
                  </Text>
                  {slot.state === 'TAKEN' && slot.takenByName ? (
                    <Text style={styles.slotName} numberOfLines={1}>
                      {slot.takenByName.split(' ')[0]}
                    </Text>
                  ) : null}
                  {slot.state === 'MINE' ? <Text style={styles.slotName}>jij</Text> : null}
                </Pressable>
              ))}
            </View>
          </Card>
        ))}
      </ScrollView>
    </>
  );
}

/** De melding bij een geweigerde reservatie; de codes komen van de server. */
function pianoErrorText(error: unknown): string {
  if (!(error instanceof ApiError)) {
    return 'Geen verbinding met vtk.be. Probeer het straks opnieuw.';
  }
  switch (error.code) {
    case 'TAKEN':
      return 'Iemand was je net voor met dit uur.';
    case 'WEEK_LIMIT':
      return 'Je zit aan je maximum voor deze week. Laat eerst een ander uur los.';
    case 'PAST':
      return 'Dat uur is voorbij.';
    case 'BEYOND_HORIZON':
      return 'Zo ver vooruit kan je nog niet boeken.';
    case 'NOT_FOUND':
      return 'Dat uur bestaat niet meer in de agenda.';
    default:
      return error.message;
  }
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.paper },
  content: { padding: SPACING.lg, gap: SPACING.md, paddingBottom: SPACING.xxl },
  title: { ...TYPE.cardTitle, color: COLORS.ink },
  body: { ...TYPE.body, color: COLORS.body },
  day: { ...TYPE.sectionTitle, color: COLORS.ink },
  slots: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm, marginTop: SPACING.sm },
  slot: {
    minWidth: 76,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: COLORS.line2,
    backgroundColor: COLORS.surface,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    alignItems: 'center',
  },
  // Geel voor wat van jou is, papier voor wat bezet is. Kleur is nooit het enige
  // signaal: er staat ook een naam of "jij" onder.
  slotMine: { backgroundColor: COLORS.yellow, borderColor: COLORS.yellow },
  slotTaken: { backgroundColor: COLORS.paper2, borderColor: COLORS.line },
  slotOff: { opacity: 0.4 },
  slotTime: { ...TYPE.body, fontFamily: TYPE.cardTitle.fontFamily, color: COLORS.ink },
  slotTimeMine: { color: COLORS.ink },
  slotTimeTaken: { color: COLORS.muted },
  slotName: { ...TYPE.small, fontSize: 11, color: COLORS.muted },
});

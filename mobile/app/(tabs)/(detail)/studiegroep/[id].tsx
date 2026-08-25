import { useLocalSearchParams, useRouter } from 'expo-router';
import { Share2, UserMinus } from 'lucide-react-native';
import { useState } from 'react';
import {
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import type { AppStudyGroup, AppStudyMemberState } from '../../../../src/api/contract';
import {
  fetchStudyOverview,
  leaveStudyGroup,
  updateStudyGroup,
} from '../../../../src/api/endpoints';
import { messageFor, useResource } from '../../../../src/api/useResource';
import { PageHead } from '../../../../src/components/PageHead';
import { Skyline, relativeBuildings } from '../../../../src/components/Skyline';
import { Button, Card, ErrorState, Loading } from '../../../../src/components/ui';
import { formatSpan } from '../../../../src/format';
import { COLORS, RADIUS, SPACING, TYPE } from '../../../../src/theme/tokens';
import { groupErrorText } from './nieuw';

/**
 * Eén blokgroep: de code, de leden, het doel.
 *
 * De skyline bovenaan is de groep zelf: elk lid een gebouw, hoog naar wat het deze
 * week zat, met licht achter de ramen bij wie nu bezig is. Dat zegt in één beeld
 * wat de lijst eronder in cijfers herhaalt, en het is meteen de reden dat de
 * cijfers niet bovenaan hoeven te staan.
 */

/** De hoogte van het skylinepaneel; bepaalt hoeveel verdiepingen er passen. */
const SKYLINE_HEIGHT = 132;

/** De doelen die je kan kiezen. Een vrij getal invullen levert niets extra op. */
const GOALS: { label: string; minutes: number | null }[] = [
  { label: 'Geen doel', minutes: null },
  { label: '20u', minutes: 20 * 60 },
  { label: '40u', minutes: 40 * 60 },
  { label: '60u', minutes: 60 * 60 },
  { label: '100u', minutes: 100 * 60 },
];

export default function StudiegroepScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [busy, setBusy] = useState(false);

  const resource = useResource('studeren', () => fetchStudyOverview(), 'detail');
  const group = resource.data?.groups.find((item) => item.id === id) ?? null;

  const share = async () => {
    if (!group) return;
    await Share.share({
      message: `Kom blokken met ${group.name}. Open de VTK-app, tab Studeren, en gebruik code ${group.code}.`,
    });
  };

  const setGoal = async (minutes: number | null) => {
    if (!group) return;
    setBusy(true);
    try {
      await updateStudyGroup(group.id, { weeklyGoalMinutes: minutes });
      await resource.refresh();
    } catch (error) {
      Alert.alert('Dat lukte niet', groupErrorText(error));
    } finally {
      setBusy(false);
    }
  };

  const remove = (member: AppStudyMemberState) => {
    if (!group) return;
    Alert.alert(
      `${member.name} verwijderen`,
      `${member.name} verdwijnt uit ${group.name} en ziet jullie tijden niet meer. De gestudeerde tijd zelf blijft van ${member.name}.`,
      [
        { text: 'Laten staan', style: 'cancel' },
        {
          text: 'Verwijderen',
          style: 'destructive',
          onPress: async () => {
            try {
              await leaveStudyGroup(group.id, member.userId);
              await resource.refresh();
            } catch (error) {
              Alert.alert('Dat lukte niet', groupErrorText(error));
            }
          },
        },
      ],
    );
  };

  const leave = () => {
    if (!group) return;
    const last = group.memberCount === 1;
    Alert.alert(
      last ? `${group.name} verwijderen` : `Uit ${group.name} stappen`,
      last
        ? 'Je bent het laatste lid, dus de groep verdwijnt en de code werkt niet meer. Je eigen studietijd blijft gewoon staan.'
        : 'Je verdwijnt uit de lijst en ziet hun tijden niet meer. Je eigen studietijd blijft gewoon staan, en met de code kan je later terugkomen.',
      [
        { text: 'Blijven', style: 'cancel' },
        {
          text: last ? 'Verwijderen' : 'Eruit stappen',
          style: 'destructive',
          onPress: async () => {
            try {
              await leaveStudyGroup(group.id);
              router.back();
            } catch (error) {
              Alert.alert('Dat lukte niet', groupErrorText(error));
            }
          },
        },
      ],
    );
  };

  if (resource.loading && !resource.data) return <Loading label="Groep ophalen" />;
  if (!group) {
    return (
      <>
        <PageHead title="Blokgroep" />
        <ErrorState
          message={resource.data ? 'Deze groep bestaat niet meer.' : messageFor(resource.error)}
          onRetry={() => void resource.refresh()}
        />
      </>
    );
  }

  return (
    <>
      <PageHead
        title={group.name}
        kicker="Blokgroep"
        subtitle={`${group.memberCount} ${group.memberCount === 1 ? 'lid' : 'leden'}`}
        right={
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Code delen"
            onPress={() => void share()}
            hitSlop={10}
          >
            <Share2 color={COLORS.yellow} size={21} />
          </Pressable>
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
        <Skyline buildings={skylineOf(group)} height={SKYLINE_HEIGHT} moon />

        <Card>
          <Text style={styles.label}>Code om te delen</Text>
          <Text style={styles.code}>{group.code}</Text>
          <Text style={styles.hint}>
            Wie deze code heeft, kan erbij. Deel ze dus alleen met wie je erbij wil.
          </Text>
          <Button label="Code doorsturen" variant="ghost" onPress={() => void share()} />
        </Card>

        <Card>
          <Text style={styles.label}>Samen deze week</Text>
          <Text style={styles.big}>
            {formatSpan(group.weekSeconds)}
            {group.weeklyGoalMinutes ? ` van de ${formatSpan(group.weeklyGoalMinutes * 60)}` : ''}
          </Text>
          {group.isOwner ? (
            <>
              <Text style={styles.hint}>
                Een groepsdoel maakt het samenwerken in plaats van enkel wedijveren;
                ook wie onderaan staat, telt mee.
              </Text>
              <View style={styles.goals}>
                {GOALS.map((goal) => {
                  const active = (group.weeklyGoalMinutes ?? null) === goal.minutes;
                  return (
                    <Pressable
                      key={goal.label}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                      accessibilityLabel={goal.label}
                      disabled={busy}
                      onPress={() => void setGoal(goal.minutes)}
                      style={[styles.goal, active && styles.goalOn]}
                    >
                      <Text style={[styles.goalText, active && styles.goalTextOn]}>
                        {goal.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </>
          ) : (
            <Text style={styles.hint}>
              Alleen wie de groep maakte, kan het doel wijzigen.
            </Text>
          )}
        </Card>

        <Card>
          <Text style={styles.label}>Leden</Text>
          {group.members.map((member) => (
            <View key={member.userId} style={styles.member}>
              <View style={styles.memberText}>
                <Text style={styles.memberName} numberOfLines={1}>
                  {member.isYou ? `${member.name} (jij)` : member.name}
                </Text>
                <Text style={styles.memberSub}>
                  {member.studying
                    ? `Nu bezig, ${formatSpan(member.liveSeconds ?? 0)}`
                    : `${formatSpan(member.weekSeconds)} deze week`}
                </Text>
              </View>
              {group.isOwner && !member.isYou ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Verwijderen: ${member.name}`}
                  onPress={() => remove(member)}
                  hitSlop={8}
                  style={({ pressed }) => [styles.remove, pressed && styles.pressed]}
                >
                  <UserMinus color={COLORS.muted} size={17} />
                </Pressable>
              ) : null}
            </View>
          ))}
        </Card>

        <Button
          label={group.memberCount === 1 ? 'Groep verwijderen' : 'Uit deze groep stappen'}
          variant="ghost"
          onPress={leave}
        />
      </ScrollView>
    </>
  );
}

/** Elk lid een gebouw, hoog naar wat het deze week zat. */
function skylineOf(group: AppStudyGroup) {
  return relativeBuildings(
    group.members.slice(0, 8).map((member) => ({
      key: member.userId,
      seconds: member.weekSeconds,
      active: member.studying,
    })),
    SKYLINE_HEIGHT,
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.paper },
  content: { padding: SPACING.lg, gap: SPACING.lg, paddingBottom: SPACING.xxl },
  label: { ...TYPE.kicker, color: COLORS.muted, marginBottom: SPACING.sm },
  hint: { ...TYPE.small, color: COLORS.muted },
  big: { ...TYPE.sectionTitle, color: COLORS.ink },
  code: {
    ...TYPE.pageTitle,
    color: COLORS.ink,
    letterSpacing: 6,
    marginBottom: SPACING.sm,
  },

  goals: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm, marginTop: SPACING.md },
  goal: {
    paddingHorizontal: SPACING.md,
    paddingVertical: 8,
    borderRadius: RADIUS.pill,
    borderWidth: 1,
    borderColor: COLORS.line2,
  },
  goalOn: { backgroundColor: COLORS.yellow, borderColor: COLORS.yellow },
  goalText: { ...TYPE.small, color: COLORS.body },
  goalTextOn: { color: COLORS.ink, fontFamily: TYPE.cardTitle.fontFamily },

  member: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    paddingVertical: 9,
    borderTopWidth: 1,
    borderTopColor: COLORS.line,
  },
  memberText: { flex: 1, minWidth: 0 },
  memberName: { ...TYPE.body, fontFamily: TYPE.cardTitle.fontFamily, color: COLORS.ink },
  memberSub: { ...TYPE.small, color: COLORS.muted },
  remove: { padding: 6 },
  pressed: { opacity: 0.6 },
});

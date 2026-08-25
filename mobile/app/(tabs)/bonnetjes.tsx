import { useRouter } from 'expo-router';
import { ArrowDownLeft, ArrowUpRight } from 'lucide-react-native';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { fetchVouchers } from '../../src/api/endpoints';
import { messageFor, useResource } from '../../src/api/useResource';
import { PageHead } from '../../src/components/PageHead';
import { PassCode } from '../../src/components/PassCode';
import { Button, Card, ErrorState, Loading, StaleNotice } from '../../src/components/ui';
import { formatDate } from '../../src/format';
import { useApp } from '../../src/state/app';
import { COLORS, RADIUS, SPACING, TYPE } from '../../src/theme/tokens';

/**
 * Bonnetjes: wat je verdiende met shiften en wat je ermee kan.
 *
 * **Eén bonnetje per begonnen uur shift**, en dat is een kringregel die op de
 * server leeft (`lib/shift/rewards.ts`). Hier staat enkel het getal.
 *
 * De naam is bewust "bonnetjes" en niet iets nieuws. De admin, de mails en de
 * afhaalbalie zeggen het al zo; er een tweede woord naast zetten levert precies
 * het soort discussie op waar aan een toog geen tijd voor is.
 *
 * **De historiek telt niet op naar het saldo, en dat staat er ook bij.** Een
 * beheerder die bonnetjes in geld uitbetaalt, verhoogt enkel `rewardPaid` en laat
 * hier niets achter; een lijst die niet klopt met het getal erboven zonder uitleg
 * is erger dan geen lijst.
 */
export default function BonnetjesScreen() {
  const router = useRouter();
  const { locale, viewer } = useApp();
  const resource = useResource(
    'bonnetjes',
    () => (viewer ? fetchVouchers() : Promise.reject(new Error('Niet ingelogd'))),
    viewer?.id ?? 'anon',
  );

  if (!viewer) {
    return (
      <>
        <PageHead title="Bonnetjes" />
        <ScrollView contentContainerStyle={styles.content} style={styles.root}>
          <Card>
            <Text style={styles.title}>Log eerst in</Text>
            <Text style={styles.body}>Je bonnetjes hangen aan je shiften en dus aan je account.</Text>
            <Button label="Inloggen" onPress={() => router.push('/inloggen')} />
          </Card>
        </ScrollView>
      </>
    );
  }

  if (resource.loading) return <Loading label="Bonnetjes ophalen" />;
  if (!resource.data) {
    return (
      <ErrorState message={messageFor(resource.error)} onRetry={() => void resource.refresh()} />
    );
  }

  const { balance, earnedThisYear, history } = resource.data;

  return (
    <>
      <PageHead title="Bonnetjes" subtitle="Eén per begonnen uur shift" />
      <ScrollView
        contentContainerStyle={styles.content}
        style={styles.root}
        refreshControl={
          <RefreshControl
            refreshing={resource.refreshing}
            onRefresh={() => void resource.refresh()}
          />
        }
      >
        {resource.stale ? <StaleNotice onRetry={() => void resource.refresh()} /> : null}

        <Card style={styles.balanceCard}>
          <Text style={styles.balanceValue}>{balance}</Text>
          <Text style={styles.balanceLabel}>
            {balance === 1 ? 'bonnetje staat open' : 'bonnetjes staan open'}
          </Text>
          {earnedThisYear > 0 ? (
            <Text style={styles.hint}>{earnedThisYear} verdiend dit academiejaar</Text>
          ) : null}
        </Card>

        {balance > 0 ? (
          <>
            <PassCode caption="Laat dit scannen om ermee te betalen." />
            <Text style={styles.hint}>
              Aan de toog en aan de afhaalbalie van het Theokot. Wie aanvaardt, ziet eerst je naam
              en je saldo en tikt dan pas een aantal in.
            </Text>
          </>
        ) : (
          <Card>
            <Text style={styles.body}>
              Je hebt nog geen openstaande bonnetjes. Ze komen er vanzelf bij zodra een shift
              waarop je stond, voorbij is.
            </Text>
            <Button label="Shiften bekijken" variant="ghost" onPress={() => router.push('/shiften')} />
          </Card>
        )}

        {history.length > 0 ? (
          <>
            <Text style={styles.sectionTitle}>Historiek</Text>
            <View style={styles.list}>
              {history.map((entry) => (
                <View key={entry.id} style={styles.entry}>
                  <View style={styles.entryIcon}>
                    {entry.kind === 'earned' ? (
                      <ArrowDownLeft color={COLORS.navy} size={16} />
                    ) : (
                      <ArrowUpRight color={COLORS.muted} size={16} />
                    )}
                  </View>
                  <View style={styles.entryText}>
                    <Text style={styles.entryLabel} numberOfLines={2}>
                      {entry.label}
                    </Text>
                    <Text style={styles.hint}>{formatDate(entry.at, locale)}</Text>
                  </View>
                  <Text style={entry.kind === 'earned' ? styles.plus : styles.minus}>
                    {entry.kind === 'earned' ? '+' : '-'}
                    {entry.amount}
                  </Text>
                </View>
              ))}
            </View>
            <Text style={styles.hint}>
              Deze lijst telt niet op naar het getal hierboven. Bonnetjes die een beheerder in geld
              uitbetaalde, gaan wel van je saldo af maar staan hier niet in.
            </Text>
          </>
        ) : null}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.paper },
  content: { padding: SPACING.lg, gap: SPACING.lg, paddingBottom: SPACING.xxl },

  balanceCard: { alignItems: 'center', gap: SPACING.xs, paddingVertical: SPACING.xl },
  balanceValue: { fontFamily: TYPE.pageTitle.fontFamily, fontSize: 46, lineHeight: 52, color: COLORS.ink },
  balanceLabel: { ...TYPE.body, color: COLORS.body },

  sectionTitle: { ...TYPE.sectionTitle, color: COLORS.ink },
  list: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.line,
    overflow: 'hidden',
  },
  entry: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.line,
  },
  entryIcon: {
    width: 28,
    height: 28,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.paper2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  entryText: { flex: 1, gap: 1 },
  entryLabel: { ...TYPE.body, color: COLORS.ink },
  plus: { ...TYPE.cardTitle, color: COLORS.ink },
  minus: { ...TYPE.cardTitle, color: COLORS.muted },

  title: { ...TYPE.cardTitle, color: COLORS.ink },
  body: { ...TYPE.body, color: COLORS.body },
  hint: { ...TYPE.small, color: COLORS.muted },
});

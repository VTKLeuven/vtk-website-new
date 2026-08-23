import * as WebBrowser from 'expo-web-browser';
import { ScrollView, StyleSheet, Text } from 'react-native';

import { baseUrl } from '../api/client';
import { PageHead } from './PageHead';
import { Button, Card } from './ui';
import { COLORS, SPACING, TYPE } from '../theme/tokens';

/**
 * Een tab die nog niet gebouwd is.
 *
 * Bewust een eerlijk scherm en geen lege tab: iemand die hierop klikt, wil iets
 * doen, en de site kan dat vandaag al. De knop opent die pagina in de browser met
 * de sessie die er al is.
 *
 * **Dit is tijdelijk en per tab.** Elk van deze schermen verdwijnt in de fase die
 * hem native maakt; zie `docs/plan.md`. Laat er geen achter omdat het "ook werkt".
 */
export function ComingSoon({
  title,
  subtitle,
  what,
  phase,
  path,
  linkLabel,
}: {
  title: string;
  subtitle: string;
  /** Wat hier straks komt te staan, in één zin. */
  what: string;
  /** In welke fase van `docs/plan.md`. */
  phase: string;
  /** Het pad op de site dat hetzelfde werk vandaag al doet. */
  path: string;
  linkLabel: string;
}) {
  return (
    <>
      <PageHead title={title} subtitle={subtitle} />
      <ScrollView contentContainerStyle={styles.content} style={styles.root}>
        <Card>
          <Text style={styles.title}>Nog niet in de app</Text>
          <Text style={styles.body}>{what}</Text>
          <Text style={styles.hint}>Gepland voor {phase}.</Text>
        </Card>
        <Card>
          <Text style={styles.body}>
            Op de site kan het wel al, en je bent daar met hetzelfde account ingelogd.
          </Text>
          <Button
            label={linkLabel}
            onPress={() => void WebBrowser.openBrowserAsync(`${baseUrl()}${path}`)}
          />
        </Card>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.paper },
  content: { padding: SPACING.lg, gap: SPACING.lg },
  title: { ...TYPE.cardTitle, color: COLORS.ink },
  body: { ...TYPE.body, color: COLORS.body },
  hint: { ...TYPE.small, color: COLORS.muted },
});

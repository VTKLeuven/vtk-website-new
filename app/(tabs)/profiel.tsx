import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { baseUrl } from '../../src/api/client';
import { signOut } from '../../src/auth/session';
import { PageHead } from '../../src/components/PageHead';
import { Button, Card, SectionTitle } from '../../src/components/ui';
import { useApp } from '../../src/state/app';
import { COLORS, RADIUS, SPACING, TYPE } from '../../src/theme/tokens';

/**
 * Profiel: wie je bent, en de knoppen die daaraan hangen.
 *
 * In fase 2 komen hier je bestellingen, je tickets en je shiften bij. Nu draagt
 * het scherm het inloggen, de poorten en de instellingen; dat is genoeg om de
 * schil te kunnen testen.
 */
export default function ProfielScreen() {
  const router = useRouter();
  const { viewer, gate, refresh, locale, setLocale } = useApp();
  const [signingOut, setSigningOut] = useState(false);

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
          <Settings locale={locale} setLocale={setLocale} onOpenServer={() => router.push('/instellingen')} />
        </ScrollView>
      </>
    );
  }

  return (
    <>
      <PageHead title="Profiel" subtitle={viewer.email} />
      <ScrollView contentContainerStyle={styles.content} style={styles.root}>
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
              <Text style={styles.hint}>{viewer.email}</Text>
            </View>
          </View>
        </Card>

        {gate ? (
          <Card featured>
            <Text style={styles.title}>
              {gate === 'onboarding' ? 'Je profiel is nog niet af' : 'Je studie is nog niet bevestigd'}
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
            Je gegevens, je bestellingen en je tickets staan voorlopig nog op de site. Ze komen
            in een volgende versie naar de app.
          </Text>
          <Button
            label="Mijn account op vtk.be"
            variant="ghost"
            onPress={() => void WebBrowser.openBrowserAsync(`${baseUrl()}/account`)}
          />
        </Card>

        <Settings locale={locale} setLocale={setLocale} onOpenServer={() => router.push('/instellingen')} />

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
          {locale === 'nl'
            ? 'De app staat in het Nederlands.'
            : 'The app is set to English.'}
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
  groupRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SPACING.md,
    paddingVertical: SPACING.xs,
  },
  groupName: { ...TYPE.body, color: COLORS.ink, flex: 1 },
});

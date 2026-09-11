import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { baseUrl, defaultBaseUrl, setBaseUrl } from '../src/api/client';
import { clearCache } from '../src/storage';
import { PageHead } from '../src/components/PageHead';
import { Button, Card } from '../src/components/ui';
import { useApp } from '../src/state/app';
import { COLORS, RADIUS, SPACING, TYPE } from '../src/theme/tokens';

/**
 * Tegen welke server de app praat.
 *
 * Bestaat om te kunnen testen: de weblogin heeft HTTPS nodig, dus lokaal draai je
 * vtk-website-new achter een cloudflared-tunnel en vul je die URL hier in. Zonder
 * dit veld zou elke testronde een nieuwe build vragen.
 *
 * Het wisselen gooit de leescache weg (zie `setBaseUrl`): inhoud van de ene site
 * op de andere tonen levert schermen op die iets beweren dat er niet is.
 */
export default function SettingsScreen() {
  const router = useRouter();
  const { refresh } = useApp();
  const defBase = defaultBaseUrl();
  const [value, setValue] = useState(baseUrl());
  const [saved, setSaved] = useState(false);
  const [cacheCleared, setCacheCleared] = useState(false);

  const save = () => {
    setBaseUrl(value);
    setValue(baseUrl());
    setSaved(true);
    setCacheCleared(false);
    void refresh();
  };

  const resetToDefault = () => {
    setBaseUrl(defBase);
    setValue(defBase);
    setSaved(true);
    setCacheCleared(false);
    void refresh();
  };

  const emptyCache = () => {
    clearCache();
    setCacheCleared(true);
    void refresh();
  };

  return (
    <View style={styles.root}>
      <PageHead title="Server" subtitle="Waar de app zijn gegevens haalt" />
      <ScrollView contentContainerStyle={styles.content}>
        <Card>
          <Text style={styles.label}>Adres</Text>
          <TextInput
            value={value}
            onChangeText={(next) => {
              setValue(next);
              setSaved(false);
            }}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            placeholder={defBase}
            placeholderTextColor={COLORS.muted}
            style={styles.input}
          />
          <Text style={styles.hint}>
            Standaard: {defBase}. Voor een lokale test vul je hier je cloudflared-tunnel in;
            een gewone localhost werkt niet, want de login vraagt HTTPS.
          </Text>
          <View style={styles.buttonStack}>
            <Button label={saved ? 'Bewaard' : 'Bewaren'} onPress={save} />
            {value !== defBase ? (
              <Button
                label={`Herstel naar ${defBase}`}
                variant="ghost"
                onPress={resetToDefault}
              />
            ) : null}
          </View>
        </Card>

        <Card>
          <Text style={styles.label}>Tijdelijke opslag (cache)</Text>
          <Text style={styles.hint}>
            Schermen bewaren gegevens tijdelijk lokaal zodat ze meteen laden. Als foto{"'"}s of albums
            niet verschijnen door verouderde gegevens, kan je de cache hier direct legen.
          </Text>
          <Button
            label={cacheCleared ? 'Cache is geleegd' : 'Cache nu legen'}
            variant="ghost"
            onPress={emptyCache}
          />
        </Card>

        <Card>
          <Text style={styles.label}>Over deze app</Text>
          <Text style={styles.hint}>Versie {Constants.expoConfig?.version ?? '?'}</Text>
        </Card>

        <Button label="Sluiten" variant="ghost" onPress={() => router.back()} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.paper },
  content: { padding: SPACING.lg, gap: SPACING.md },
  label: { ...TYPE.cardTitle, color: COLORS.ink },
  buttonStack: { gap: SPACING.sm },
  input: {
    ...TYPE.body,
    color: COLORS.ink,
    borderWidth: 1,
    borderColor: COLORS.line2,
    borderRadius: RADIUS.sm,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    backgroundColor: COLORS.surface,
  },
  hint: { ...TYPE.small, color: COLORS.muted },
});

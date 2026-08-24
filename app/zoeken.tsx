import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { ExternalLink, Search } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { search } from '../src/api/endpoints';
import type { AppSearchResult } from '../src/api/contract';
import { PageHead } from '../src/components/PageHead';
import { Empty, Loading } from '../src/components/ui';
import { useApp } from '../src/state/app';
import { COLORS, RADIUS, SPACING, TYPE } from '../src/theme/tokens';

/** Wachttijd voor een getikte letter een zoekopdracht wordt. */
const DEBOUNCE_MS = 350;

/**
 * Zoeken op de site.
 *
 * Bewust geen `useResource`: dit zoekt bij elke aanslag opnieuw en heeft dus
 * geen leescache nodig; wat er gisteren gevonden werd, wil niemand terugzien.
 * De vertraging van 350 ms bestaat om niet per letter een zoekopdracht te doen,
 * en de teller `sequence` zorgt dat een traag antwoord op "gala" nooit een
 * sneller antwoord op "galabal" overschrijft.
 */
export default function ZoekenScreen() {
  const router = useRouter();
  const { locale } = useApp();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<AppSearchResult[]>([]);
  const [searched, setSearched] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) {
      setResults([]);
      setSearched(false);
      return;
    }

    let current = true;
    setBusy(true);
    const timer = setTimeout(() => {
      search(locale, term)
        .then((outcome) => {
          if (!current) return;
          setResults(outcome.results);
          setSearched(outcome.searched);
        })
        .catch(() => {
          if (current) setResults([]);
        })
        .finally(() => {
          if (current) setBusy(false);
        });
    }, DEBOUNCE_MS);

    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [query, locale]);

  const open = (result: AppSearchResult) => {
    // Een pagina van deze site kan native; al de rest (een evenement met een
    // eigen scherm daargelaten) opent op het web, want die schermen bestaan hier
    // nog niet.
    if (result.external) {
      void WebBrowser.openBrowserAsync(result.href);
      return;
    }
    if (result.kind === 'event') {
      router.push(`/evenement/${result.id}`);
      return;
    }
    void WebBrowser.openBrowserAsync(result.href);
  };

  return (
    <>
      <PageHead title="Zoeken" subtitle="Pagina's, activiteiten en albums" />

      <View style={styles.searchBar}>
        <Search color={COLORS.muted} size={18} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Waar zoek je naar?"
          placeholderTextColor={COLORS.muted}
          style={styles.input}
          autoFocus
          autoCorrect={false}
          accessibilityLabel="Zoekterm"
          returnKeyType="search"
        />
      </View>

      {busy && results.length === 0 ? <Loading label="Zoeken" /> : null}

      <FlatList
        data={results}
        keyExtractor={(result) => `${result.kind}:${result.id}`}
        style={styles.root}
        contentContainerStyle={styles.list}
        keyboardDismissMode="on-drag"
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={item.title}
            onPress={() => open(item)}
            style={({ pressed }) => [styles.row, pressed && styles.pressed]}
          >
            <View style={styles.text}>
              <Text style={styles.title}>{item.title}</Text>
              {item.meta ? <Text style={styles.meta}>{item.meta}</Text> : null}
              {item.snippet ? (
                <Text style={styles.snippet} numberOfLines={2}>
                  {item.snippet}
                </Text>
              ) : null}
            </View>
            {item.external ? <ExternalLink color={COLORS.muted} size={16} /> : null}
          </Pressable>
        )}
        ListEmptyComponent={
          busy ? null : searched ? (
            <Empty title="Niets gevonden" hint={`Geen resultaten voor "${query.trim()}".`} />
          ) : (
            <Empty title="Typ om te zoeken" hint="Vanaf twee letters gaat de zoektocht van start." />
          )
        }
      />
    </>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.paper },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    margin: SPACING.lg,
    marginBottom: 0,
    paddingHorizontal: SPACING.lg,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.pill,
    borderWidth: 1,
    borderColor: COLORS.line2,
  },
  input: { ...TYPE.body, color: COLORS.ink, flex: 1, paddingVertical: SPACING.md },
  list: { padding: SPACING.lg, gap: SPACING.md, paddingBottom: SPACING.xxl },
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
  pressed: { backgroundColor: COLORS.paper2 },
  text: { flex: 1, gap: 2 },
  title: { ...TYPE.cardTitle, color: COLORS.ink },
  meta: { ...TYPE.small, color: COLORS.muted },
  snippet: { ...TYPE.small, color: COLORS.body },
});

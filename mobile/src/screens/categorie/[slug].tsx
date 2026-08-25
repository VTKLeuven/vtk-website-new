import { Image } from 'expo-image';
import { useLocalSearchParams } from 'expo-router';

import * as WebBrowser from 'expo-web-browser';
import { ChevronRight, ExternalLink } from 'lucide-react-native';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { baseUrl } from '../../api/client';
import { fetchCategory } from '../../api/endpoints';
import { messageFor, useResource } from '../../api/useResource';
import { PageHead } from '../../components/PageHead';
import { Empty, ErrorState, Loading } from '../../components/ui';
import { useApp } from '../../state/app';
import { useTabRouter } from '../../navigation';
import { COLORS, RADIUS, SPACING, TYPE } from '../../theme/tokens';

/**
 * De pagina's onder één categorie.
 *
 * Brede rijen met een vierkante foto links, zoals de categoriepagina's op de
 * site. Geen kaartenraster: de meeste pagina's hebben geen samenvatting, en een
 * raster van titels zegt bijna niets.
 */
export default function CategorieScreen() {
  const router = useTabRouter();
  const { locale } = useApp();
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const resource = useResource(
    `categorie:${slug}`,
    () => fetchCategory(locale, slug),
    `${locale}:${slug}`,
  );

  if (resource.loading) return <Loading />;
  if (!resource.data) {
    return (
      <ErrorState message={messageFor(resource.error)} onRetry={() => void resource.refresh()} />
    );
  }

  const category = resource.data;
  // De menu-items staan onder de pagina's, net als op de site: het zijn
  // bestemmingen elders en geen inhoud van deze categorie.
  const rows = [
    ...category.pages.map((page) => ({ kind: 'page' as const, page })),
    ...category.links.map((link) => ({ kind: 'link' as const, link })),
  ];

  return (
    <>
      <PageHead title={category.label} subtitle={category.intro} />
      <FlatList
        data={rows}
        keyExtractor={(row) => (row.kind === 'page' ? `p:${row.page.slug}` : `l:${row.link.id}`)}
        style={styles.root}
        contentContainerStyle={styles.list}
        renderItem={({ item }) =>
          item.kind === 'page' ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={item.page.title}
              onPress={() => router.push(`/pagina/${item.page.slug}`)}
              style={({ pressed }) => [styles.row, pressed && styles.pressed]}
            >
              {item.page.imageUrl ? (
                <Image source={{ uri: item.page.imageUrl }} style={styles.photo} contentFit="cover" />
              ) : (
                <View style={[styles.photo, styles.photoEmpty]} />
              )}
              <View style={styles.text}>
                <Text style={styles.title}>{item.page.title}</Text>
                {item.page.excerpt ? (
                  <Text style={styles.excerpt} numberOfLines={3}>
                    {item.page.excerpt}
                  </Text>
                ) : null}
              </View>
              <ChevronRight color={COLORS.muted} size={18} />
            </Pressable>
          ) : (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={item.link.label}
              onPress={() => {
                const url = /^https?:\/\//i.test(item.link.href)
                  ? item.link.href
                  : `${baseUrl()}${item.link.href}`;
                void WebBrowser.openBrowserAsync(url);
              }}
              style={({ pressed }) => [styles.row, pressed && styles.pressed]}
            >
              <View style={styles.text}>
                <Text style={styles.title}>{item.link.label}</Text>
              </View>
              <ExternalLink color={COLORS.muted} size={18} />
            </Pressable>
          )
        }
        ListEmptyComponent={
          <Empty title="Nog niets hier" hint="Er staan nog geen pagina's onder deze categorie." />
        }
      />
    </>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.paper },
  list: { padding: SPACING.lg, gap: SPACING.md, paddingBottom: SPACING.xxl },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.line,
    padding: SPACING.md,
  },
  pressed: { backgroundColor: COLORS.paper2 },
  photo: { width: 64, height: 64, borderRadius: RADIUS.sm, backgroundColor: COLORS.paper2 },
  photoEmpty: { borderWidth: 1, borderColor: COLORS.line },
  text: { flex: 1, gap: 3 },
  title: { ...TYPE.cardTitle, color: COLORS.ink },
  excerpt: { ...TYPE.small, color: COLORS.muted },
});

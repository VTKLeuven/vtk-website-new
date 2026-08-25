import { Image } from 'expo-image';
import * as WebBrowser from 'expo-web-browser';
import { useMemo } from 'react';
import { StyleSheet, useWindowDimensions } from 'react-native';
import Markdown from 'react-native-markdown-display';

import { baseUrl } from '../api/client';
import { COLORS, FONTS, RADIUS, SPACING, TYPE } from '../theme/tokens';

/**
 * Markdown, in de typografie van de site.
 *
 * Dit is de tegenhanger van `prose-vtk` op de website: dezelfde kleuren,
 * dezelfde verhoudingen tussen kop en tekst, dezelfde citaatbalk in het geel.
 * De inhoud wordt door leden beheerd, dus **rauwe HTML blijft uit**; dat is
 * dezelfde regel als op de site, en `react-native-markdown-display` rendert het
 * sowieso niet.
 *
 * Een link opent in de browser. Een intern pad krijgt de basis-URL ervoor: in de
 * database staan bestemmingen soms als `/praesidium` en soms als een volledig
 * adres, en dat is daar een bewuste keuze.
 *
 * **Afbeeldingen krijgen een eigen regel.** Standaard tekent
 * `react-native-markdown-display` ze met `react-native-fit-image`, en dat pakket
 * is uit 2018 en leunt op `Image.propTypes`, dat React Native al jaren niet meer
 * heeft. Vandaag valt dat stil terug op niets, maar het is een pad dat we niet
 * willen betreden; `expo-image` doet het werk beter en cachet bovendien.
 */
export function Prose({ children }: { children: string }) {
  const { width } = useWindowDimensions();

  const onLinkPress = useMemo(
    () => (url: string) => {
      const target = /^https?:\/\//i.test(url) ? url : `${baseUrl()}${url}`;
      void WebBrowser.openBrowserAsync(target);
      // `false` betekent: wij hebben het afgehandeld, open het niet nog eens.
      return false;
    },
    [],
  );

  const rules = useMemo(
    () => ({
      image: (node: { key: string; attributes: { src?: string; alt?: string } }) => {
        const src = node.attributes.src;
        if (!src) return null;
        const uri = /^https?:\/\//i.test(src) ? src : `${baseUrl()}${src}`;
        return (
          <Image
            key={node.key}
            source={{ uri }}
            // Een vaste hoogte, want de echte verhouding kennen we hier niet en
            // een beeld dat na het laden van hoogte verandert, laat de tekst
            // eronder verspringen terwijl iemand aan het lezen is.
            style={{ width: '100%', height: Math.round((width - 32) * 0.6), borderRadius: 10 }}
            contentFit="cover"
            accessibilityLabel={node.attributes.alt}
            transition={150}
          />
        );
      },
    }),
    [width],
  );

  return (
    <Markdown style={markdownStyles} rules={rules} onLinkPress={onLinkPress}>
      {children}
    </Markdown>
  );
}

/**
 * De stylesheet die `react-native-markdown-display` verwacht. Losse sleutels per
 * elementtype, geen cascade; vandaar de herhaling van kleuren.
 */
const markdownStyles = StyleSheet.create({
  body: { ...TYPE.body, color: COLORS.body },

  heading1: {
    fontFamily: FONTS.bold,
    fontSize: 24,
    lineHeight: 30,
    color: COLORS.ink,
    marginTop: SPACING.xl,
    marginBottom: SPACING.sm,
  },
  heading2: {
    fontFamily: FONTS.semibold,
    fontSize: 20,
    lineHeight: 26,
    color: COLORS.ink,
    marginTop: SPACING.xl,
    marginBottom: SPACING.sm,
  },
  heading3: {
    fontFamily: FONTS.semibold,
    fontSize: 17,
    lineHeight: 23,
    color: COLORS.ink,
    marginTop: SPACING.lg,
    marginBottom: SPACING.xs,
  },

  paragraph: { marginTop: 0, marginBottom: SPACING.md },
  strong: { fontFamily: FONTS.semibold, color: COLORS.ink },
  em: { fontStyle: 'italic' },
  link: { color: COLORS.navy, textDecorationLine: 'underline' },

  bullet_list: { marginBottom: SPACING.md },
  ordered_list: { marginBottom: SPACING.md },
  list_item: { marginBottom: SPACING.xs },

  // De gele accentbalk van een citaat op de site.
  blockquote: {
    backgroundColor: COLORS.paper2,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.yellow,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    marginBottom: SPACING.md,
    borderRadius: RADIUS.sm,
  },

  code_inline: {
    fontFamily: 'Courier',
    backgroundColor: COLORS.paper2,
    color: COLORS.ink,
    paddingHorizontal: 4,
    borderRadius: 4,
  },
  fence: {
    fontFamily: 'Courier',
    backgroundColor: COLORS.paper2,
    color: COLORS.ink,
    borderWidth: 1,
    borderColor: COLORS.line,
    borderRadius: RADIUS.sm,
    padding: SPACING.md,
    marginBottom: SPACING.md,
  },
  code_block: {
    fontFamily: 'Courier',
    backgroundColor: COLORS.paper2,
    color: COLORS.ink,
    borderRadius: RADIUS.sm,
    padding: SPACING.md,
    marginBottom: SPACING.md,
  },

  hr: { backgroundColor: COLORS.line, height: 1, marginVertical: SPACING.lg },

  // Een brede tabel mag scrollen in zijn eigen kader, niet de pagina meesleuren.
  table: { borderWidth: 1, borderColor: COLORS.line, borderRadius: RADIUS.sm, marginBottom: SPACING.md },
  th: { padding: SPACING.sm, fontFamily: FONTS.semibold, color: COLORS.ink },
  td: { padding: SPACING.sm },

  image: { borderRadius: RADIUS.sm, marginBottom: SPACING.md },
});

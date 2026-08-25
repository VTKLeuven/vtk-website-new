import { useRouter } from 'expo-router';
import { X } from 'lucide-react-native';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView, type WebViewNavigation } from 'react-native-webview';

import { COLORS, SPACING, TYPE } from '../theme/tokens';

/**
 * Een stuk website in de app.
 *
 * Bewust beperkt tot drie soorten schermen, en die drie hebben allemaal dezelfde
 * reden: ze horen bij de identiteit of bij het geld, en die willen we níét
 * nabouwen.
 *
 * - **inloggen**, want daar hangt KU Leuven-SSO aan. Een eigen loginformulier
 *   zou dat moeten nadoen, en dan bouw je een tweede plek waar wachtwoorden
 *   langskomen.
 * - **onboarding en studiebevestiging**, de twee poorten uit `proxy.ts`.
 * - **betalen**, straks: Mollie hoort in een browser thuis.
 *
 * Alles wat gewone inhoud is, wordt native. Een WebView is hier geen manier om
 * werk uit te stellen; staat er iets in dat er niet in hoort, dan is dat een bug.
 */
export function WebFlow({
  url,
  title,
  /** Klaar zodra de WebView hier langskomt. Krijgt de nieuwe URL. */
  isDone,
  onDone,
}: {
  url: string;
  title: string;
  isDone: (url: string) => boolean;
  onDone: () => void;
}) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);

  const handleNavigation = (event: WebViewNavigation) => {
    if (event.loading) return;
    if (isDone(event.url)) onDone();
  };

  return (
    <View style={styles.root}>
      <View style={[styles.bar, { paddingTop: insets.top + SPACING.sm }]}>
        <Text style={styles.title}>{title}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Sluiten"
          onPress={() => router.back()}
          hitSlop={12}
        >
          <X color={COLORS.onDark} size={22} />
        </Pressable>
      </View>

      <WebView
        source={{ uri: url }}
        onNavigationStateChange={handleNavigation}
        onLoadEnd={() => setLoading(false)}
        onLoadStart={() => setLoading(true)}
        // Zonder dit deelt de WebView op iOS zijn cookies niet met `fetch`, en
        // dan is de app na het inloggen nog steeds uitgelogd.
        sharedCookiesEnabled
        thirdPartyCookiesEnabled
        style={styles.web}
      />

      {loading ? (
        <View style={styles.loading} pointerEvents="none">
          <ActivityIndicator color={COLORS.navy} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.paper },
  bar: {
    backgroundColor: COLORS.navy,
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SPACING.md,
  },
  title: { ...TYPE.cardTitle, color: COLORS.onDark },
  web: { flex: 1, backgroundColor: COLORS.paper },
  loading: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

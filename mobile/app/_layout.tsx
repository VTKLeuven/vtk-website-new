import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from '@expo-google-fonts/inter';
import { InstrumentSerif_400Regular_Italic } from '@expo-google-fonts/instrument-serif';
import * as Notifications from 'expo-notifications';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AppProvider } from '../src/state/app';
import { COLORS } from '../src/theme/tokens';

void SplashScreen.preventAutoHideAsync();

/**
 * De wortel. Elke route staat hier expliciet in de `<Stack>`, zoals in
 * vtk-scanner-app; zo is in één blik te zien welke schermen er zijn.
 */
export default function RootLayout() {
  const router = useRouter();
  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    InstrumentSerif_400Regular_Italic,
  });

  useEffect(() => {
    if (fontsLoaded) void SplashScreen.hideAsync();
  }, [fontsLoaded]);

  /**
   * Een tik op een pushbericht opent het scherm dat erbij hoort.
   *
   * De server zet dat pad in `data.path` (zie `lib/app-api/push.ts`). Er wordt
   * bewust enkel een pad binnen de app gevolgd en geen URL: een bericht dat een
   * willekeurig adres kan openen, is een open deur.
   */
  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const path = response.notification.request.content.data?.path;
      if (typeof path === 'string' && path.startsWith('/')) {
        router.push(path as never);
      }
    });
    return () => subscription.remove();
  }, [router]);

  if (!fontsLoaded) return null;

  return (
    <SafeAreaProvider>
      <AppProvider>
        {/* De schermkop is navy, dus de statusbalk staat licht. */}
        <StatusBar style="light" />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: COLORS.paper },
          }}
        >
          <Stack.Screen name="(tabs)" />
          {/* De adressen van voor elke tab zijn eigen stack kreeg. Ze verwijzen
              enkel door, zodat een ouder pushbericht of een link van buitenaf
              nog steeds op het juiste scherm uitkomt. Zie src/navigation.ts. */}
          <Stack.Screen name="(oud)" />
          {/* Enkel deze drie liggen bewust óver de tabbalk: het zijn modals, en
              een modal die de navigatie eronder laat staan is geen modal. */}
          <Stack.Screen name="inloggen" options={{ presentation: 'modal' }} />
          <Stack.Screen name="poort" options={{ presentation: 'modal' }} />
          <Stack.Screen name="instellingen" options={{ presentation: 'modal' }} />
        </Stack>
      </AppProvider>
    </SafeAreaProvider>
  );
}

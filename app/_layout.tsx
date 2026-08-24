import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from '@expo-google-fonts/inter';
import { InstrumentSerif_400Regular_Italic } from '@expo-google-fonts/instrument-serif';
import { Stack } from 'expo-router';
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
          <Stack.Screen name="evenement/[id]" />
          <Stack.Screen name="tickets/index" />
          <Stack.Screen name="tickets/[slug]" />
          <Stack.Screen name="mijn-tickets" />
          <Stack.Screen name="categorie/[slug]" />
          <Stack.Screen name="pagina/[slug]" />
          <Stack.Screen name="album/[slug]" />
          <Stack.Screen name="media" />
          <Stack.Screen name="praesidium" />
          <Stack.Screen name="zoeken" />
          <Stack.Screen name="inloggen" options={{ presentation: 'modal' }} />
          <Stack.Screen name="poort" options={{ presentation: 'modal' }} />
          <Stack.Screen name="instellingen" options={{ presentation: 'modal' }} />
        </Stack>
      </AppProvider>
    </SafeAreaProvider>
  );
}

// Gemaakt door scripts/genereer-routes.mjs. Pas src/navigation.ts aan.

import { Stack } from 'expo-router';

import { COLORS } from '../../../src/theme/tokens';

/**
 * De stack van de tab **Kalender**.
 *
 * Elke tab heeft er een, en dat is niet uit netheid: **terugvegen popt een stack,
 * dus er moet een scherm onder liggen**. Dat scherm is de tab zelf. Alles wat je
 * hier opent komt erbovenop, en teruggaan komt daardoor altijd uit waar je
 * vandaan kwam. Zie src/navigation.ts voor het geheel.
 */
export default function KalenderStackLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: COLORS.paper },
        // De veeg vanaf de linkerrand. Op iOS is dit de standaard, op Android niet.
        gestureEnabled: true,
        animation: 'slide_from_right',
      }}
    />
  );
}

// Gemaakt door scripts/genereer-routes.mjs. Pas src/navigation.ts aan.

import { Stack } from 'expo-router';

import { COLORS } from '../../../src/theme/tokens';

/**
 * De stack van de tab **Studeren**.
 *
 * Elke tab heeft er een, en dat is niet uit netheid: **terugvegen popt een stack,
 * dus er moet een scherm onder liggen**. Dat scherm is de tab zelf. Alles wat je
 * hier opent komt erbovenop, en teruggaan komt daardoor altijd uit waar je
 * vandaan kwam. Zie src/navigation.ts voor het geheel.
 */

/**
 * Het tabscherm ligt altijd onderaan, ook wanneer je hier binnenkomt via een
 * adres dieper in de stack (een pushbericht, een oud adres, een knop vanuit een
 * stack die expo-router nog niet kende). Sinds expo-router 58 bouwt een sprong
 * naar `/meer/pocs` anders een stack met enkel POC's erin: Meer opende dan
 * telkens op POC's, en terug verliet de tab. Werkt samen met `withAnchor` in
 * `useTabRouter`.
 */
export const unstable_settings = { anchor: 'index' };

export default function StuderenStackLayout() {
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

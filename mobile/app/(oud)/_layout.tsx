// Gemaakt door scripts/genereer-routes.mjs. Pas src/navigation.ts aan.

import { Stack } from 'expo-router';

/**
 * De adressen van voor de tabs hun eigen stack kregen.
 *
 * Ze bestaan enkel om door te verwijzen. Een pushbericht dat vorige maand
 * verstuurd is, een link in een mail, een vtk://-adres: die wijzen naar
 * /piano en horen niet op een leeg scherm uit te komen.
 */
export default function OudLayout() {
  return <Stack screenOptions={{ headerShown: false, animation: 'none' }} />;
}

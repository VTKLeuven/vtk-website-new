import { Stack } from 'expo-router';

import { COLORS } from '../../../src/theme/tokens';

/**
 * De schermen die je vanuit een tab opent: een evenement, een pagina, een album,
 * de ticketverkoop, de piano.
 *
 * Ze zitten **binnen** de tabbalk en niet erboven, zodat die zichtbaar blijft.
 * Stonden ze in de stack van de wortel, dan schoof elk gepusht scherm over de
 * balk heen en was je de navigatie kwijt zodra je één keer doorklikte.
 *
 * `(detail)` is een routegroep, dus de haakjes staan niet in het adres:
 * `app/(tabs)/(detail)/piano.tsx` blijft gewoon `/piano`. Dat is waarom deze
 * verhuizing geen enkele `router.push` in de app raakt.
 *
 * Het is één gedeelde stack en geen stack per tab. Een evenement open je vanaf
 * Home én vanaf Kalender, tickets vanaf Home én vanaf Info; met een stack per tab
 * zou elk van die schermen in twee mappen moeten staan.
 */
export default function DetailLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: COLORS.paper },
      }}
    >
      <Stack.Screen name="zoeken" />
      <Stack.Screen name="media" />
      <Stack.Screen name="album/[slug]" />
      <Stack.Screen name="praesidium" />
      <Stack.Screen name="werkgroepen" />
      <Stack.Screen name="pocs" />
      <Stack.Screen name="piano" />
      <Stack.Screen name="shiften" />
      <Stack.Screen name="mijn-tickets" />
      <Stack.Screen name="tickets/index" />
      <Stack.Screen name="tickets/[slug]" />
      <Stack.Screen name="categorie/[slug]" />
      <Stack.Screen name="pagina/[slug]" />
      <Stack.Screen name="evenement/[id]" />
    </Stack>
  );
}

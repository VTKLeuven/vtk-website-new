import { Stack } from 'expo-router';

import { COLORS } from '../../../src/theme/tokens';

/**
 * **Meer is de bodem van deze stack**, en dat is de hele reden dat hij hier
 * staat en niet als losse tab.
 *
 * Zonder dit lag het eraan waar je vandaan kwam: open je iets vanaf Home terwijl
 * er nog een scherm van een vorige keer in de stack stond, dan kwam je met de
 * terugknop op dát scherm uit in plaats van op Meer. `initialRouteName` zorgt dat
 * React Navigation Meer eronder schuift wanneer je rechtstreeks naar een
 * detailscherm navigeert, dus teruggaan komt altijd op Meer uit.
 */
export const unstable_settings = { initialRouteName: 'meer' };

/**
 * De schermen die je vanuit een tab opent: een evenement, een pagina, een album,
 * de ticketverkoop, de scanner, je bonnetjes.
 *
 * Ze zitten **binnen** de tabbalk en niet erboven, zodat die zichtbaar blijft.
 * Stonden ze in de stack van de wortel, dan schoof elk gepusht scherm over de
 * balk heen en was je de navigatie kwijt zodra je één keer doorklikte.
 *
 * `(detail)` is een routegroep, dus de haakjes staan niet in het adres:
 * `app/(tabs)/(detail)/piano.tsx` blijft gewoon `/piano`.
 *
 * Het is één gedeelde stack en geen stack per tab. Een evenement open je vanaf
 * Home én vanaf Kalender, de scanner vanaf Home én vanaf Tickets; met een stack
 * per tab zou elk van die schermen in twee mappen moeten staan.
 *
 * Het scherm **Meer** hoort daar zelf bij: het is de bodem van de stack en
 * tegelijk de tab. Dat is hoe een "Meer"-tab op iOS ook werkt, en het is wat
 * teruggaan voorspelbaar maakt.
 *
 * **Elk scherm hier heeft een terugknop**, en die zit in `PageHead`. De stack
 * draait met `headerShown: false`, dus er is geen systeemkop die er een tekent;
 * zonder die knop geraakte je op iOS nergens meer weg zodra je doorklikte.
 */
export default function DetailLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: COLORS.paper },
      }}
    >
      <Stack.Screen name="meer" />
      <Stack.Screen name="zoeken" />
      <Stack.Screen name="media" />
      <Stack.Screen name="album/[slug]" />
      <Stack.Screen name="praesidium" />
      <Stack.Screen name="werkgroepen" />
      <Stack.Screen name="pocs" />
      <Stack.Screen name="piano" />
      <Stack.Screen name="shiften" />
      <Stack.Screen name="profiel" />
      <Stack.Screen name="bonnetjes" />
      <Stack.Screen name="meldingen" />
      <Stack.Screen name="scannen" />
      <Stack.Screen name="scan/[eventId]" />
      <Stack.Screen name="ticket/[slug]" />
      <Stack.Screen name="categorie/[slug]" />
      <Stack.Screen name="pagina/[slug]" />
      <Stack.Screen name="evenement/[id]" />
      {/* Twee oude adressen die blijven werken. Een geïnstalleerde app kan
          maanden achterlopen, en een pushbericht van vorige week draagt nog
          `/bestellen`; dat mag niet op een leeg scherm eindigen. */}
      <Stack.Screen name="bestellen" />
      <Stack.Screen name="mijn-tickets" />
    </Stack>
  );
}

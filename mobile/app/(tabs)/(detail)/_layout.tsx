import { Stack, useNavigation } from 'expo-router';
import { useEffect } from 'react';

import { COLORS } from '../../../src/theme/tokens';

/**
 * Ruimt op wat er van een vorig bezoek nog onder ligt.
 *
 * Deze stack wordt vanuit elke tab gevoed, en een stack onthoudt wat eronder
 * ligt. Zonder dit kwam je met de terugknop op het scherm van de vorige keer uit
 * in plaats van op de tab waar je vandaan kwam: open je vanaf Home de foto's
 * terwijl er nog een pagina van Meer onder lag, dan bracht terug je naar die
 * pagina.
 *
 * De regel is simpel: **de stack krijgt enkel focus wanneer je er van buitenaf
 * in navigeert.** Blader je erbinnen door (een categorie naar een pagina), dan
 * had hij de focus al. Op het moment dat hij focus krijgt, is alles onder het
 * bovenste scherm dus oud en mag het weg.
 *
 * Wat blijft werken: doorbladeren binnen de stack, met de schuifbeweging en de
 * veeg terug die daarbij horen.
 */
function CollapseOnEnter() {
  const navigation = useNavigation();

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus' as never, () => {
      const state = navigation.getState?.();
      if (!state || state.type !== 'stack' || state.routes.length < 2) return;

      const top = state.routes[state.routes.length - 1];
      navigation.reset({ index: 0, routes: [top] } as never);
    });
    return unsubscribe;
  }, [navigation]);

  return null;
}

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
 * **Meer zit hier niet in.** Dat is een gewone tab. Zat het wél in deze stack,
 * dan zou het opruimen hierboven het onder een detailscherm vandaan vegen zodra
 * je er van buitenaf in navigeert.
 *
 * **Elk scherm hier heeft een terugknop**, en die zit in `PageHead`. De stack
 * draait met `headerShown: false`, dus er is geen systeemkop die er een tekent;
 * zonder die knop geraakte je op iOS nergens meer weg zodra je doorklikte.
 */
export default function DetailLayout() {
  return (
    <>
      <CollapseOnEnter />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: COLORS.paper },
          // Terug vegen vanaf de linkerrand, op iOS én op Android. Op Android
          // staat dit standaard uit; wie het op een iPhone gewend is, probeert
          // het daar ook.
          gestureEnabled: true,
          animation: 'slide_from_right',
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
    </>
  );
}

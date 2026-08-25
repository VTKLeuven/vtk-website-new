import { Tabs } from 'expo-router';
import { CalendarDays, House, LayoutGrid, Sandwich, Ticket } from 'lucide-react-native';

import { COLORS, FONTS } from '../../src/theme/tokens';

/**
 * De tabbalk: het enige wat deze app echt anders maakt dan de site.
 *
 * Vijf tabs, en elk daarvan is een van de redenen waarom er een app is:
 *
 * - **Home** is vandaag: wat is er open, en wat wacht er op mij.
 * - **Kalender** is wat er te doen is, met een ster om iets in je eigen lijst te
 *   zetten en in de agenda van je telefoon.
 * - **Tickets** is kopen én tonen, in twee segmenten. Ze staan samen omdat het in
 *   het hoofd van wie ze opent één zaak is; ze uit elkaar trekken zou betekenen
 *   dat je moet weten in welke van twee tabs je moet zijn voor je iets ziet.
 * - **Broodjes** is bestellen én afhalen, om dezelfde reden.
 * - **Meer** draagt de hele CMS-boom plus foto's, shiften, piano, de mensen en je
 *   profiel. Alles wat je opzoekt in plaats van doet.
 *
 * Wat er bewust **niet** in staat: een aparte Profiel-tab. Die was een vijfde
 * plaats waard toen de app vooral de site was; nu is het één rij bovenaan Meer.
 * De scanknop en je bonnetjes staan bovenaan Home, want die wil je vanaf het
 * eerste scherm kunnen bereiken zonder eerst ergens in te duiken.
 *
 * De balk volgt de site: papieren grond, een dunne `--line` bovenrand, navy voor
 * wat actief is. Geel blijft accent en wordt hier niet als vulling gebruikt.
 */
export default function TabsLayout() {
  return (
    <Tabs
      /**
       * Teruggaan brengt je naar de tab waar je vandaan kwam, niet naar Home.
       * De standaard (`firstRoute`) stuurt je altijd naar de eerste tab, en dat
       * voelt als weggeslingerd worden.
       */
      backBehavior="history"
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: COLORS.navy,
        tabBarInactiveTintColor: COLORS.muted,
        tabBarStyle: {
          backgroundColor: COLORS.paper,
          borderTopColor: COLORS.line,
          borderTopWidth: 1,
        },
        tabBarLabelStyle: { fontFamily: FONTS.medium, fontSize: 11 },
        sceneStyle: { backgroundColor: COLORS.paper },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: 'Home', tabBarIcon: ({ color, size }) => <House color={color} size={size} /> }}
      />
      <Tabs.Screen
        name="kalender"
        options={{
          title: 'Kalender',
          tabBarIcon: ({ color, size }) => <CalendarDays color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="tickets"
        options={{
          title: 'Tickets',
          tabBarIcon: ({ color, size }) => <Ticket color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="broodjes"
        options={{
          title: 'Broodjes',
          tabBarIcon: ({ color, size }) => <Sandwich color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="meer"
        options={{
          title: 'Meer',
          tabBarIcon: ({ color, size }) => <LayoutGrid color={color} size={size} />,
        }}
      />

      {/* De doorklikschermen. Ze horen bij deze navigator maar staan niet in de
          balk (`href: null`), en dat is de hele truc: samen met
          `backBehavior="history"` brengt teruggaan je naar het scherm waar je
          vandaan kwam, en niet naar een vaste plek.

          Ze stonden eerst in een gedeelde stack. Een stack onthoudt wat eronder
          ligt, en dat is precies wat hier in de weg zat: opende je iets vanaf
          Home terwijl er nog een scherm van een vorige keer onder lag, dan kwam
          je met terug op dát scherm uit. Een geschiedenis heeft dat probleem
          niet. */}
      {[
        'zoeken',
        'media',
        'album/[slug]',
        'praesidium',
        'werkgroepen',
        'pocs',
        'piano',
        'shiften',
        'profiel',
        'bonnetjes',
        'meldingen',
        'scannen',
        'scan/[eventId]',
        'ticket/[slug]',
        'categorie/[slug]',
        'pagina/[slug]',
        'evenement/[id]',
        // Twee oude adressen die blijven werken. Een geïnstalleerde app kan
        // maanden achterlopen, en een pushbericht van vorige week draagt nog
        // `/bestellen`; dat mag niet op een leeg scherm eindigen.
        'bestellen',
        'mijn-tickets',
      ].map((name) => (
        <Tabs.Screen key={name} name={name} options={{ href: null }} />
      ))}
    </Tabs>
  );
}

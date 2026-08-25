import { Tabs } from 'expo-router';
import { BookOpen, CalendarDays, House, LayoutGrid, Sandwich, Ticket } from 'lucide-react-native';

import { COLORS, FONTS } from '../../src/theme/tokens';

/**
 * De tabbalk: het enige wat deze app echt anders maakt dan de site.
 *
 * Elke tab hieronder is een map met een eigen stack erin, niet één scherm. Dat
 * staat uitgelegd in `src/navigation.ts`; kort: terugvegen popt een stack, dus
 * moet er onder elk scherm dat je opent het tabscherm liggen waar je vandaan
 * kwam. Dit bestand is het enige onder `app/` dat met de hand geschreven is; de
 * rest komt uit `npm run routes`.
 *
 * Zes tabs, en elk daarvan is een van de redenen waarom er een app is:
 *
 * - **Home** is vandaag: wat is er open, en wat wacht er op mij.
 * - **Kalender** is wat er te doen is, met een ster om iets in je eigen lijst te
 *   zetten en in de agenda van je telefoon.
 * - **Studeren** is samen blokken: wie van je vrienden er nu zit, en je eigen
 *   teller. Het is de zesde tab en niet iets onder Meer, omdat je hem tijdens de
 *   blok meerdere keren per dag opent; dat is precies het criterium waarmee de
 *   andere vijf gekozen zijn. Zes is wel het maximum: bij zeven wordt een label
 *   afgekapt en dan is de balk een raadspel.
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
        name="(home)"
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
        name="studeren"
        options={{
          title: 'Studeren',
          tabBarIcon: ({ color, size }) => <BookOpen color={color} size={size} />,
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
    </Tabs>
  );
}

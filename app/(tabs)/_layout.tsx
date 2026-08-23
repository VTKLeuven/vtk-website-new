import { Tabs } from 'expo-router';
import { CalendarDays, House, Info, Sandwich, UserRound } from 'lucide-react-native';

import { COLORS, FONTS } from '../../src/theme/tokens';

/**
 * De tabbalk: het enige wat deze app echt anders maakt dan de site.
 *
 * Vijf tabs, en dat is een keuze. **Bestellen** staat er apart in omdat het de
 * reden is dat de meeste studenten de app openen; het verstoppen onder Info zou
 * er twee tikken van maken. **Info** draagt de hele CMS-boom (de headertabs uit
 * het beheer), want zonder eigen tab moet die ergens ingeduwd worden waar niemand
 * hem zoekt.
 *
 * De balk zelf volgt de site: papieren grond, een dunne `--line` bovenrand, en
 * navy voor wat actief is. Geel blijft accent en wordt hier niet als vulling
 * gebruikt.
 */
export default function TabsLayout() {
  return (
    <Tabs
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
        name="bestellen"
        options={{
          title: 'Bestellen',
          tabBarIcon: ({ color, size }) => <Sandwich color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="info"
        options={{ title: 'Info', tabBarIcon: ({ color, size }) => <Info color={color} size={size} /> }}
      />
      <Tabs.Screen
        name="profiel"
        options={{
          title: 'Profiel',
          tabBarIcon: ({ color, size }) => <UserRound color={color} size={size} />,
        }}
      />
    </Tabs>
  );
}

#!/usr/bin/env node
/**
 * Schrijft `app/(tabs)/**` en de oude adressen uit `src/navigation.ts`.
 *
 * De routebestanden zijn dun: een `_layout.tsx` per tab en verder één regel die
 * het scherm uit `src/screens/` doorgeeft. Ze met de hand bijhouden is precies
 * het soort werk waar iets vergeten wordt, en dan mist één tab één scherm en merk
 * je dat pas op een toestel. `TAB_ROUTES` is de kaart; dit script maakt de
 * bestanden. Draaien: `npm run routes`.
 */
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = readFileSync(join(root, 'src/navigation.ts'), 'utf8');

/** Leest een object-letterlijke uit de TypeScript-bron. */
function readMap(name) {
  const body = source.match(new RegExp(`export const ${name} = \\{([\\s\\S]*?)\\n\\} as const;`));
  if (!body) throw new Error(`${name} niet gevonden in src/navigation.ts`);
  const map = {};
  for (const [, key, value] of `${body[1]}\n`.matchAll(/^\s{2}'?([\w()-]+)'?:\s*([\s\S]*?),\n(?=\s{2}\S|$)/gm)) {
    map[key] = value.trim().startsWith('[')
      ? [...value.matchAll(/'([^']+)'/g)].map((m) => m[1])
      : value.replace(/'/g, '').trim();
  }
  return map;
}

const TAB_ROUTES = readMap('TAB_ROUTES');
const TAB_INDEX_SCREENS = readMap('TAB_INDEX_SCREENS');

const TITLES = {
  '(home)': 'Home',
  kalender: 'Kalender',
  studeren: 'Studeren',
  tickets: 'Tickets',
  meer: 'Meer',
};

const NAMES = {
  '(home)': 'Home',
  kalender: 'Kalender',
  studeren: 'Studeren',
  tickets: 'Tickets',
  meer: 'Meer',
};

const GENERATED = '// Gemaakt door scripts/genereer-routes.mjs. Pas src/navigation.ts aan.\n';

const layout = (tab, up) => `${GENERATED}
import { Stack } from 'expo-router';

import { COLORS } from '${up}src/theme/tokens';

/**
 * De stack van de tab **${TITLES[tab]}**.
 *
 * Elke tab heeft er een, en dat is niet uit netheid: **terugvegen popt een stack,
 * dus er moet een scherm onder liggen**. Dat scherm is de tab zelf. Alles wat je
 * hier opent komt erbovenop, en teruggaan komt daardoor altijd uit waar je
 * vandaan kwam. Zie src/navigation.ts voor het geheel.
 */
export default function ${NAMES[tab]}StackLayout() {
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
`;

// De tabbalk zelf (`app/(tabs)/_layout.tsx`) is met de hand geschreven: iconen en
// titels zijn keuzes, geen afgeleide. Enkel de stacks eronder worden hier gemaakt.
for (const entry of readdirSync(join(root, 'app/(tabs)'), { withFileTypes: true })) {
  if (entry.isDirectory()) {
    rmSync(join(root, 'app/(tabs)', entry.name), { recursive: true, force: true });
  }
}
rmSync(join(root, 'app/(oud)'), { recursive: true, force: true });

const write = (file, body) => {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, body);
};

for (const [tab, screens] of Object.entries(TAB_ROUTES)) {
  const dir = join(root, 'app/(tabs)', tab);
  const up = (n) => '../'.repeat(n);
  write(join(dir, '_layout.tsx'), layout(tab, up(3)));
  write(join(dir, 'index.tsx'), `${GENERATED}export { default } from '${up(3)}src/screens/${TAB_INDEX_SCREENS[tab]}';\n`);
  for (const screen of screens) {
    const depth = 3 + screen.split('/').length - 1;
    write(join(dir, `${screen}.tsx`), `${GENERATED}export { default } from '${up(depth)}src/screens/${screen}';\n`);
  }
}

// De oude adressen. Een pushbericht of een link van vorige maand wijst naar
// `/piano`, niet naar `/meer/piano`; die blijven werken en zetten je in de tab
// waar het scherm thuishoort. Wat Home al draagt, heeft geen omleiding nodig:
// dat adres is nog steeds letterlijk hetzelfde.
const inHome = new Set(TAB_ROUTES['(home)']);
const seen = new Set(inHome);
const redirects = [];
for (const [tab, screens] of Object.entries(TAB_ROUTES)) {
  if (tab === '(home)') continue;
  for (const screen of screens) {
    if (seen.has(screen)) continue;
    seen.add(screen);
    redirects.push([screen, `/${tab}/${screen}`]);
  }
}

write(
  join(root, 'app/(oud)/_layout.tsx'),
  `${GENERATED}
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
`,
);

for (const [screen, target] of redirects) {
  const params = [...screen.matchAll(/\[(\w+)\]/g)].map((m) => m[1]);
  const body = params.length
    ? `${GENERATED}
import { Redirect, useLocalSearchParams } from 'expo-router';

export default function OudAdres() {
  const { ${params.join(', ')} } = useLocalSearchParams<{ ${params.map((p) => `${p}: string`).join('; ')} }>();
  return <Redirect href={\`${target.replace(/\[(\w+)\]/g, '${$1}')}\`} />;
}
`
    : `${GENERATED}
import { Redirect } from 'expo-router';

export default function OudAdres() {
  return <Redirect href="${target}" />;
}
`;
  write(join(root, 'app/(oud)', `${screen}.tsx`), body);
}

console.log(`${Object.keys(TAB_ROUTES).length} tabs, ${redirects.length} oude adressen`);

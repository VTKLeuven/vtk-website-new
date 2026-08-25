const path = require('node:path');
const { getDefaultConfig } = require('expo/metro-config');

/**
 * Metro, afgeschermd van de rest van de monorepo.
 *
 * De app staat in `mobile/`, binnen een repo die zelf al een npm-workspace is
 * (`apps/*`, `packages/*`). Metro zoekt `node_modules` van beneden naar boven,
 * dus zonder deze regel kan hij bij een pakket dat hier ontbreekt doorschuiven
 * naar dat van de website. Dan krijg je bijvoorbeeld de `react` van Next in een
 * React Native-bundel: twee kopieën van React, en fouten ("invalid hook call")
 * die niets met je code te maken hebben.
 *
 * De oplossing is **blokkeren en niet uitschakelen**. `disableHierarchicalLookup`
 * lijkt de knop ervoor, maar die zet ook het zoeken in geneste `node_modules`
 * uit, en een deel van de Expo-pakketten zit daar (`expo/node_modules/expo-asset`).
 * Wat hier staat laat dat met rust en sluit enkel de map van de verdieping erboven
 * af, zodat een ontbrekende dependency een duidelijke fout geeft in plaats van
 * stilletjes de verkeerde versie.
 *
 * `mobile/` staat daarom ook buiten `apps/`: alles onder `apps/*` wordt
 * automatisch een workspace en zou wél mee gehoist worden.
 */
const config = getDefaultConfig(__dirname);

const websiteModules = path.resolve(__dirname, '..', 'node_modules');
const escaped = websiteModules.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
config.resolver.blockList = [new RegExp(`^${escaped}[/\\\\].*$`)];

module.exports = config;

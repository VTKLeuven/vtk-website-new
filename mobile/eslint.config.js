const expo = require('eslint-config-expo/flat');

/**
 * De React Compiler-regels, en waarom ze hier niet allemaal aan staan.
 *
 * `eslint-config-expo` zet sinds SDK 56 de regels van de React Compiler aan.
 * Dat is op zich winst, maar twee dingen kloppen niet zomaar voor deze app:
 *
 * - **`immutability` kent Reanimated niet.** `scale.value = withTiming(1)` in een
 *   `useCallback` is precies hoe een shared value hoort te werken, en de regel
 *   leest dat als het muteren van een waarde die aan een hook is doorgegeven.
 *   Eén zoomgebaar levert zo drieëntwintig fouten op. Die regel staat daarom uit
 *   en niet op `warn`: er is hier niets aan te doen.
 * - **De andere drie zijn wél signaal**, maar het zijn er een handvol in bestaande,
 *   werkende schermen. Ze staan op `warn` zodat ze zichtbaar blijven zonder de
 *   check te breken; ze opruimen is een eigen taak, geen bijzaak van een
 *   SDK-upgrade.
 */
module.exports = [
  ...expo,
  { ignores: ['dist/*', 'node_modules/*', '.expo/*'] },
  {
    rules: {
      'react-hooks/immutability': 'off',
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/refs': 'warn',
      'react-hooks/purity': 'warn',
    },
  },
];

/**
 * Licht of donker. De keuze staat als `data-theme` op <html>; het palet zelf
 * staat in app/design/theme.css.
 *
 * Het script hieronder loopt als gewone inline `<script>` bovenaan de <body>,
 * dus vóór de browser iets tekent. Zonder dat zie je bij elke paginalading
 * eerst een wit scherm: de server weet niet wat er in localStorage staat en de
 * eerste verf gebeurt lang voor React hydrateert.
 *
 * Staat er niets in localStorage, dan volgt de site het systeem, ook wanneer je
 * dat systeem tijdens het kijken omzet (de luisteraar onderaan). Pas wie zelf op
 * de knop duwt, legt een keuze vast; die blijft dan staan tot hij weer duwt.
 *
 * De MutationObserver onderaan zet het attribuut terug wanneer het verdwijnt.
 * Dat gebeurt echt: faalt de hydratie ergens op een pagina, dan tekent React de
 * hele boom opnieuw vanaf <html> en gooit het attribuut weg dat de server nooit
 * gerenderd heeft. Het scherm sprong dan midden in het kijken terug naar licht.
 * Hij grijpt enkel in als het attribuut wég is, dus hij vecht niet met de knop.
 */
export const THEME_STORAGE_KEY = 'vtk-logistiek-theme';

export type Theme = 'light' | 'dark';

export const THEME_SCRIPT = `(function(){var k=${JSON.stringify(THEME_STORAGE_KEY)},d=document.documentElement;function s(){try{return localStorage.getItem(k)}catch(e){return null}}function m(){try{return window.matchMedia('(prefers-color-scheme: dark)')}catch(e){return null}}function set(){var v=s(),q=m();d.setAttribute('data-theme',v==='dark'||(v!=='light'&&q&&q.matches)?'dark':'light')}set();var q=m();if(q&&q.addEventListener){q.addEventListener('change',function(){var v=s();if(v!=='dark'&&v!=='light')set()})}try{new MutationObserver(function(){if(!d.getAttribute('data-theme'))set()}).observe(d,{attributes:true,attributeFilter:['data-theme']})}catch(e){}})();`;

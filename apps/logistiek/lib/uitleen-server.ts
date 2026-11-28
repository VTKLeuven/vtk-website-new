/**
 * De queries van de uitleendienst, per domein in `lib/uitleen-server/` (T1 uit
 * de audit van november 2026). Dit bestand geeft ze enkel door, zodat wie
 * `@/lib/uitleen-server` importeert niets hoeft te weten van die indeling. Zet
 * hier geen code: een nieuwe query hoort in het bestand van haar domein.
 */
export * from './uitleen-server/catalogus';
export * from './uitleen-server/flesserke';
export * from './uitleen-server/aanvragen';
export * from './uitleen-server/vervoer';
export * from './uitleen-server/chauffeurs';
export * from './uitleen-server/posten';
export * from './uitleen-server/evenementen';
export * from './uitleen-server/instellingen';
export * from './uitleen-server/overzicht';
export * from './uitleen-server/shared';
export * from './uitleen-server/bijrijdshift';

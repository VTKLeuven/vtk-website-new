import type { LogistiekLocale } from './i18n-shared';

/**
 * De vaste teksten van de uitleendienst, in beide talen.
 *
 * Los van `lib/i18n.ts` zodat ook een clientcomponent ze kan importeren: dat
 * bestand leest de taalcookie via `next/headers`, en daarom stonden er in de
 * clientcomponenten ruim vierhonderd losse `en ? ... : ...`-ternaries naast dit
 * woordenboek (N3 uit de audit van november 2026). Nieuwe tekst komt in een
 * woordenboek: dit voor wat op meerdere schermen staat, een eigen `copy.ts`
 * naast de componenten voor wat bij één scherm hoort (zoals
 * `app/ritten/beschikbaarheid/copy.ts`). Een bestaande ternary verhuist mee
 * wanneer je het bestand aanraakt.
 */
export const copy = {
  nl: {
    navMaterial: 'Materiaal', navVan: 'Transport', navPlanning: 'Bezetting', navFlesserke: 'Flesserke', navReservations: 'Mijn aanvragen', navEvents: 'Mijn evenementen', navTrips: 'Mijn ritten', navManage: 'Beheer', themeToggle: 'Wissel tussen licht en donker', signIn: 'Inloggen', site: 'vtk.be', profileMainSite: 'Naar vtk.be',
    footerTitle: 'Uitleendienst van VTK Logistiek', footerLead: 'Voor materiaal, transport en een vlotte organisatie van je VTK-activiteit.', questions: 'Vragen?',
    loginKicker: 'VTK Logistiek', loginTitle: 'Uitleendienst', loginAction: 'Inloggen op vtk.be', loginLead: 'Log in met je VTK-account om materiaal of transport te reserveren.', homeMaterial: 'Materiaal lenen', homeMaterialLead: 'Van boormachines tot geluidsinstallaties: kies je materiaal en de periode, en dien je aanvraag in.', homeVan: 'Transport', homeVanLead: 'Iets groots te vervoeren? Boek de kar, auto of bakfiets met chauffeur.',
    pageMaterialTitle: 'Bestel', pageMaterialAccent: 'materiaal', materialPaymentNote: 'Je betaalt na goedkeuring. Je krijgt de waarborg terug wanneer al het materiaal in goede staat is teruggebracht.',
    pageVanTitle: 'Boek', pageVanAccent: 'transport', vanDriverInfo: 'Een vrijwilliger van Logistiek rijdt. Voorzie zelf 1 of 2 personen om te laden en lossen.', vanTimingInfo: 'Dien je aanvraag minstens twee weken vooraf in. VTK-activiteiten krijgen voorrang.', vanPaymentInfo: 'Na goedkeuring krijg je een chauffeur toegewezen en kun je betalen.',
    pageReservationsTitle: 'Mijn', pageReservationsAccent: 'aanvragen',
    pageTripsTitle: 'Mijn', pageTripsAccent: 'ritten',
    manageTitle: 'Beheer uitleendienst', collapseNav: 'Zijbalk inklappen', expandNav: 'Zijbalk uitklappen', collapseNavShortcut: '[ of Ctrl+B', noAccess: 'Geen toegang', appTitle: 'VTK Uitleendienst', appDescription: 'Materiaal lenen en transport reserveren bij VTK Logistiek.',
    externClosedTitle: 'Nog niet open voor externen', externClosedLead: 'De uitleendienst loopt dit semester eerst bij de posten en de werkgroepen van VTK. Hoor je bij geen van beide, dan kan je nog niets aanvragen.', externClosedAction: 'Mail logistiek@vtk.be met wat je nodig hebt en wanneer; dan regelt het team het verder.',
    toastLabels: { region: 'Meldingen', close: 'Sluiten' },
    loginDefault: 'Log in met je VTK-account om materiaal of transport te reserveren.', loginMaterial: 'Log in met je VTK-account om materiaal te reserveren.', loginItem: 'Log in om het materiaal te bekijken.', loginReservations: 'Log in om je aanvragen te bekijken.', loginReservation: 'Log in om je aanvraag te bekijken.', loginVan: 'Log in met je VTK-account om transport te reserveren.', loginTrip: 'Log in om je rit te bekijken.', loginTrips: 'Log in om de ritten te zien die aan jou toegewezen zijn.', loginFlesserke: 'Log in met je VTK-account om flesserke te reserveren.', loginManage: 'Log in om het beheer van de uitleendienst te openen.',
  },
  en: {
    navMaterial: 'Equipment', navVan: 'Transport', navPlanning: 'Occupancy', navFlesserke: 'Flesserke', navReservations: 'My requests', navEvents: 'My events', navTrips: 'My trips', navManage: 'Manage', themeToggle: 'Switch between light and dark', signIn: 'Sign in', site: 'vtk.be', profileMainSite: 'Go to vtk.be',
    footerTitle: 'Equipment service by VTK Logistics', footerLead: 'For equipment, transport and smooth organisation of your VTK activity.', questions: 'Questions?',
    loginKicker: 'VTK Logistics', loginTitle: 'Equipment service', loginAction: 'Sign in on vtk.be', loginLead: 'Sign in with your VTK account to reserve equipment or transport.', homeMaterial: 'Borrow equipment', homeMaterialLead: 'From drills to sound systems: choose your equipment and dates, then submit your request.', homeVan: 'Transport', homeVanLead: 'Need to move something large? Book the van, car or cargo bike with a driver.',
    pageMaterialTitle: 'Order', pageMaterialAccent: 'equipment', materialPaymentNote: 'You pay after approval. The deposit is returned when all equipment is returned in good condition.',
    pageVanTitle: 'Book', pageVanAccent: 'transport', vanDriverInfo: 'A Logistics volunteer drives. Provide 1 or 2 people to help load and unload.', vanTimingInfo: 'Submit your request at least two weeks in advance. VTK activities have priority.', vanPaymentInfo: 'After approval, a driver is assigned and you can pay.',
    pageReservationsTitle: 'My', pageReservationsAccent: 'requests',
    pageTripsTitle: 'My', pageTripsAccent: 'trips',
    manageTitle: 'Equipment service management', collapseNav: 'Collapse sidebar', expandNav: 'Expand sidebar', collapseNavShortcut: '[ or Ctrl+B', noAccess: 'Access denied', appTitle: 'VTK Equipment Service', appDescription: 'Borrow equipment and book the VTK van with Logistics.',
    externClosedTitle: 'Not open to external requests yet', externClosedLead: 'This semester the equipment service runs with the VTK posts and work groups first. If you belong to neither, you cannot request anything yet.', externClosedAction: 'Mail logistiek@vtk.be with what you need and when, and the team will take it from there.',
    toastLabels: { region: 'Notifications', close: 'Close' },
    loginDefault: 'Sign in with your VTK account to reserve equipment or transport.', loginMaterial: 'Sign in with your VTK account to reserve equipment.', loginItem: 'Sign in to view this item.', loginReservations: 'Sign in to view your requests.', loginReservation: 'Sign in to view your request.', loginVan: 'Sign in with your VTK account to reserve transport.', loginTrip: 'Sign in to view your trip.', loginTrips: 'Sign in to see the trips assigned to you.', loginFlesserke: 'Sign in with your VTK account to reserve flesserke.', loginManage: 'Sign in to open the equipment service management.',
  },
} as const;

export type LogistiekCopy = (typeof copy)[LogistiekLocale];

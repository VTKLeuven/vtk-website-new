import { cookies } from 'next/headers';
import { LOCALE_COOKIE, type LogistiekLocale } from './i18n-shared';

export { LOCALE_COOKIE, type LogistiekLocale } from './i18n-shared';

export async function getLocale(): Promise<LogistiekLocale> {
  const value = (await cookies()).get(LOCALE_COOKIE)?.value;
  return value === 'en' ? 'en' : 'nl';
}

export const copy = {
  nl: {
    navMaterial: 'Materiaal', navVan: 'Camionette', navReservations: 'Mijn reservaties', navManage: 'Beheer', signIn: 'Inloggen', site: 'vtk.be',
    footerTitle: 'Uitleendienst van VTK Logistiek', footerLead: 'Voor materiaal, vervoer en een vlotte organisatie van je VTK-activiteit.', questions: 'Vragen?',
    loginKicker: 'VTK Logistiek', loginTitle: 'Uitleendienst', loginAction: 'Inloggen op vtk.be',
    homeEyebrow: 'VTK Logistiek · Uitleendienst', homeTitle: 'Alles wat je nodig hebt,', homeAccent: 'geleend', homeLead: 'Reserveer materiaal of de camionette bij VTK Logistiek. Je vraagt aan, het team keurt goed, jij haalt af.', homeMaterial: 'Materiaal lenen', homeMaterialLead: 'Van boormachines tot geluidsinstallaties: kies je materiaal en de periode, en dien je aanvraag in.', homeMaterialCta: 'Bekijk de catalogus', homeVan: 'Camionette', homeVanLead: 'Iets groots te vervoeren? Boek de camionette met chauffeur voor 7,50 euro per uur.', homeVanCta: 'Vraag een rit aan', homeReservations: 'Mijn reservaties', homeReservationsLead: 'Volg de status van je aanvragen op, betaal online en bekijk wat je nog moet terugbrengen.', homeReservationsCta: 'Naar mijn reservaties', howItWorks: 'Zo werkt het', stepChoose: 'Kies wat je nodig hebt', stepRequest: 'Dien je aanvraag in', stepReturn: 'Haal op en breng terug', infoKicker: 'Goed geregeld', infoTitle: 'Van eerste aanvraag tot', infoAccent: 'terugbrengen', infoLead: 'De uitleendienst is er voor je activiteiten, projecten en vervoer. Vraag tijdig aan: Logistiek controleert beschikbaarheid en helpt je verder met de praktische afspraken.',
    pageMaterialTitle: 'Materiaal', pageMaterialAccent: 'lenen', pageMaterialLead: 'Kies je periode en je materiaal, en dien je aanvraag in. Het team van Logistiek keurt elke aanvraag goed; VTK-evenementen hebben voorrang op het materiaal, dus vraag ruim op voorhand aan.',
    pageVanTitle: 'De', pageVanAccent: 'camionette', pageVanLead: 'Iets groots te vervoeren? Boek de camionette van VTK. Een vrijwilliger van Logistiek rijdt; je rijdt dus nooit zelf, en je helpt zelf laden en lossen.',
    pageReservationsTitle: 'Mijn', pageReservationsAccent: 'reservaties',
    manageKicker: 'VTK Logistiek', manageTitle: 'Beheer uitleendienst', noAccess: 'Geen toegang', appTitle: 'VTK Uitleendienst', appDescription: 'Materiaal lenen en de camionette reserveren bij VTK Logistiek.',
  },
  en: {
    navMaterial: 'Equipment', navVan: 'Van', navReservations: 'My reservations', navManage: 'Manage', signIn: 'Sign in', site: 'vtk.be',
    footerTitle: 'Equipment service by VTK Logistics', footerLead: 'For equipment, transport and smooth organisation of your VTK activity.', questions: 'Questions?',
    loginKicker: 'VTK Logistics', loginTitle: 'Equipment service', loginAction: 'Sign in on vtk.be',
    homeEyebrow: 'VTK Logistics · Equipment service', homeTitle: 'Everything you need,', homeAccent: 'on loan', homeLead: 'Book equipment or the VTK van. Submit your request, let the team approve it, and collect it when ready.', homeMaterial: 'Borrow equipment', homeMaterialLead: 'From drills to sound systems: choose your equipment and dates, then submit your request.', homeMaterialCta: 'Browse the catalogue', homeVan: 'The van', homeVanLead: 'Need to move something large? Book the van with a driver for €7.50 per hour.', homeVanCta: 'Request a trip', homeReservations: 'My reservations', homeReservationsLead: 'Track your requests, pay online and see what still needs to be returned.', homeReservationsCta: 'View my reservations', howItWorks: 'How it works', stepChoose: 'Choose what you need', stepRequest: 'Submit your request', stepReturn: 'Collect and return it', infoKicker: 'Well organised', infoTitle: 'From first request to', infoAccent: 'returning it', infoLead: 'The equipment service is here for your activities, projects and transport. Request in good time: Logistics checks availability and helps with the practical details.',
    pageMaterialTitle: 'Borrow', pageMaterialAccent: 'equipment', pageMaterialLead: 'Choose your dates and equipment, then submit your request. The Logistics team approves every request; VTK events have priority, so request well in advance.',
    pageVanTitle: 'The', pageVanAccent: 'van', pageVanLead: 'Need to move something large? Book the VTK van. A Logistics volunteer drives, so you never drive yourself; you help load and unload.',
    pageReservationsTitle: 'My', pageReservationsAccent: 'reservations',
    manageKicker: 'VTK Logistics', manageTitle: 'Equipment service management', noAccess: 'Access denied', appTitle: 'VTK Equipment Service', appDescription: 'Borrow equipment and book the VTK van with Logistics.',
  },
} as const;

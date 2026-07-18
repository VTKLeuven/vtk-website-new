import { cookies } from 'next/headers';
import { LOCALE_COOKIE, type LogistiekLocale } from './i18n-shared';

export { LOCALE_COOKIE, type LogistiekLocale } from './i18n-shared';

export async function getLocale(): Promise<LogistiekLocale> {
  const value = (await cookies()).get(LOCALE_COOKIE)?.value;
  return value === 'en' ? 'en' : 'nl';
}

export const copy = {
  nl: {
    navMaterial: 'Materiaal', navVan: 'Camionette', navReservations: 'Mijn aanvragen', navManage: 'Beheer', signIn: 'Inloggen', site: 'vtk.be', profileMainSite: 'Naar vtk.be',
    footerTitle: 'VTK Logistiek', footerLead: 'Reserveer materiaal of vraag een rit met de VTK-camionette aan.', questions: 'Vragen?',
    loginKicker: 'VTK Logistiek', loginTitle: 'Uitleendienst', loginAction: 'Inloggen op vtk.be', loginLead: 'Log in met je VTK-account om materiaal te reserveren of een rit aan te vragen.',
    homeEyebrow: 'VTK Logistiek', homeTitle: 'Uitleendienst', homeLead: 'Reserveer materiaal of vraag een rit met de VTK-camionette aan. Logistiek controleert elke aanvraag.', homeMaterial: 'Materiaal', homeMaterialLead: 'Kies een afhaal- en terugbrengdatum, selecteer het materiaal en dien je aanvraag in.', homeMaterialCta: 'Materiaal bekijken', homeVan: 'Camionette', homeVanLead: 'Vraag een rit met chauffeur aan. De prijs is € 7,50 per begonnen uur.', homeVanCta: 'Rit aanvragen', homeReservations: 'Mijn aanvragen', homeReservationsLead: 'Bekijk de status van je aanvragen, betaal online en controleer de afgesproken data.', homeReservationsCta: 'Aanvragen bekijken', howItWorks: 'Hoe werkt het?', stepChoose: 'Kies materiaal of een rit', stepRequest: 'Vul de gegevens in en dien je aanvraag in', stepReturn: 'Logistiek controleert je aanvraag', infoKicker: 'Belangrijk', infoTitle: 'Je aanvraag is pas definitief na goedkeuring', infoLead: 'Logistiek controleert de beschikbaarheid en praktische afspraken. VTK-activiteiten krijgen voorrang, dus dien je aanvraag zo vroeg mogelijk in.',
    pageMaterialTitle: 'Materiaal reserveren', pageMaterialLead: 'Kies de afhaal- en terugbrengdatum en selecteer het gewenste materiaal. Logistiek controleert de beschikbaarheid voor je aanvraag wordt goedgekeurd.', materialPaymentNote: 'Je betaalt na goedkeuring. Je krijgt de waarborg terug wanneer al het materiaal in goede staat is teruggebracht.',
    pageVanTitle: 'Camionette aanvragen', pageVanLead: 'Een vrijwilliger van Logistiek bestuurt de camionette. Vul het tijdstip, het traject en het doel van de rit in.', vanDriverInfo: 'Een vrijwilliger van Logistiek rijdt. Voorzie zelf 1 of 2 personen om te laden en lossen.', vanTimingInfo: 'Dien je aanvraag minstens twee weken vooraf in. VTK-activiteiten krijgen voorrang.', vanPaymentInfo: 'Na goedkeuring krijg je een chauffeur toegewezen en kun je betalen.',
    pageReservationsTitle: 'Mijn aanvragen',
    manageKicker: 'VTK Logistiek', manageTitle: 'Beheer uitleendienst', noAccess: 'Geen toegang', appTitle: 'VTK Uitleendienst', appDescription: 'Materiaal lenen en de camionette reserveren bij VTK Logistiek.',
  },
  en: {
    navMaterial: 'Equipment', navVan: 'Van', navReservations: 'My requests', navManage: 'Manage', signIn: 'Sign in', site: 'vtk.be', profileMainSite: 'Go to vtk.be',
    footerTitle: 'VTK Logistics', footerLead: 'Reserve equipment or request a trip with the VTK van.', questions: 'Questions?',
    loginKicker: 'VTK Logistics', loginTitle: 'Equipment service', loginAction: 'Sign in on vtk.be', loginLead: 'Sign in with your VTK account to reserve equipment or request a trip.',
    homeEyebrow: 'VTK Logistics', homeTitle: 'Equipment service', homeLead: 'Reserve equipment or request a trip with the VTK van. Logistics reviews every request.', homeMaterial: 'Equipment', homeMaterialLead: 'Choose collection and return dates, select the equipment and submit your request.', homeMaterialCta: 'View equipment', homeVan: 'Van', homeVanLead: 'Request a trip with a driver. The price is €7.50 per started hour.', homeVanCta: 'Request a trip', homeReservations: 'My requests', homeReservationsLead: 'Check the status of your requests, pay online and review the agreed dates.', homeReservationsCta: 'View requests', howItWorks: 'How does it work?', stepChoose: 'Choose equipment or a trip', stepRequest: 'Enter the details and submit your request', stepReturn: 'Logistics reviews your request', infoKicker: 'Important', infoTitle: 'Your request is only final after approval', infoLead: 'Logistics checks availability and the practical arrangements. VTK activities have priority, so submit your request as early as possible.',
    pageMaterialTitle: 'Reserve equipment', pageMaterialLead: 'Choose the collection and return dates and select the equipment. Logistics checks availability before approving your request.', materialPaymentNote: 'You pay after approval. The deposit is returned when all equipment is returned in good condition.',
    pageVanTitle: 'Request the van', pageVanLead: 'A Logistics volunteer drives the van. Enter the time, route and purpose of the trip.', vanDriverInfo: 'A Logistics volunteer drives. Provide 1 or 2 people to help load and unload.', vanTimingInfo: 'Submit your request at least two weeks in advance. VTK activities have priority.', vanPaymentInfo: 'After approval, a driver is assigned and you can pay.',
    pageReservationsTitle: 'My requests',
    manageKicker: 'VTK Logistics', manageTitle: 'Equipment service management', noAccess: 'Access denied', appTitle: 'VTK Equipment Service', appDescription: 'Borrow equipment and book the VTK van with Logistics.',
  },
} as const;

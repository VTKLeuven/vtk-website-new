import { Redirect } from 'expo-router';

/**
 * Het oude adres van "mijn tickets", dat nu een segment van de Tickets-tab is.
 * Zie `bestellen.tsx` ernaast voor waarom deze omleiding er staat.
 */
export default function MijnTicketsRedirect() {
  return <Redirect href="/tickets?tab=mijne" />;
}

// Gemaakt door scripts/genereer-routes.mjs. Pas src/navigation.ts aan.

import { Redirect, useLocalSearchParams } from 'expo-router';

export default function OudAdres() {
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  return <Redirect href={`/tickets/scan/${eventId}`} />;
}

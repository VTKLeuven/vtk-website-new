// Gemaakt door scripts/genereer-routes.mjs. Pas src/navigation.ts aan.

import { Redirect, useLocalSearchParams } from 'expo-router';

export default function OudAdres() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <Redirect href={`/studeren/studiegroep/${id}`} />;
}

// Gemaakt door scripts/genereer-routes.mjs. Pas src/navigation.ts aan.

import { Redirect, useLocalSearchParams } from 'expo-router';

export default function OudAdres() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  return <Redirect href={`/meer/album/${slug}`} />;
}

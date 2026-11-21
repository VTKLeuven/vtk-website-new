import { RouteSkeleton } from '@/components/route-skeleton';

/** De zijbalk blijft staan; enkel de inhoudskolom wacht (R2). */
export default function BeheerLoading() {
  return <RouteSkeleton variant="admin" />;
}

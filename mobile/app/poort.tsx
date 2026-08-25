import { useLocalSearchParams, useRouter } from 'expo-router';

import { WebFlow } from '../src/components/WebFlow';
import { gateUrl, isGateDoneUrl } from '../src/auth/session';
import { useApp } from '../src/state/app';

/**
 * Onboarding of studiebevestiging afwerken.
 *
 * Deze twee schermen staan op de website en worden daar door `proxy.ts`
 * afgedwongen. Ze zijn eenmalig (onboarding) of jaarlijks (de studie), ze hangen
 * aan de mailinglijsten en aan de cursusdienst, en ze nabouwen in de app zou
 * betekenen dat de regels op twee plaatsen leven. Vandaar de WebView.
 */
export default function GateScreen() {
  const router = useRouter();
  const { refresh } = useApp();
  const params = useLocalSearchParams<{ gate?: string }>();
  const gate = params.gate === 'studie-bevestigen' ? 'studie-bevestigen' : 'onboarding';

  return (
    <WebFlow
      url={gateUrl(gate)}
      title={gate === 'onboarding' ? 'Profiel afwerken' : 'Studie bevestigen'}
      isDone={(url) => isGateDoneUrl(url, gate)}
      onDone={() => {
        void refresh();
        router.back();
      }}
    />
  );
}

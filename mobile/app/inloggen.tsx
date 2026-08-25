import { useRouter } from 'expo-router';

import { WebFlow } from '../src/components/WebFlow';
import { isLoginDoneUrl, loginUrl } from '../src/auth/session';
import { useApp } from '../src/state/app';

/**
 * Inloggen met de gewone weblogin.
 *
 * Zodra de WebView op een pagina van ons landt, staat het sessiecookie in de
 * cookie-opslag van het toestel en deelt `fetch` die. We halen daarna meteen
 * `bootstrap` opnieuw op: dat is de enige manier om zeker te weten dat het cookie
 * er ook echt doorkomt (op iOS is de overdracht van de WebView naar
 * `NSHTTPCookieStorage` niet gegarandeerd), en het vertelt ons ineens of er nog
 * een poort openstaat.
 */
export default function LoginScreen() {
  const router = useRouter();
  const { refresh } = useApp();

  return (
    <WebFlow
      url={loginUrl()}
      title="Inloggen"
      isDone={isLoginDoneUrl}
      onDone={() => {
        void refresh();
        router.back();
      }}
    />
  );
}

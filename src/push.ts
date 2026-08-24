import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { registerPushToken, unregisterPushToken } from './api/bootstrap';
import { getPref, setPref, clearPref } from './storage';

/**
 * Pushberichten aan- en afzetten.
 *
 * **Toestemming wordt niet bij de eerste start gevraagd.** Dat is de belangrijkste
 * keuze in dit bestand. Een systeemvenster dat meteen na het installeren
 * verschijnt, wordt in de regel weggeklikt, en op iOS krijg je maar één kans: wie
 * één keer weigert, moet daarna naar de systeeminstellingen. Dus vragen we het
 * op het moment dat het ergens over gaat, en met een zin erbij die zegt waarover.
 *
 * Het token wordt bij elke start opnieuw aangemeld, want het besturingssysteem
 * kan het vervangen zonder dat de app dat merkt.
 */

const ASKED_KEY = 'push-asked';
const TOKEN_KEY = 'push-token';

/** Hoe een binnengekomen bericht zich gedraagt terwijl de app openstaat. */
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

/** Heeft de gebruiker hier al ooit iets over beslist? */
export function hasBeenAsked(): boolean {
  return getPref(ASKED_KEY) === 'yes';
}

export function pushIsOn(): boolean {
  return Boolean(getPref(TOKEN_KEY));
}

/**
 * Vraagt toestemming en meldt het token aan.
 *
 * Geeft `false` terug wanneer de gebruiker weigert of wanneer het toestel geen
 * pushberichten kan krijgen (een simulator, bijvoorbeeld). De beller hoort dat
 * rustig te melden en niet opnieuw te vragen; `hasBeenAsked()` onthoudt dat we
 * het gevraagd hebben.
 */
export async function enablePush(): Promise<boolean> {
  setPref(ASKED_KEY, 'yes');

  const existing = await Notifications.getPermissionsAsync();
  const granted =
    existing.granted || (await Notifications.requestPermissionsAsync()).granted;
  if (!granted) return false;

  // Op Android moet er een kanaal bestaan, anders komt een bericht wel binnen
  // maar zonder geluid of belang.
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'VTK',
      importance: Notifications.AndroidImportance.DEFAULT,
      lightColor: '#FFD23F',
    });
  }

  const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
  if (!projectId) {
    console.warn('Geen EAS-projectId; een pushtoken vragen heeft dan geen zin.');
    return false;
  }

  try {
    const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
    await registerPushToken({
      token,
      platform: Platform.OS === 'ios' ? 'ios' : 'android',
      appVersion: Constants.expoConfig?.version,
    });
    setPref(TOKEN_KEY, token);
    return true;
  } catch (error) {
    // Geen netwerk of geen pushdienst: dan staat het gewoon niet aan, en dat
    // hoeft de gebruiker niet als een fout te zien.
    console.warn('Pushtoken registreren mislukte', error);
    return false;
  }
}

/** Zet pushberichten uit op de server; het toestel houdt zijn toestemming. */
export async function disablePush(): Promise<void> {
  const token = getPref(TOKEN_KEY);
  if (!token) return;
  try {
    await unregisterPushToken(token);
  } catch {
    // Al weg of geen netwerk; het token verdwijnt hier hoe dan ook, en de server
    // ruimt het op zodra Expo het afkeurt.
  }
  clearPref(TOKEN_KEY);
}

/**
 * Meldt een bestaand token opnieuw aan bij de start.
 *
 * Doet niets wanneer push nooit aangezet is; dit is uitdrukkelijk geen sluipweg
 * om het alsnog te vragen.
 */
export async function refreshPushRegistration(): Promise<void> {
  if (!pushIsOn()) return;
  await enablePush();
}

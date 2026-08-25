import { Directory, File, Paths } from 'expo-file-system';
import * as MediaLibrary from 'expo-media-library';
import * as Sharing from 'expo-sharing';

/**
 * Een foto bewaren op het toestel.
 *
 * Twee wegen, en dat is met opzet.
 *
 * **Bewaren** zet de foto in de fotobibliotheek van de telefoon, waar iemand hem
 * verwacht. Dat vraagt toestemming, en die toestemming vraag je pas op het moment
 * dat iemand op de knop drukt; een venster bij het openen van een album zou
 * weggeklikt worden en op iOS krijg je maar één kans.
 *
 * **Delen** opent het deelvenster van het systeem. Dat is de uitweg voor wie geen
 * toegang tot zijn fotobibliotheek wil geven, en meteen ook de manier om een foto
 * door te sturen zonder hem eerst te bewaren.
 *
 * Allebei halen ze het **origineel** op en niet wat er op het scherm staat: wat je
 * toont mag klein zijn, wat je bewaart hoort de volle resolutie te zijn.
 */

export type SaveOutcome =
  | { status: 'bewaard' }
  | { status: 'gedeeld' }
  | { status: 'geweigerd' }
  | { status: 'mislukt'; reason: string };

/** De map waar we tijdelijk naartoe downloaden voor het naar de bibliotheek gaat. */
function downloadDir(): Directory {
  const dir = new Directory(Paths.cache, 'fotos');
  if (!dir.exists) dir.create({ intermediates: true });
  return dir;
}

/**
 * Haalt het origineel op naar een tijdelijk bestand.
 *
 * De bestandsnaam wordt geschoond: die komt uit Immich en dus uiteindelijk uit
 * wat een camera of een uploader erop gezet heeft. Een schuine streep erin zou
 * een pad worden in plaats van een naam.
 */
async function fetchOriginal(url: string, filename: string): Promise<File> {
  const safe = filename.replace(/[^\w.-]+/g, '_').slice(-120) || 'foto.jpg';
  const target = new File(downloadDir(), safe);
  if (target.exists) target.delete();

  // De statische `downloadFileAsync` geeft zijn eigen `File`-vorm terug, die niet
  // gelijk is aan de klasse die we hier gebruiken. Het bestand komt hoe dan ook
  // op `target` terecht, dus die geven we door.
  await File.downloadFileAsync(url, target);
  return target;
}

/** Ruimt het tijdelijke bestand op. Mislukt dat, dan is dat geen fout om te melden. */
function cleanUp(file: File): void {
  try {
    if (file.exists) file.delete();
  } catch {
    // De cache mag de cache opruimen.
  }
}

/**
 * Bewaart één foto in de fotobibliotheek.
 *
 * Vraagt enkel schrijfrechten (`writeOnly`), niet het recht om de hele
 * bibliotheek te lezen. We willen er iets bij zetten, niet erin kijken, en dat
 * scheelt een pak in wat het systeemvenster vraagt.
 */
export async function savePhotoToLibrary(
  url: string,
  filename: string,
): Promise<SaveOutcome> {
  let file: File | null = null;
  try {
    // Ook het vragen van toestemming zit in de try, en niet enkel het downloaden.
    // `expo-media-library` is een native module: draait de app in een build van
    // vóór deze functie bestond, dan gooit de eerste aanroep al. Dat hoort een
    // nette melding te geven en geen crash; zie `describe` onderaan.
    let permission = await MediaLibrary.getPermissionsAsync(true);
    if (!permission.granted && permission.canAskAgain) {
      permission = await MediaLibrary.requestPermissionsAsync(true);
    }
    if (!permission.granted) return { status: 'geweigerd' };

    file = await fetchOriginal(url, filename);
    await MediaLibrary.saveToLibraryAsync(file.uri);
    return { status: 'bewaard' };
  } catch (error) {
    return { status: 'mislukt', reason: describe(error) };
  } finally {
    if (file) cleanUp(file);
  }
}

/** Opent het deelvenster met de foto erin. */
export async function sharePhoto(url: string, filename: string): Promise<SaveOutcome> {
  if (!(await Sharing.isAvailableAsync())) {
    return { status: 'mislukt', reason: 'Delen kan niet op dit toestel.' };
  }

  try {
    const file = await fetchOriginal(url, filename);
    await Sharing.shareAsync(file.uri);
    return { status: 'gedeeld' };
  } catch (error) {
    return { status: 'mislukt', reason: describe(error) };
  }

  // Bewust géén opruiming hier. Op Android kan de app waarmee je deelt het
  // bestand nog nodig hebben nadat het deelvenster gesloten is; wegnemen levert
  // dan een lege bijlage op. Het staat in de cache, en die ruimt het systeem op.
}

/**
 * De zin bij een mislukking.
 *
 * Het geval dat apart benoemd wordt, is een app die deze functie nog niet in zich
 * heeft. `expo-media-library` en `expo-sharing` zijn native modules, en die gaan
 * niet mee met een update over de lucht: wie een oudere build heeft, moet de app
 * echt opnieuw installeren. "Er ging iets mis" zou daar niemand verder helpen.
 */
function describe(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error ?? '');
  if (/native module|doesn't exist|not available|ExpoMediaLibrary|ExpoSharing/i.test(message)) {
    return 'Deze versie van de app kan nog geen fotos bewaren. Installeer de nieuwste versie.';
  }
  return message || 'Onbekende fout';
}

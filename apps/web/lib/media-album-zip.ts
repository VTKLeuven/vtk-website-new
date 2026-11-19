import { sanitizeFilename } from "@vtk/gallery";

/**
 * Wat er in de zip van een album komt te staan, en onder welke naam.
 *
 * Een pure functie zonder Immich of databank: de route geeft de onderdelen van
 * `loadLibraryAlbum` door en krijgt de bestanden terug in de volgorde waarin ze
 * in het archief moeten. Geen `server-only` hier, zodat een test het kan laden.
 */

type ZipPhoto = { id: string; filename: string; video: boolean };
type ZipPart = { name: string; photos: ZipPhoto[] };

export type AlbumZipEntry = { assetId: string; name: string };

/**
 * Een bestands- of mapnaam die veilig in een zip past. `sanitizeFilename` haalt
 * paden en verboden tekens weg; een naam die enkel uit punten bestaat (`..`)
 * laat het door, en dat is bij het uitpakken een pad omhoog.
 */
function cleanName(raw: string, fallback: string): string {
  const name = sanitizeFilename(raw, fallback);
  return /^\.+$/.test(name) ? fallback : name;
}

/**
 * Een naam die iemand zelf koos (de titel van het album, de naam van een tab):
 * een schuine streep daarin wordt een streepje. Anders hield `sanitizeFilename`
 * enkel het deel na de streep over, en werd "Cantus najaar/2026" gewoon "2026".
 */
function chosenName(raw: string, fallback: string): string {
  return cleanName(raw.replace(/[\\/]/g, "-"), fallback);
}

/** `foto.jpg` wordt `foto (2).jpg`, tot de naam vrij is. Hoofdletters tellen niet mee. */
function uniqueName(name: string, taken: Set<string>): string {
  const dot = name.lastIndexOf(".");
  const [stem, extension] = dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, ""];
  let candidate = name;
  for (let copy = 2; taken.has(candidate.toLowerCase()); copy += 1) {
    candidate = `${stem} (${copy})${extension}`;
  }
  taken.add(candidate.toLowerCase());
  return candidate;
}

/**
 * Alle foto's van het album, per tab in een eigen map zodra er meer dan één tab
 * is. Ook de verborgen foto's: Communicatie wil het hele album kunnen doorgeven,
 * en `loadLibraryAlbum` zet die al achter de zichtbare foto's van hun tab. De
 * route geeft er eerst hun echte naam aan (`withHiddenPhotoDetails`).
 *
 * Twee foto's met dezelfde naam (`IMG_0001.jpg` van twee camera's) krijgen elk
 * hun eigen naam; anders overschrijft de tweede de eerste bij het uitpakken.
 */
export function albumZipEntries(parts: ZipPart[]): AlbumZipEntry[] {
  const withFolders = parts.length > 1;
  const folders = new Set<string>();
  const entries: AlbumZipEntry[] = [];
  let position = 0;

  for (const part of parts) {
    const folder = withFolders ? uniqueName(chosenName(part.name, "tab"), folders) : "";
    const taken = new Set<string>();
    for (const photo of part.photos) {
      position += 1;
      const fallback = `foto-${String(position).padStart(4, "0")}${photo.video ? ".mp4" : ".jpg"}`;
      const name = uniqueName(cleanName(photo.filename, fallback), taken);
      entries.push({ assetId: photo.id, name: folder ? `${folder}/${name}` : name });
    }
  }

  return entries;
}

/** De naam van het zipbestand: de titel van het album. */
export function albumZipFilename(title: string): string {
  return `${chosenName(title, "album")}.zip`;
}

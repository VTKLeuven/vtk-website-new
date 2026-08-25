import { Redirect } from 'expo-router';

/**
 * Het oude adres van de broodjes.
 *
 * De tab heet nu `/broodjes`, maar een pushbericht dat vorige week vertrok draagt
 * nog `/bestellen`, en het CMS kan er ook nog naar wijzen. Een geïnstalleerde app
 * kan bovendien maanden achterlopen op de server. Dit is één regel om te
 * voorkomen dat zo'n tik op een leeg scherm eindigt.
 */
export default function BestellenRedirect() {
  return <Redirect href="/broodjes" />;
}

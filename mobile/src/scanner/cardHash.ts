import * as Crypto from 'expo-crypto';

/**
 * Het formaat waarin een studentenkaart in het offline-manifest staat.
 *
 * Moet letterlijk gelijk blijven aan `apps/web/lib/ticketing/cardHash.ts` in
 * vtk-website-new: de server bouwt de tabel, dit toestel zoekt erin, en de twee
 * hashen dezelfde string. Wijzigt daar het formaat, dan vindt de app offline
 * geen enkele kaart meer; dat faalt stil.
 */

/** De string die aan beide kanten gehasht wordt. */
export function cardHashInput(salt: string, card: string): string {
  return `${salt}:${card.replace(/[\r\n]+/g, '').trim().toLowerCase()}`;
}

/** Hoeveel hex-tekens van de sha256 in het manifest gaan. */
export const CARD_HASH_LENGTH = 32;

export async function cardHash(salt: string, card: string): Promise<string> {
  const digest = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    cardHashInput(salt, card),
    { encoding: Crypto.CryptoEncoding.HEX },
  );
  return digest.slice(0, CARD_HASH_LENGTH);
}

/** Een kaartlezer tikt `serial;cardAppId`; een ticketcode heeft nooit een puntkomma. */
export function looksLikeCard(value: string): boolean {
  return value.includes(';');
}

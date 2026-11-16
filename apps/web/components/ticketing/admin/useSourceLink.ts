'use client';

import { useState } from 'react';
import { CAMPAIGN_PARAM, SHAREABLE_SOURCES, SOURCE_PARAM, sanitizeSourceKey } from '@/lib/ticketing/source';

/** De waarde van de kanaalkeuze voor "iets anders": dan telt het vrije veld. */
export const OTHER_SOURCE = '__other';

/**
 * De toestand van een linkbouwer met herkomst (`?via=mail&c=story`): het
 * gekozen kanaal, een eigen kanaal, de campagne en de link die daaruit volgt.
 * Eén keer, zodat de linkbouwer van de tickets en die van het bureau dezelfde
 * sleutels maken; enkel hun opmaak verschilt.
 *
 * @param base de link zonder herkomst, met origin (`https://vtk.be/bureau/x`)
 * @param initialChannel het kanaal waarmee de keuze opent; `""` is een link
 *   zonder herkomst, zodat wie meteen kopieert geen kanaal meegeeft dat hij
 *   niet koos.
 */
export function useSourceLink(base: string, initialChannel: string = SHAREABLE_SOURCES[0]) {
  const [channel, setChannel] = useState<string>(initialChannel);
  const [custom, setCustom] = useState('');
  const [campaign, setCampaign] = useState('');
  // De link die gekopieerd werd; verandert de link, dan staat er geen vinkje meer.
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);

  const source = channel === OTHER_SOURCE ? sanitizeSourceKey(custom) : channel;
  const campaignKey = sanitizeSourceKey(campaign);
  const params = new URLSearchParams();
  if (source) params.set(SOURCE_PARAM, source);
  if (source && campaignKey) params.set(CAMPAIGN_PARAM, campaignKey);
  const query = params.toString();
  const url = `${base}${query ? `${base.includes('?') ? '&' : '?'}${query}` : ''}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedUrl(url);
    } catch {
      /* geen klembord: de link staat leesbaar in het veld */
    }
  }

  return {
    channel,
    setChannel,
    custom,
    setCustom,
    campaign,
    setCampaign,
    url,
    copied: copiedUrl === url,
    copy,
  };
}

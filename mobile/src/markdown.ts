/**
 * Markdown naar platte tekst.
 *
 * Voor de plekken waar opmaak niet past: de notitie bij een agenda-afspraak, een
 * korte samenvatting in een lijst. Bewust een kleine, domme vertaling en geen
 * parser: wat hier uit komt hoeft niet perfect te zijn, het hoeft enkel leesbaar
 * te zijn zonder sterretjes en haakjes.
 *
 * Dezelfde bedoeling als `markdownToPlainText` in `apps/web/lib/markdown.ts`,
 * maar geen kopie: die kant leunt op de remark-keten die daar toch al draait, en
 * die hierheen halen zou een dependency zijn voor twintig regels tekst.
 */
export function markdownToPlainText(markdown: string): string {
  return (
    markdown
      // Codeblokken en inline code: hou de inhoud, gooi de backticks weg.
      .replace(/```[a-z]*\n([\s\S]*?)```/gi, '$1')
      .replace(/`([^`]+)`/g, '$1')
      // Afbeeldingen verdwijnen, links houden hun tekst.
      .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      // Koppen, citaten en lijstbolletjes vooraan een regel.
      .replace(/^#{1,6}\s+/gm, '')
      .replace(/^\s{0,3}>\s?/gm, '')
      .replace(/^\s*[-*+]\s+/gm, '')
      .replace(/^\s*\d+\.\s+/gm, '')
      // Nadruk. De volgorde telt: eerst de dubbele, anders blijft er een los
      // sterretje staan.
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/__([^_]+)__/g, '$1')
      .replace(/\*([^*]+)\*/g, '$1')
      .replace(/_([^_]+)_/g, '$1')
      // Horizontale lijnen.
      .replace(/^\s*([-*_])\1{2,}\s*$/gm, '')
      // Drie of meer lege regels worden er één.
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  );
}

/**
 * Een `content-disposition`-header voor een bestandsnaam zoals een gebruiker
 * die koos.
 *
 * Een header mag enkel tekens tot 0xFF dragen. Een gedachtestreepje, een
 * gekrulde apostrof of een emoji in `filename="..."` laat `Headers.set` gooien,
 * en dan kreeg wie het bestand opende een 404. Het oude `filename` krijgt daarom
 * een ASCII-versie; de echte naam reist mee in `filename*` (RFC 6266), die elke
 * browser verkiest.
 */
export function contentDisposition(
  type: "inline" | "attachment",
  filename: string,
): string {
  const ascii = filename.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  // encodeURIComponent laat ' ( ) * staan, maar in `filename*` horen ze gecodeerd.
  const encoded = encodeURIComponent(filename).replace(
    /['()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `${type}; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

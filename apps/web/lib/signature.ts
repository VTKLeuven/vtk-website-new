/**
 * E-mailhandtekening generator voor VTK-leden en praesidium.
 *
 * Genereert de officiële HTML-handtekening volgens de VTK-huisstijl
 * (blauw schild, gele scheidingsstreep, adres en contactgegevens)
 * voor gebruik in Gmail, Outlook, Apple Mail etc.
 */

export type SignatureData = {
  fullName: string;
  roleTitle: string;
  emailAddress: string;
  phoneDisplay: string;
  shieldImageUrl?: string;
  siteUrl?: string;
};

export const DEFAULT_SHIELD_IMAGE_URL = 'https://www.vtk.be/_site/img/schild_blauw.png';
export const DEFAULT_SITE_URL = 'https://www.vtk.be';
export const DEFAULT_MAPS_URL = 'https://www.google.com/maps?q=Studentenwijk+Arenberg+6&entry=gmail&source=g';

/**
 * Escapet gevaarlijke HTML-tekens in door de gebruiker ingegeven velden.
 */
export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Filtert telefoonnummers voor `tel:` URI's (enkel cijfers en eventuele leidende +).
 */
export function sanitizePhoneForTel(phone: string): string {
  return phone.replace(/[^\d+]/g, '');
}

/**
 * Berekent een standaard VTK-e-mailadres op basis van voor- en achternaam of bestaand account-adres.
 */
export function buildDefaultVtkEmail(
  firstName?: string | null,
  lastName?: string | null,
  currentEmail?: string | null,
): string {
  if (currentEmail && currentEmail.toLowerCase().endsWith('@vtk.be')) {
    return currentEmail.toLowerCase();
  }

  const cleanPart = (s?: string | null) =>
    (s ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim()
      .replace(/\s+/g, '')
      .replace(/[^a-z0-9]/g, '');

  const f = cleanPart(firstName);
  const l = cleanPart(lastName);

  if (f && l) return `${f}.${l}@vtk.be`;
  if (f) return `${f}@vtk.be`;
  if (l) return `${l}@vtk.be`;
  return 'info@vtk.be';
}

/**
 * Genereert de volledige HTML-tabel voor de e-mailhandtekening.
 * Matcht exact de structuur en stijlen van de klassieke VTK-handtekeningtemplate.
 */
export function generateSignatureHtml(data: SignatureData): string {
  const shieldUrl = data.shieldImageUrl || DEFAULT_SHIELD_IMAGE_URL;
  const siteUrl = data.siteUrl || DEFAULT_SITE_URL;
  const fullName = escapeHtml(data.fullName.trim().toUpperCase());
  const roleTitle = escapeHtml(data.roleTitle.trim());
  const email = escapeHtml(data.emailAddress.trim().toLowerCase());
  const phone = escapeHtml(data.phoneDisplay.trim());
  const phoneTel = escapeHtml(sanitizePhoneForTel(data.phoneDisplay));

  return `<table>
    <tr>
        <td style="border-right: solid 7px #eed610; vertical-align: top; padding-top: 0px">
            <a href="${siteUrl}">
                <img width="auto" height="140"
                     src="${shieldUrl}"
                     alt="VTK Schild"/></a>
        </td>
        <td style="padding-top: 6px;">
            <table style="margin-left: 10px;">
                <tr>
                    <td colspan="2"
                        style="padding-bottom: 0px; text-transform: uppercase; font-family: 'Droid Sans', Verdana, Arial , sans-serif; font-size: 12pt;">
                        <strong>${fullName}</strong>
                    </td>
                </tr>
                <tr>
                    <td colspan="2" style="font-family: 'Century Gothic', Verdana, Arial , sans-serif; font-size: 9pt;">
                        <strong>${roleTitle}</strong>
                    </td>
                </tr>
                <tr>
                    <td style="font-family: 'Century Gothic', Verdana, Arial , sans-serif; font-size: 7pt;">
                        Vlaamse Technische Kring vzw | RPR Leuven
                    </td>
                </tr>
                <tr>
                    <td colspan="2" style="font-family: 'Century Gothic', Verdana, Arial , sans-serif; font-size: 7pt;">
                        A:
                        <a href="${DEFAULT_MAPS_URL}"
                           target="_blank"
                           style="text-decoration: none; color: #1f2449; font-family: 'Century Gothic', Verdana, Arial , sans-serif; font-size: 7pt;">
                            Studentenwijk Arenberg 6/1, 3001 Heverlee</a>
                    </td>
                </tr>
                <tr>
                    <td colspan="2" style="font-family: 'Century Gothic', Verdana, Arial , sans-serif; font-size: 7pt;">
                        E:
                        <a id="emailVTK"
                           href="mailto:${email}"
                           style="text-transform: lowercase; text-decoration: none; color: #1f2449; font-family: 'Century Gothic', Verdana, Arial , sans-serif; font-size: 7pt;">
                            ${email}
                        </a>
                    </td>
                </tr>
                <tr>
                    <td colspan="2" style="font-family: 'Century Gothic', Verdana, Arial , sans-serif; font-size: 7pt;">
                        M:
                        <a id="phoneNumberVTK" href="tel:${phoneTel}"
                           style="text-decoration: none; color:#1f2449; font-family: 'Century Gothic', Verdana, Arial , sans-serif; font-size: 7pt;">
                            ${phone}
                        </a>
                    </td>
                </tr>
                <tr>
                    <td colspan="2" style="font-family: 'Century Gothic', Verdana, Arial , sans-serif; font-size: 7pt;">
                        W:
                        <a href="${siteUrl}"
                           style="text-decoration: none; color:#1f2449; font-family: 'Century Gothic', Verdana, Arial , sans-serif; font-size: 7pt;">
                            www.vtk.be
                        </a>
                    </td>
                </tr>
                <tr>
                    <td colspan="2"
                        style="color:#1f2449; font-family: 'Century Gothic', Verdana, Arial , sans-serif; font-size: 7pt;">
                        VAT: BE0479482282
                    </td>
                </tr>
                <tr>
                    <td colspan="2" id="socialMediaSpace" style="padding-top: 2px;"></td>
                </tr>
            </table>
        </td>
    </tr>
</table>`;
}

/**
 * Genereert een platte-tekstversie van de handtekening als fallback.
 */
export function generateSignaturePlainText(data: SignatureData): string {
  const lines = [
    data.fullName.trim().toUpperCase(),
    data.roleTitle.trim(),
    'Vlaamse Technische Kring vzw | RPR Leuven',
    'A: Studentenwijk Arenberg 6/1, 3001 Heverlee',
    `E: ${data.emailAddress.trim().toLowerCase()}`,
    data.phoneDisplay.trim() ? `M: ${data.phoneDisplay.trim()}` : 'M: ',
    'W: www.vtk.be',
    'VAT: BE0479482282',
  ];
  return lines.join('\n');
}

import { describe, expect, it } from 'vitest';
import {
  escapeHtml,
  sanitizePhoneForTel,
  buildDefaultVtkEmail,
  generateSignatureHtml,
  generateSignaturePlainText,
} from '@/lib/signature';

describe('signature library', () => {
  describe('escapeHtml', () => {
    it('escapet gevaarlijke HTML karakters', () => {
      expect(escapeHtml('<script>alert("test & \'1\'")</script>')).toBe(
        '&lt;script&gt;alert(&quot;test &amp; &#039;1&#039;&quot;)&lt;/script&gt;',
      );
    });
  });

  describe('sanitizePhoneForTel', () => {
    it('behoudt de + en cijfers en stript spaties en leestekens', () => {
      expect(sanitizePhoneForTel('+32 470 12 34 56')).toBe('+32470123456');
      expect(sanitizePhoneForTel('0470/12.34.56')).toBe('0470123456');
    });
  });

  describe('buildDefaultVtkEmail', () => {
    it('gebruikt bestaand @vtk.be e-mailadres wanneer aanwezig', () => {
      expect(buildDefaultVtkEmail('Jan', 'Janssens', 'custom.user@vtk.be')).toBe('custom.user@vtk.be');
    });

    it('bouwt voornaam.achternaam@vtk.be op basis van naamdelen', () => {
      expect(buildDefaultVtkEmail('Jan', 'Van Den Broeck', 'r0123456@kuleuven.be')).toBe(
        'jan.vandenbroeck@vtk.be',
      );
    });

    it('verwijdert accenten en diakritische tekens', () => {
      expect(buildDefaultVtkEmail('Hélène', 'François', null)).toBe('helene.francois@vtk.be');
    });

    it('valt terug op info@vtk.be als alle velden leeg zijn', () => {
      expect(buildDefaultVtkEmail(null, null, null)).toBe('info@vtk.be');
    });
  });

  describe('generateSignatureHtml', () => {
    const sampleData = {
      fullName: 'Jan Van den Broeck',
      roleTitle: 'VTK IT 26-27',
      emailAddress: 'jan.vandenbroeck@vtk.be',
      phoneDisplay: '+32 470 12 34 56',
    };

    it('genereert de tabel met de gele scheidingsstreep en schildafbeelding', () => {
      const html = generateSignatureHtml(sampleData);
      expect(html).toContain('border-right: solid 7px #eed610');
      expect(html).toContain('https://www.vtk.be/_site/img/schild_blauw.png');
      expect(html).toContain('alt="VTK Schild"');
    });

    it('bevat de opgemaakte naam in hoofdletters en vetgedrukt', () => {
      const html = generateSignatureHtml(sampleData);
      expect(html).toContain('<strong>JAN VAN DEN BROECK</strong>');
      expect(html).toContain("font-family: 'Droid Sans', Verdana, Arial , sans-serif");
    });

    it('bevat de functietitel, adres, e-mail, telefoonnummer, website en btw-nummer', () => {
      const html = generateSignatureHtml(sampleData);
      expect(html).toContain('<strong>VTK IT 26-27</strong>');
      expect(html).toContain('Vlaamse Technische Kring vzw | RPR Leuven');
      expect(html).toContain('Studentenwijk Arenberg 6/1, 3001 Heverlee');
      expect(html).toContain('href="mailto:jan.vandenbroeck@vtk.be"');
      expect(html).toContain('href="tel:+32470123456"');
      expect(html).toContain('+32 470 12 34 56');
      expect(html).toContain('www.vtk.be');
      expect(html).toContain('VAT: BE0479482282');
    });
  });

  describe('generateSignaturePlainText', () => {
    it('genereert een overzichtelijke platte-tekstversie', () => {
      const text = generateSignaturePlainText({
        fullName: 'Jan Van den Broeck',
        roleTitle: 'VTK IT 26-27',
        emailAddress: 'jan.vandenbroeck@vtk.be',
        phoneDisplay: '+32 470 12 34 56',
      });
      expect(text).toContain('JAN VAN DEN BROECK');
      expect(text).toContain('VTK IT 26-27');
      expect(text).toContain('E: jan.vandenbroeck@vtk.be');
      expect(text).toContain('M: +32 470 12 34 56');
    });
  });
});

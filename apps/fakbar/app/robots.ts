import type { MetadataRoute } from 'next';

/**
 * Het beheer en de test-login staan achter een login, maar ze horen ook niet in
 * de zoekresultaten: een crawler die ze indexeert, zet een halve pagina
 * "Geen toegang" in Google onder de naam van de fakbar.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', allow: '/', disallow: ['/admin', '/test-login'] },
  };
}

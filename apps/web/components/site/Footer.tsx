import Image from 'next/image';
import Link from 'next/link';
import { getDictionary, type Locale } from '@vtk/i18n';
import { CookieSettingsButton } from './CookieConsent';

export async function Footer({ locale }: { locale: Locale }) {
  const dict = getDictionary(locale);
  const base = locale === 'nl' ? '' : '/en';
  const f = dict.footer;

  return (
    <footer className="vtk-site-footer">
      <div className="vtk-site-footer-inner">
        <div className="vtk-site-footer-top">
          <div>
            <div className="vtk-site-footer-mega">
              <Image
                src="/vtk-logo.png"
                alt="VTK"
                width={1152}
                height={650}
                // Zie de header: zonder `sizes` haalt de browser het volledige
                // bestand op voor een merkteken van 38px hoog.
                sizes="190px"
                className="vtk-site-footer-logo"
              />
              {f.tagline}
            </div>
            <div className="vtk-site-footer-address">{f.address}</div>
          </div>
          <div>
            <h2>{f.colStudy}</h2>
            <ul>
              <li>
                <Link href={`${base}/info`}>{f.linkOffer}</Link>
              </li>
              <li>
                <Link href={`${base}/eerstejaars`}>{f.linkFirstYear}</Link>
              </li>
              <li>
                <Link href={`${base}/cursusdienst`}>{f.linkCourse}</Link>
              </li>
              <li>
                <Link href="/en/internationals">{f.linkIntl}</Link>
              </li>
            </ul>
          </div>
          <div>
            <h2>{f.colService}</h2>
            <ul>
              <li>
                <Link href={`${base}/theokot`}>{f.linkSandwiches}</Link>
              </li>
              <li>
                <Link href={`${base}/cursusdienst`}>{f.linkBooks}</Link>
              </li>
              <li>
                <a href="https://cudi.vtk.be/vtk/secondhand">{f.linkSecondHand}</a>
              </li>
              <li>
                <a href="https://cudi.vtk.be/vtk/account/slots">{f.linkSlots}</a>
              </li>
              <li>
                <Link href={`${base}/shift`}>{f.linkShifts}</Link>
              </li>
              {/* Uitleendienst (https://logistiek.vtk.be) tijdelijk verborgen. */}
            </ul>
          </div>
          <div>
            <h2>{f.colCommunity}</h2>
            <ul>
              <li>
                <Link href={`${base}/kalender`}>{f.linkCalendar}</Link>
              </li>
              <li>
                <Link href={`${base}/career`}>{f.linkCareer}</Link>
              </li>
              <li>
                <Link href={`${base}/media`}>{f.linkMedia}</Link>
              </li>
              <li>
                <Link href={`${base}/praesidium`}>{f.linkPraesidium}</Link>
              </li>
              <li>
                {/* De bevriende kringen (BEST, Biomedix, Chemix, Existenz, Mechanix,
                    Revue, Statix) staan als werkgroep in de database en dus al op
                    /werkgroepen. Daarom noemt deze ene link ze allebei, in plaats van
                    een tweede handgeschreven lijst naast dezelfde pagina te zetten. */}
                <Link href={`${base}/werkgroepen`}>{f.linkWerkgroepenCircles}</Link>
              </li>
              <li>
                <Link href={`${base}/over-vtk`}>{f.linkAbout}</Link>
              </li>
            </ul>
          </div>
          <div>
            <h2>{f.colContact}</h2>
            <ul>
              <li>
                <a href="mailto:info@vtk.be">info@vtk.be</a>
              </li>
              <li>
                <a href="https://www.instagram.com/vtkleuven/" rel="noopener noreferrer" target="_blank">
                  {f.linkInstagram}
                </a>
              </li>
              <li>
                <a href="https://www.facebook.com/VTKLeuven" rel="noopener noreferrer" target="_blank">
                  {f.linkFacebook}
                </a>
              </li>
              <li>
                <a href="https://www.linkedin.com/company/vtk-leuven" rel="noopener noreferrer" target="_blank">
                  {f.linkLinkedIn}
                </a>
              </li>
              <li>
                <a href="https://www.youtube.com/@VTKLeuven" rel="noopener noreferrer" target="_blank">
                  {f.linkYouTube}
                </a>
              </li>
              <li>
                <a href="https://www.tiktok.com/@vtkleuven" rel="noopener noreferrer" target="_blank">
                  {f.linkTikTok}
                </a>
              </li>
            </ul>
          </div>
        </div>
        <div className="vtk-site-footer-bottom">
          <span>
            © {new Date().getFullYear()} - {f.copyright}
          </span>
          <div className="vtk-site-footer-legal">
            <Link href={`${base}/privacy`}>{f.linkPrivacy}</Link>
            <Link href={`${base}/cookies`}>{f.linkCookies}</Link>
            <CookieSettingsButton>{f.linkCookieSettings}</CookieSettingsButton>
          </div>
        </div>
      </div>
    </footer>
  );
}

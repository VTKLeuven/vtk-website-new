'use client';

import { AdminNav as SharedAdminNav, type AdminNavItem, type AdminNavNode } from '@vtk/ui';
import type { ReactNode } from 'react';

export type NavItem = AdminNavItem;
export type NavNode = AdminNavNode;

export function AdminNav({ title, nodes }: { title: string; nodes: NavNode[] }) {
  return <SharedAdminNav title={title} nodes={nodes} icons={icons} />;
}

function Svg({ children }: { children: ReactNode }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className="shrink-0"
    >
      {children}
    </svg>
  );
}

// Icons zijn gekozen zodat je in een oogopslag de juiste tab herkent.
const icons: Record<string, ReactNode> = {
  // ledenbeheer: adresboek / ledenkaart
  ledenbeheer: (
    <Svg>
      <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" />
      <circle cx="12" cy="9" r="2" />
      <path d="M9.5 15a2.5 2.5 0 0 1 5 0" />
    </Svg>
  ),
  // dashboard: overzichtstegels (landing page)
  dashboard: (
    <Svg>
      <rect x="3" y="3" width="7" height="9" rx="1" />
      <rect x="14" y="3" width="7" height="5" rx="1" />
      <rect x="14" y="12" width="7" height="9" rx="1" />
      <rect x="3" y="16" width="7" height="5" rx="1" />
    </Svg>
  ),
  // logistics: materiaaldoos, ingang naar de aparte uitleendienst
  logistics: (
    <Svg>
      <path d="M4 8.5 12 4l8 4.5v8L12 21l-8-4.5v-8Z" />
      <path d="m4.5 8.75 7.5 4.25 7.5-4.25M12 13v8" />
    </Svg>
  ),
  // website: wereldbol, de publieke site (home, inhoud, pagina's, partners)
  website: (
    <Svg>
      <circle cx="12" cy="12" r="10" />
      <path d="M2 12h20" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </Svg>
  ),
  // pages: document met tekstlijnen (de inhoudseditor per pagina)
  pages: (
    <Svg>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
      <path d="M8 13h8" />
      <path d="M8 17h5" />
    </Svg>
  ),
  // content: navigatiebalk bovenaan met de pagina's eronder
  content: (
    <Svg>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M3 9h18" />
      <path d="M7 13h10" />
      <path d="M7 17h6" />
    </Svg>
  ),
  // tickets: ticket met perforatie, hetzelfde beeld als op de ticketpagina's
  tickets: (
    <Svg>
      <path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z" />
      <path d="M13 5v2" />
      <path d="M13 11v2" />
      <path d="M13 17v2" />
    </Svg>
  ),
  // forms: document met invulvelden en vinkjes
  forms: (
    <Svg>
      <rect x="4" y="3" width="16" height="18" rx="2" />
      <path d="M8 8h.01" />
      <path d="M11 8h5" />
      <path d="M8 12h.01" />
      <path d="M11 12h5" />
      <path d="M8 16h.01" />
      <path d="M11 16h5" />
    </Svg>
  ),
  // evenementen: de groep met kalender + tickets -> kalender met een ster erin,
  // zodat ze herkenbaar blijft naast de gewone kalender-tab eronder.
  evenementen: (
    <Svg>
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4" />
      <path d="M8 2v4" />
      <path d="M3 10h18" />
      <path d="m12 13 1.2 2.4 2.8.4-2 1.9.5 2.7-2.5-1.3-2.5 1.3.5-2.7-2-1.9 2.8-.4Z" />
    </Svg>
  ),
  // calendar: kalender
  calendar: (
    <Svg>
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4" />
      <path d="M8 2v4" />
      <path d="M3 10h18" />
    </Svg>
  ),
  // pocs: studentenvertegenwoordigers -> studentenmuts
  // onderwijs: de groep met POC's, bureau en lesbezoeken -> open boek
  onderwijs: (
    <Svg>
      <path d="M12 7v14" />
      <path d="M3 18a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3Z" />
    </Svg>
  ),
  // lesbezoeken: iemand die voor een bord staat
  lesbezoeken: (
    <Svg>
      <rect x="3" y="3" width="18" height="12" rx="2" />
      <path d="M7 7h7" />
      <path d="M7 11h4" />
      <circle cx="12" cy="18.5" r="1.5" />
      <path d="M9 22a3 3 0 0 1 6 0" />
    </Svg>
  ),
  pocs: (
    <Svg>
      <path d="M22 10 12 5 2 10l10 5 10-5Z" />
      <path d="M6 12v5c0 1 2.5 3 6 3s6-2 6-3v-5" />
    </Svg>
  ),
  // partners: bedrijven/sponsors -> aktetas
  partners: (
    <Svg>
      <rect x="2" y="7" width="20" height="14" rx="2" />
      <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
    </Svg>
  ),
  // users: individuele gebruiker
  users: (
    <Svg>
      <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </Svg>
  ),
  // mailinglists: envelop
  mailinglists: (
    <Svg>
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="m2 7 10 6 10-6" />
    </Svg>
  ),
  // groups: meerdere gebruikers
  groups: (
    <Svg>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </Svg>
  ),
  // werkgroepen: gestapelde lagen (werkgroepen naast de posten)
  werkgroepen: (
    <Svg>
      <path d="M12 2 2 7l10 5 10-5-10-5Z" />
      <path d="m2 12 10 5 10-5" />
      <path d="m2 17 10 5 10-5" />
    </Svg>
  ),
  // roles: rechtenbundel -> schild met vinkje
  roles: (
    <Svg>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
      <path d="m9 12 2 2 4-4" />
    </Svg>
  ),
  // announcements: megafoon
  announcements: (
    <Svg>
      <path d="M3 11v2a1 1 0 0 0 1 1h2l4 4V6L6 10H4a1 1 0 0 0-1 1Z" />
      <path d="M14 8a4 4 0 0 1 0 8" />
      <path d="M17 5a8 8 0 0 1 0 14" />
    </Svg>
  ),
  // frontpage: het bovenste blok van een pagina -> venster met een gevulde kop
  frontpage: (
    <Svg>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M3 10h18" />
      <path d="M7 7h4" />
    </Svg>
  ),
  // home: huis
  home: (
    <Svg>
      <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <path d="M9 22V12h6v10" />
    </Svg>
  ),
  // dashboardTiles: raster van tegels
  dashboardTiles: (
    <Svg>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
    </Svg>
  ),
  // shortlinks: link/ketting
  shortlinks: (
    <Svg>
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </Svg>
  ),
  // shift: shiften -> klok
  shift: (
    <Svg>
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </Svg>
  ),
  // theokot: eten & drinken -> koffiebeker
  theokot: (
    <Svg>
      <path d="M10 2v2" />
      <path d="M14 2v2" />
      <path d="M6 2v2" />
      <path d="M16 8a1 1 0 0 1 1 1v8a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V9a1 1 0 0 1 1-1h14a4 4 0 1 1 0 8h-1" />
    </Svg>
  ),
  // grocomeet: vergaderen -> mensen rond een tafel
  grocomeet: (
    <Svg>
      <path d="M3 12h18" />
      <path d="M6 12v6" />
      <path d="M18 12v6" />
      <circle cx="8" cy="6" r="2" />
      <circle cx="16" cy="6" r="2" />
    </Svg>
  ),
  // bureau: spreekbeurt/feedback -> tekstballon
  bureau: (
    <Svg>
      <path d="M21 15a2 2 0 0 1-2 2H8l-4 4V5a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2Z" />
      <path d="M8 9h8" />
      <path d="M8 13h5" />
    </Svg>
  ),
  // piano: toetsen van een klavier
  piano: (
    <Svg>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M9 4v9" />
      <path d="M15 4v9" />
      <path d="M3 13h18" />
    </Svg>
  ),
  // it: terminal (de groep met de technische tabs)
  it: (
    <Svg>
      <polyline points="4 17 10 11 4 5" />
      <line x1="12" y1="19" x2="20" y2="19" />
    </Svg>
  ),
  // itConfig: schuifregelaars, de instellingen zelf
  itConfig: (
    <Svg>
      <line x1="4" y1="6" x2="20" y2="6" />
      <line x1="4" y1="12" x2="20" y2="12" />
      <line x1="4" y1="18" x2="20" y2="18" />
      <circle cx="9" cy="6" r="2" />
      <circle cx="15" cy="12" r="2" />
      <circle cx="8" cy="18" r="2" />
    </Svg>
  ),
  // authorizationPreview: oog, je bekijkt de site door andermans rechten
  authorizationPreview: (
    <Svg>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </Svg>
  ),
  // kulSso: KU Leuven OIDC / SSO koppeling
  kulSso: (
    <Svg>
      <path d="M12 2 2 7l10 5 10-5-10-5Z" />
      <path d="M6 9.5V16c0 3 6 4 6 4s6-1 6-4V9.5" />
      <path d="M22 10v6" />
    </Svg>
  ),
  // auditLog: lijstje met een klok, wie deed wat wanneer
  auditLog: (
    <Svg>
      <path d="M4 5h10" />
      <path d="M4 10h7" />
      <path d="M4 15h5" />
      <circle cx="16.5" cy="15.5" r="4.5" />
      <path d="M16.5 13.5v2l1.5 1" />
    </Svg>
  ),
  // sso: sleutel, externe apps die met een VTK-account inloggen
  sso: (
    <Svg>
      <circle cx="7.5" cy="15.5" r="4.5" />
      <path d="m10.7 12.3 8.5-8.5" />
      <path d="m17 6 2.5 2.5" />
      <path d="m14.5 8.5 2.5 2.5" />
    </Svg>
  ),
  // fakscanner: pint met schuim, de kaartlezer aan de bar
  fakscanner: (
    <Svg>
      <path d="M6 9h9v10a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2Z" />
      <path d="M15 12h2a2 2 0 0 1 0 4h-2" />
      <path d="M6 9a2.5 2.5 0 0 1 1.7-2.4 2.5 2.5 0 0 1 4.2-1A2.5 2.5 0 0 1 15 9" />
      <path d="M9.5 13v4" />
      <path d="M12 13v4" />
    </Svg>
  ),
  // door: deur met klink
  door: (
    <Svg>
      <path d="M3 21h18" />
      <path d="M6 21V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v17" />
      <path d="M14 12h.01" />
    </Svg>
  ),
};

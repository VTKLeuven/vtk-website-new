// Canonical list of permission codes. Keep in sync with seed and UI.

export const PERMISSIONS = [
  // Pages
  { code: "pages.edit", labelNl: "Toegewezen pagina's bewerken", labelEn: "Edit assigned pages", category: "pages" },
  { code: "pages.editAll", labelNl: "Alle pagina's bewerken", labelEn: "Edit all pages", category: "pages" },
  { code: "pages.manage", labelNl: "Paginastructuur beheren", labelEn: "Manage page structure", category: "pages" },
  { code: "pages.publish", labelNl: "Pagina's publiceren", labelEn: "Publish pages", category: "pages" },
  { code: "pages.delete", labelNl: "Pagina's verwijderen", labelEn: "Delete pages", category: "pages" },

  // Header
  { code: "header.manage", labelNl: "Headertabs beheren", labelEn: "Manage header tabs", category: "pages" },

  // Calendar
  { code: "calendar.create", labelNl: "Evenementen aanmaken voor eigen groep", labelEn: "Create events for own group", category: "calendar" },
  { code: "calendar.manageAll", labelNl: "Alle evenementen beheren", labelEn: "Manage all events", category: "calendar" },

  // Tickets
  { code: "tickets.create", labelNl: "Ticketevents aanmaken voor eigen groep", labelEn: "Create ticket events for own group", category: "tickets" },
  { code: "tickets.manageAll", labelNl: "Alle ticketevents beheren", labelEn: "Manage all ticket events", category: "tickets" },

  // Formulieren
  { code: "forms.create", labelNl: "Formulieren aanmaken voor eigen groep", labelEn: "Create forms for own group", category: "forms" },
  { code: "forms.manageAll", labelNl: "Alle formulieren beheren", labelEn: "Manage all forms", category: "forms" },

  // Photos
  { code: "photos.upload", labelNl: "Foto's uploaden", labelEn: "Upload photos", category: "photos" },
  { code: "photos.manageAlbums", labelNl: "Albums beheren", labelEn: "Manage albums", category: "photos" },

  // Users & groups
  { code: "users.search", labelNl: "Gebruikers opzoeken (user-pickers)", labelEn: "Search users (user pickers)", category: "users" },
  { code: "users.view", labelNl: "Gebruikers bekijken", labelEn: "View users", category: "users" },
  { code: "users.edit", labelNl: "Gebruikers bewerken", labelEn: "Edit users", category: "users" },
  { code: "users.bulkImport", labelNl: "Bulk gebruikers importeren", labelEn: "Bulk import users", category: "users" },
  { code: "groups.manage", labelNl: "Posten en hun rollen beheren", labelEn: "Manage posts and their roles", category: "users" },
  { code: "werkgroepen.manage", labelNl: "Werkgroepen en hun rollen beheren", labelEn: "Manage werkgroepen and their roles", category: "users" },
  { code: "roles.manage", labelNl: "Rollen beheren en toewijzen", labelEn: "Manage and assign roles", category: "users" },

  // Mailing lists
  { code: "mailinglists.export", labelNl: "Mailinglijsten exporteren", labelEn: "Export mailing lists", category: "users" },

  // POCs
  { code: "pocs.manage", labelNl: "POC's beheren", labelEn: "Manage POCs", category: "general" },

  // Partners
  { code: "partners.manage", labelNl: "Partners beheren", labelEn: "Manage partners", category: "general" },

  // Homepage
  { code: "home.edit", labelNl: "Homepagina bewerken", labelEn: "Edit homepage", category: "general" },

  // Media page (magazines, promo videos, gallery albums)
  { code: "media.manage", labelNl: "Mediapagina beheren", labelEn: "Manage media page", category: "general" },

  // Dashboard tiles
  { code: "dashboard.manage", labelNl: "Voor iedereen tegels beheren", labelEn: "Manage tiles for everyone", category: "general" },
  { code: "dashboard.manageOwn", labelNl: "Tegels van eigen post beheren", labelEn: "Manage own post's tiles", category: "general" },

  // Short links
  { code: "shortlinks.manage", labelNl: "Verkorte links beheren", labelEn: "Manage short links", category: "general" },

  // Shifts
  { code: "shift.edit", labelNl: "Shiften beheren", labelEn: "Manage shifts", category: "shift" },
  { code: "shift.reward", labelNl: "Shiftbonnetjes beheren", labelEn: "Manage shift vouchers", category: "shift" },
  { code: "shift.ranking", labelNl: "Shiftranglijst bekijken", labelEn: "View shift rankings", category: "shift" },

  // Theokot (cafetaria / broodjesbar)
  { code: "theokot.manage", labelNl: "Theokot beheren (sessies, aanbod, bans, instellingen)", labelEn: "Manage Theokot (sessions, offering, bans, settings)", category: "theokot" },
  { code: "theokot.pickup", labelNl: "Theokot afhaalbalie bedienen", labelEn: "Operate Theokot pickup counter", category: "theokot" },

  // Broodjesmomenten (grocomeet en VTK Bureau)
  { code: "grocomeet.reserve", labelNl: "Broodje reserveren voor de grocomeet", labelEn: "Reserve a sandwich for the grocomeet", category: "meetings" },
  { code: "grocomeet.manage", labelNl: "Grocomeets plannen en het geldoverzicht beheren", labelEn: "Plan grocomeets and manage the payment overview", category: "meetings" },
  { code: "bureau.manage", labelNl: "Bureaus plannen, aanbod en totalen beheren", labelEn: "Plan bureaus, manage offering and totals", category: "meetings" },

  // Lesbezoeken (aankondiging bij het begin van een les)
  { code: "lesbezoeken.view", labelNl: "Lesbezoekenkalender bekijken", labelEn: "View the classroom-visit calendar", category: "lesbezoeken" },
  { code: "lesbezoeken.manage", labelNl: "Lesbezoeken goedkeuren, inplannen en organisaties beheren", labelEn: "Approve and schedule classroom visits, manage organisations", category: "lesbezoeken" },

  // Piano (reservaties voor het lokaal in het kasteel)
  { code: "piano.manage", labelNl: "Piano beheren (uren, sluitingsdagen, reservaties)", labelEn: "Manage the piano (hours, closures, reservations)", category: "piano" },

  // Logistiek (uitleendienst op logistiek.vtk.be)
  { code: "logistiek.manage", labelNl: "Uitleendienst beheren (inventaris, aanvragen, camionette)", labelEn: "Manage equipment rental (inventory, requests, van)", category: "logistiek" },

  // Deurtoegang (KU Leuven-kaartscanner op de deur)
  { code: "door.open", labelNl: "Deur openen met studentenkaart", labelEn: "Open the door with a student card", category: "door" },
  { code: "door.remoteOpen", labelNl: "Deur openen vanaf het dashboard", labelEn: "Open the door from the dashboard", category: "door" },
  { code: "door.manage", labelNl: "Deurtoegang beheren (logs, tijdelijke toegang)", labelEn: "Manage door access (logs, temporary access)", category: "door" },

  // Fakscanner (kaartlezer aan de bar: check-ins en gratis pinten)
  { code: "fakscanner.manage", labelNl: "Fakscanner beheren (ranglijst, log, instellingen)", labelEn: "Manage the fakscanner (ranking, log, settings)", category: "fakbar" },

  // Module access flags (gate submodules via group permissions)
  { code: "modules.logistiek.access", labelNl: "Toegang tot Logistiek module", labelEn: "Access to Logistics module", category: "modules" },
  { code: "modules.cursusdienst.access", labelNl: "Toegang tot Cursusdienst module", labelEn: "Access to Course Shop module", category: "modules" },

  // SSO / OAuth Authorization Server
  { code: "oauth.client.edit", labelNl: "OAuth-clients aanmaken en bewerken", labelEn: "Create and edit OAuth clients", category: "external" },

  // Adminlogboek (wie deed wat in de admin)
  { code: "audit.view", labelNl: "Adminlogboek bekijken", labelEn: "View the admin audit log", category: "it" },
  { code: "urenloopApp.manage", labelNl: "24UL-app: downloadlijst beheren", labelEn: "24UL app: manage the download list", category: "it" },

] as const;

export type PermissionCode = (typeof PERMISSIONS)[number]["code"];

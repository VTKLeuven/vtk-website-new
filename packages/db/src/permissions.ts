// Canonical list of permission codes. Keep in sync with seed and UI.

export const PERMISSIONS = [
  // Pages
  { code: "pages.edit", labelNl: "Pagina's beheren", labelEn: "Manage pages", category: "pages" },
  { code: "pages.delete", labelNl: "Pagina's verwijderen", labelEn: "Delete pages", category: "pages" },

  // Header
  { code: "header.manage", labelNl: "Headertabs beheren", labelEn: "Manage header tabs", category: "pages" },

  // Calendar
  { code: "calendar.create", labelNl: "Evenementen aanmaken voor eigen groep", labelEn: "Create events for own group", category: "calendar" },
  { code: "calendar.manageAll", labelNl: "Alle evenementen beheren", labelEn: "Manage all events", category: "calendar" },

  // Photos
  { code: "photos.upload", labelNl: "Foto's uploaden", labelEn: "Upload photos", category: "photos" },
  { code: "photos.manageAlbums", labelNl: "Albums beheren", labelEn: "Manage albums", category: "photos" },

  // Users & groups
  { code: "users.view", labelNl: "Gebruikers bekijken", labelEn: "View users", category: "users" },
  { code: "users.edit", labelNl: "Gebruikers bewerken", labelEn: "Edit users", category: "users" },
  { code: "users.bulkImport", labelNl: "Bulk gebruikers importeren", labelEn: "Bulk import users", category: "users" },
  { code: "groups.manage", labelNl: "Groepen en rechten beheren", labelEn: "Manage groups and permissions", category: "users" },

  // POCs
  { code: "pocs.manage", labelNl: "POC's beheren", labelEn: "Manage POCs", category: "general" },

  // Partners
  { code: "partners.manage", labelNl: "Partners beheren", labelEn: "Manage partners", category: "general" },

  // Homepage
  { code: "home.edit", labelNl: "Homepagina bewerken", labelEn: "Edit homepage", category: "general" },

  // Module access flags (gate submodules via group permissions)
  { code: "modules.logistiek.access", labelNl: "Toegang tot Logistiek module", labelEn: "Access to Logistics module", category: "modules" },
  { code: "modules.cursusdienst.access", labelNl: "Toegang tot Cursusdienst module", labelEn: "Access to Course Shop module", category: "modules" },
] as const;

export type PermissionCode = (typeof PERMISSIONS)[number]["code"];

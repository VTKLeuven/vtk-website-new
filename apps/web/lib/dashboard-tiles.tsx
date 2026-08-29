import type { CSSProperties, ReactNode } from "react";

// -----------------------------------------------------------------------------
// Curated icon set. Stroke-based line icons on a 24x24 grid; they inherit the
// current text color so a colored chip can pass `currentColor` down.
//
// De set is ingedeeld in categorieën omdat ze te groot geworden is voor één
// rooster: de kiezer toont categorie-chips en een zoekveld dat op de sleutel én
// op het label matcht. Voeg je een icoon toe, geef het dan een sleutel die je
// nooit meer wijzigt: die staat in de database op elke tegel die hem koos.
// -----------------------------------------------------------------------------

export type TileIconCategory = "alg" | "com" | "doc" | "plan" | "geld" | "tech" | "kring";

export const TILE_ICON_CATEGORIES: Array<{
  key: TileIconCategory;
  labelNl: string;
  labelEn: string;
}> = [
  { key: "alg", labelNl: "Algemeen", labelEn: "General" },
  { key: "com", labelNl: "Communicatie", labelEn: "Communication" },
  { key: "doc", labelNl: "Documenten & media", labelEn: "Documents & media" },
  { key: "plan", labelNl: "Planning & werk", labelEn: "Planning & work" },
  { key: "geld", labelNl: "Geld & verkoop", labelEn: "Money & sales" },
  { key: "tech", labelNl: "Techniek", labelEn: "Tech" },
  { key: "kring", labelNl: "Kring & campus", labelEn: "Club & campus" },
];

type IconDef = {
  key: string;
  cat: TileIconCategory;
  labelNl: string;
  labelEn: string;
  path: string;
};

const ICONS: IconDef[] = [
  // --- Algemeen ---
  {
    key: "link",
    cat: "alg",
    labelNl: "Link",
    labelEn: "Link",
    path: "M9 15l6-6M10.5 6.5l1-1a4 4 0 0 1 6 6l-1 1M13.5 17.5l-1 1a4 4 0 0 1-6-6l1-1",
  },
  {
    key: "external",
    cat: "alg",
    labelNl: "Externe link",
    labelEn: "External link",
    path: "M14 4h6v6M20 4l-8.5 8.5M18 13.5V19a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5.5",
  },
  {
    key: "globe",
    cat: "alg",
    labelNl: "Website",
    labelEn: "Website",
    path: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18M3.5 12h17M12 3c2.5 2.4 3.8 5.6 3.8 9s-1.3 6.6-3.8 9c-2.5-2.4-3.8-5.6-3.8-9S9.5 5.4 12 3",
  },
  {
    key: "home",
    cat: "alg",
    labelNl: "Startpagina",
    labelEn: "Home",
    path: "M3.5 11.5L12 4l8.5 7.5M6 10v9a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-9M10 20v-5.5h4V20",
  },
  {
    key: "search",
    cat: "alg",
    labelNl: "Zoeken",
    labelEn: "Search",
    path: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14M16.2 16.2L20.5 20.5",
  },
  {
    key: "star",
    cat: "alg",
    labelNl: "Ster",
    labelEn: "Star",
    path: "M12 4l2.4 5 5.6.6-4 3.9 1 5.5L12 16.4 7 19l1-5.5-4-3.9 5.6-.6z",
  },
  {
    key: "bookmark",
    cat: "alg",
    labelNl: "Bladwijzer",
    labelEn: "Bookmark",
    path: "M6.5 4.5h11a1 1 0 0 1 1 1V20l-6.5-4.2L5.5 20V5.5a1 1 0 0 1 1-1z",
  },
  {
    key: "flag",
    cat: "alg",
    labelNl: "Vlag",
    labelEn: "Flag",
    path: "M6 21V4M6 4.5h11.5l-2.2 3.7 2.2 3.8H6",
  },
  {
    key: "heart",
    cat: "alg",
    labelNl: "Hart",
    labelEn: "Heart",
    path: "M12 20.2S4.5 15.8 4.5 10.6A3.9 3.9 0 0 1 12 8.6a3.9 3.9 0 0 1 7.5 2c0 5.2-7.5 9.6-7.5 9.6z",
  },
  {
    key: "pin",
    cat: "alg",
    labelNl: "Locatie",
    labelEn: "Location",
    path: "M12 21s6-5.5 6-10a6 6 0 1 0-12 0c0 4.5 6 10 6 10M12 9a2 2 0 1 0 0 4 2 2 0 0 0 0-4",
  },
  {
    key: "map",
    cat: "alg",
    labelNl: "Kaart",
    labelEn: "Map",
    path: "M9 4.5L3.5 6.8v12.7L9 17.2m0-12.7l6 2.3m-6-2.3v12.7m6-10.4l5.5-2.3v12.7L15 19.5m0-12.7v12.7m0 0l-6-2.3",
  },
  {
    key: "info",
    cat: "alg",
    labelNl: "Info",
    labelEn: "Info",
    path: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18M12 11.5V16.5M12 7.6h.01",
  },
  {
    key: "question",
    cat: "alg",
    labelNl: "Hulp",
    labelEn: "Help",
    path: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18M9.7 9.6a2.4 2.4 0 1 1 3.2 2.3c-.6.3-.9.8-.9 1.4v.6M12 16.8h.01",
  },
  {
    key: "sparkles",
    cat: "alg",
    labelNl: "Nieuw",
    labelEn: "New",
    path: "M11.5 4l1.5 3.9 3.9 1.5-3.9 1.5-1.5 3.9L10 10.9 6.1 9.4 10 7.9zM17.8 14.2l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8zM6 15l.6 1.5 1.5.6-1.5.6L6 19.2l-.6-1.5-1.5-.6 1.5-.6z",
  },

  // --- Communicatie ---
  {
    key: "mail",
    cat: "com",
    labelNl: "Mail",
    labelEn: "Mail",
    path: "M4 7a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1zM4.5 7l7.5 6 7.5-6",
  },
  {
    key: "inbox",
    cat: "com",
    labelNl: "Inbox",
    labelEn: "Inbox",
    path: "M4 13.5h4l1.5 2.5h5l1.5-2.5h4M4 13.5l2.4-7a1 1 0 0 1 .95-.7h9.3a1 1 0 0 1 .95.7l2.4 7V18a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z",
  },
  {
    key: "chat",
    cat: "com",
    labelNl: "Chat",
    labelEn: "Chat",
    path: "M5 5h14a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H9l-4 3v-3a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z",
  },
  {
    key: "megaphone",
    cat: "com",
    labelNl: "Aankondiging",
    labelEn: "Announcement",
    path: "M4 10v4a1 1 0 0 0 1 1h2l3 4V5L7 9H5a1 1 0 0 0-1 1M14 8a5 5 0 0 1 0 8M17 5a9 9 0 0 1 0 14",
  },
  {
    key: "bell",
    cat: "com",
    labelNl: "Melding",
    labelEn: "Notification",
    path: "M6.5 10.5a5.5 5.5 0 0 1 11 0c0 3.6 1.5 5 1.5 5H5s1.5-1.4 1.5-5M10 18.5a2 2 0 0 0 4 0",
  },
  {
    key: "phone",
    cat: "com",
    labelNl: "Telefoon",
    labelEn: "Phone",
    path: "M6.6 3.5h3l1.5 3.8-2 1.4a11 11 0 0 0 5.2 5.2l1.4-2 3.8 1.5v3a1.5 1.5 0 0 1-1.6 1.5C10.8 18.4 5.6 13.2 5.1 5.1A1.5 1.5 0 0 1 6.6 3.5z",
  },
  {
    key: "video",
    cat: "com",
    labelNl: "Video",
    labelEn: "Video",
    path: "M4 7a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1zM15 10l5-3v10l-5-3z",
  },
  {
    key: "mic",
    cat: "com",
    labelNl: "Microfoon",
    labelEn: "Microphone",
    path: "M12 3.5a2.5 2.5 0 0 1 2.5 2.5v5a2.5 2.5 0 0 1-5 0V6A2.5 2.5 0 0 1 12 3.5M6.5 11a5.5 5.5 0 0 0 11 0M12 16.5V20M9 20.5h6",
  },
  {
    key: "users",
    cat: "com",
    labelNl: "Mensen",
    labelEn: "People",
    path: "M16 19v-1.5a3.5 3.5 0 0 0-3.5-3.5h-4A3.5 3.5 0 0 0 5 17.5V19M10.5 10.5a3 3 0 1 0 0-6 3 3 0 0 0 0 6M18 19v-1.5a3.5 3.5 0 0 0-2.6-3.4M15 4.7a3 3 0 0 1 0 5.8",
  },
  {
    key: "user",
    cat: "com",
    labelNl: "Persoon",
    labelEn: "Person",
    path: "M12 12.5a4.2 4.2 0 1 0 0-8.4 4.2 4.2 0 0 0 0 8.4M4.8 20.5v-1.2a4.8 4.8 0 0 1 4.8-4.8h4.8a4.8 4.8 0 0 1 4.8 4.8v1.2",
  },
  {
    key: "share",
    cat: "com",
    labelNl: "Delen",
    labelEn: "Share",
    path: "M17.5 8.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5M6.5 14.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5M17.5 20.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5M8.7 10.8l6.6-3.6M8.7 13.2l6.6 3.6",
  },

  // --- Documenten & media ---
  {
    key: "doc",
    cat: "doc",
    labelNl: "Document",
    labelEn: "Document",
    path: "M7 3h7l4 4v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zM13 3v4h4M9 12h6M9 16h6",
  },
  {
    key: "docs",
    cat: "doc",
    labelNl: "Documenten",
    labelEn: "Documents",
    path: "M8.5 3.5H14l3.5 3.5v9a1 1 0 0 1-1 1h-8a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1M14 3.5v3.5h3.5M5.5 7.5V19a1.5 1.5 0 0 0 1.5 1.5h7.5",
  },
  {
    key: "folder",
    cat: "doc",
    labelNl: "Map",
    labelEn: "Folder",
    path: "M4 7a1 1 0 0 1 1-1h4l2 2h8a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z",
  },
  {
    key: "archive",
    cat: "doc",
    labelNl: "Archief",
    labelEn: "Archive",
    path: "M4 6a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1zM6 9v9a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V9M10 12.5h4",
  },
  {
    key: "book",
    cat: "doc",
    labelNl: "Wiki / boek",
    labelEn: "Wiki / book",
    path: "M5 4.5A1.5 1.5 0 0 1 6.5 3H18a1 1 0 0 1 1 1v15a1 1 0 0 1-1 1H6.5A1.5 1.5 0 0 1 5 18.5zM5 17.5h13",
  },
  {
    key: "clipboard",
    cat: "doc",
    labelNl: "Klembord",
    labelEn: "Clipboard",
    path: "M9.5 4.5H7a1 1 0 0 0-1 1V19a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V5.5a1 1 0 0 0-1-1h-2.5M9.5 3.2h5v2.6h-5zM9 12h6M9 16h4",
  },
  {
    key: "checklist",
    cat: "doc",
    labelNl: "Checklist",
    labelEn: "Checklist",
    path: "M4 7.2l1.6 1.6L8.8 5.6M4 16.2l1.6 1.6 3.2-3.2M11.5 7h8.5M11.5 17h8.5",
  },
  {
    key: "pencil",
    cat: "doc",
    labelNl: "Bewerken",
    labelEn: "Edit",
    path: "M4.5 19.5l4.2-1L18.3 9a1.8 1.8 0 0 0 0-2.6l-1.1-1.1a1.8 1.8 0 0 0-2.6 0L5.2 15.3zM13.8 6.7l3.5 3.5",
  },
  {
    key: "printer",
    cat: "doc",
    labelNl: "Printer",
    labelEn: "Printer",
    path: "M7 9V4.5h10V9M7 15h10v5H7zM7 18H5a1 1 0 0 1-1-1v-6a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-2",
  },
  {
    key: "image",
    cat: "doc",
    labelNl: "Foto's",
    labelEn: "Photos",
    path: "M4 6a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1zM4 16l4-4 3 3 4-4 5 5M9 10a1.2 1.2 0 1 0 0-2.4A1.2 1.2 0 0 0 9 10",
  },
  {
    key: "camera",
    cat: "doc",
    labelNl: "Camera",
    labelEn: "Camera",
    path: "M4 8.5a1 1 0 0 1 1-1h2.6L9 5.5h6l1.4 2H19a1 1 0 0 1 1 1V17a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1zM12 15.6a3.4 3.4 0 1 0 0-6.8 3.4 3.4 0 0 0 0 6.8",
  },
  {
    key: "film",
    cat: "doc",
    labelNl: "Aftermovie",
    labelEn: "Aftermovie",
    path: "M4 5.5a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1zM8 4.5v15M16 4.5v15M4 12h16M4 8.2h4M4 15.8h4M16 8.2h4M16 15.8h4",
  },
  {
    key: "music",
    cat: "doc",
    labelNl: "Muziek",
    labelEn: "Music",
    path: "M9 17.5V6l10-2v11.5M9 17.5a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0M19 15.5a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0M9 9.5l10-2",
  },
  {
    key: "palette",
    cat: "doc",
    labelNl: "Ontwerp",
    labelEn: "Design",
    path: "M12 3.5a8.5 8.5 0 0 0 0 17c1.3 0 2-.8 2-1.7 0-1.5-1.3-1.6-1.3-2.7 0-.8.7-1.4 1.6-1.4h1.6a4.6 4.6 0 0 0 4.6-4.6c0-3.7-3.8-6.6-8.5-6.6M8 11a1.1 1.1 0 1 0 0-2.2A1.1 1.1 0 0 0 8 11M12.5 8.7a1.1 1.1 0 1 0 0-2.2 1.1 1.1 0 0 0 0 2.2M16.8 11.2a1.1 1.1 0 1 0 0-2.2 1.1 1.1 0 0 0 0 2.2M7.2 15.6a1.1 1.1 0 1 0 0-2.2 1.1 1.1 0 0 0 0 2.2",
  },

  // --- Planning & werk ---
  {
    key: "calendar",
    cat: "plan",
    labelNl: "Kalender",
    labelEn: "Calendar",
    path: "M5 7a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1zM5 10h14M8 4v3M16 4v3",
  },
  {
    key: "clock",
    cat: "plan",
    labelNl: "Uren",
    labelEn: "Hours",
    path: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18M12 7.2V12l3.2 2",
  },
  {
    key: "list",
    cat: "plan",
    labelNl: "Lijst",
    labelEn: "List",
    path: "M4.6 6.6h.01M4.6 12h.01M4.6 17.4h.01M8.5 6.6H20M8.5 12H20M8.5 17.4H20",
  },
  {
    key: "table",
    cat: "plan",
    labelNl: "Tabel",
    labelEn: "Spreadsheet",
    path: "M4 6a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1zM4 9.8h16M10.2 9.8V19",
  },
  {
    key: "columns",
    cat: "plan",
    labelNl: "Bord",
    labelEn: "Board",
    path: "M4 5.5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1V18a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1zM14 5.5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1V13a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1z",
  },
  {
    key: "target",
    cat: "plan",
    labelNl: "Doel",
    labelEn: "Goal",
    path: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18M12 7.5a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9M12 11a1 1 0 1 0 0 2 1 1 0 0 0 0-2",
  },
  {
    key: "trophy",
    cat: "plan",
    labelNl: "Prijs",
    labelEn: "Award",
    path: "M8 4.2h8v4.6a4 4 0 0 1-8 0zM8 5.6H5.4v1.2a3 3 0 0 0 2.6 3M16 5.6h2.6v1.2a3 3 0 0 1-2.6 3M10.5 12.8V16M13.5 12.8V16M8.4 19.8h7.2",
  },
  {
    key: "chart-bar",
    cat: "plan",
    labelNl: "Statistiek",
    labelEn: "Statistics",
    path: "M4 19.8h16M7.6 19.8v-6M12 19.8V8M16.4 19.8V11",
  },
  {
    key: "chart-line",
    cat: "plan",
    labelNl: "Trend",
    labelEn: "Trend",
    path: "M4.2 4v15.8H20M7 15.2l3.6-4 3 2.6 5.2-6.4",
  },
  {
    key: "pie",
    cat: "plan",
    labelNl: "Verdeling",
    labelEn: "Breakdown",
    path: "M12 3.2a8.8 8.8 0 1 0 8.8 8.8H12zM14.6 3.6a8.8 8.8 0 0 1 5.8 5.8h-5.8z",
  },

  // --- Geld & verkoop ---
  {
    key: "money",
    cat: "geld",
    labelNl: "Financiën",
    labelEn: "Finance",
    path: "M4 7a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1zM12 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5",
  },
  {
    key: "card",
    cat: "geld",
    labelNl: "Betaalkaart",
    labelEn: "Payment card",
    path: "M4 7a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1zM4 10h16M7 14.5h3.5",
  },
  {
    key: "wallet",
    cat: "geld",
    labelNl: "Portefeuille",
    labelEn: "Wallet",
    path: "M4 7.6A1.6 1.6 0 0 1 5.6 6h11.2a1 1 0 0 1 1 1v1.6M4 7.6V18a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-2.4M16.4 11.2H20v4.4h-3.6a2.2 2.2 0 0 1 0-4.4",
  },
  {
    key: "receipt",
    cat: "geld",
    labelNl: "Bonnetje",
    labelEn: "Receipt",
    path: "M6.2 3.6h11.6v17l-1.9-1.4-1.9 1.4-1.9-1.4-1.9 1.4-1.9-1.4-1.9 1.4zM9.2 8.4h5.6M9.2 12.4h5.6",
  },
  {
    key: "cart",
    cat: "geld",
    labelNl: "Webshop",
    labelEn: "Webshop",
    path: "M3.5 5h2l2.2 9.2a1 1 0 0 0 .97.77h7.9a1 1 0 0 0 .97-.75L19.5 8.4H6.1M9.6 19.4a1.2 1.2 0 1 0 0-2.4 1.2 1.2 0 0 0 0 2.4M16.4 19.4a1.2 1.2 0 1 0 0-2.4 1.2 1.2 0 0 0 0 2.4",
  },
  {
    key: "tag",
    cat: "geld",
    labelNl: "Prijs / label",
    labelEn: "Price / label",
    path: "M4.5 11.2V5.4a1 1 0 0 1 1-1h5.8l8.3 8.3a1.5 1.5 0 0 1 0 2.1l-4.7 4.7a1.5 1.5 0 0 1-2.1 0zM8.4 8.9a.9.9 0 1 0 0-1.8.9.9 0 0 0 0 1.8",
  },
  {
    key: "ticket",
    cat: "geld",
    labelNl: "Tickets",
    labelEn: "Tickets",
    path: "M4 8.5A1.5 1.5 0 0 1 5.5 7h13A1.5 1.5 0 0 1 20 8.5v1.25a1.75 1.75 0 0 0 0 4.5v1.25A1.5 1.5 0 0 1 18.5 17h-13A1.5 1.5 0 0 1 4 15.5v-1.25a1.75 1.75 0 0 0 0-4.5zM12 7v10",
  },
  {
    key: "gift",
    cat: "geld",
    labelNl: "Cadeau",
    labelEn: "Gift",
    path: "M4 11.4h16V19a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1zM3.4 8h17.2v3.4H3.4zM12 8v12M12 8S11 4.2 8.6 4.2a1.9 1.9 0 0 0 0 3.8zM12 8s1-3.8 3.4-3.8a1.9 1.9 0 0 1 0 3.8z",
  },

  // --- Techniek ---
  {
    key: "code",
    cat: "tech",
    labelNl: "Code",
    labelEn: "Code",
    path: "M9 8l-4 4 4 4M15 8l4 4-4 4M13 6l-2 12",
  },
  {
    key: "terminal",
    cat: "tech",
    labelNl: "Terminal",
    labelEn: "Terminal",
    path: "M4 5.6a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v12.8a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1zM7.6 9.6l2.8 2.4-2.8 2.4M13 15h4",
  },
  {
    key: "bug",
    cat: "tech",
    labelNl: "Bugtracker",
    labelEn: "Bug tracker",
    path: "M8 8.4a4 4 0 0 1 8 0M7 8.4h10v4.8a5 5 0 0 1-10 0zM4 11.2h3M17 11.2h3M4.6 17.2l2.6-1.6M19.4 17.2l-2.6-1.6M5.6 6.2L8 8.4M18.4 6.2L16 8.4",
  },
  {
    key: "git-branch",
    cat: "tech",
    labelNl: "Repository",
    labelEn: "Repository",
    path: "M7 4.6a2.2 2.2 0 1 0 0 4.4 2.2 2.2 0 0 0 0-4.4M7 15a2.2 2.2 0 1 0 0 4.4A2.2 2.2 0 0 0 7 15M7 9v6M17 4.6a2.2 2.2 0 1 0 0 4.4 2.2 2.2 0 0 0 0-4.4M17 9v1.8a3.4 3.4 0 0 1-3.4 3.4H7",
  },
  {
    key: "database",
    cat: "tech",
    labelNl: "Database",
    labelEn: "Database",
    path: "M12 3.4c4.4 0 8 1.1 8 2.5s-3.6 2.5-8 2.5-8-1.1-8-2.5 3.6-2.5 8-2.5M4 5.9v12.2c0 1.4 3.6 2.5 8 2.5s8-1.1 8-2.5V5.9M4 12c0 1.4 3.6 2.5 8 2.5s8-1.1 8-2.5",
  },
  {
    key: "server",
    cat: "tech",
    labelNl: "Server",
    labelEn: "Server",
    path: "M4 5.6a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v3.2a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1zM4 15.2a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v3.2a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1zM7.4 7.2h.01M7.4 16.8h.01",
  },
  {
    key: "cloud",
    cat: "tech",
    labelNl: "Cloud / drive",
    labelEn: "Cloud / drive",
    path: "M7.5 18a4 4 0 0 1-.5-7.97 5 5 0 0 1 9.6-1.2A3.75 3.75 0 0 1 16.75 18z",
  },
  {
    key: "download",
    cat: "tech",
    labelNl: "Download",
    labelEn: "Download",
    path: "M12 4v10.4M8.2 10.8L12 14.6l3.8-3.8M5 19.4h14",
  },
  {
    key: "upload",
    cat: "tech",
    labelNl: "Upload",
    labelEn: "Upload",
    path: "M12 14.6V4.2M8.2 8L12 4.2 15.8 8M5 19.4h14",
  },
  {
    key: "key",
    cat: "tech",
    labelNl: "Sleutel",
    labelEn: "Key",
    path: "M15 3.8a5.2 5.2 0 1 0-4.4 8L4 18.2v2.6h2.6v-2H9v-2.2h2.2l1.3-1.3A5.2 5.2 0 0 0 15 3.8M16.4 8.2h.01",
  },
  {
    key: "lock",
    cat: "tech",
    labelNl: "Beveiligd",
    labelEn: "Secure",
    path: "M7 11V8a5 5 0 0 1 10 0v3M5.5 11h13a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1h-13a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1",
  },
  {
    key: "shield",
    cat: "tech",
    labelNl: "Privacy",
    labelEn: "Privacy",
    path: "M12 3.4l7.2 2.6v5.6c0 4.3-3 7.6-7.2 9.2-4.2-1.6-7.2-4.9-7.2-9.2V6zM9.2 12.2l2 2 3.8-4",
  },
  {
    key: "settings",
    cat: "tech",
    labelNl: "Instellingen",
    labelEn: "Settings",
    path: "M12 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5M19 12a7 7 0 0 0-.13-1.3l1.7-1.3-2-3.4-2 .8a7 7 0 0 0-2.27-1.3L13.8 3h-3.6l-.3 2.2a7 7 0 0 0-2.27 1.3l-2-.8-2 3.4 1.7 1.3A7 7 0 0 0 5 12c0 .44.05.87.13 1.3l-1.7 1.3 2 3.4 2-.8c.68.55 1.45.99 2.27 1.3l.3 2.2h3.6l.3-2.2a7 7 0 0 0 2.27-1.3l2 .8 2-3.4-1.7-1.3c.08-.43.13-.86.13-1.3",
  },
  {
    key: "sliders",
    cat: "tech",
    labelNl: "Configuratie",
    labelEn: "Configuration",
    path: "M4 8.2h8.4M16.4 8.2H20M4 15.8h4M12 15.8h8M14.4 6a2.2 2.2 0 1 0 0 4.4 2.2 2.2 0 0 0 0-4.4M10 13.6a2.2 2.2 0 1 0 0 4.4 2.2 2.2 0 0 0 0-4.4",
  },
  {
    key: "wifi",
    cat: "tech",
    labelNl: "Netwerk",
    labelEn: "Network",
    path: "M3.4 9.4a13 13 0 0 1 17.2 0M6.4 12.8a8.6 8.6 0 0 1 11.2 0M9.4 16.2a4.2 4.2 0 0 1 5.2 0M12 19.6h.01",
  },
  {
    key: "plug",
    cat: "tech",
    labelNl: "Koppeling",
    labelEn: "Integration",
    path: "M9 3.4v4.8M15 3.4v4.8M6.6 8.2h10.8v2.8a5.4 5.4 0 0 1-10.8 0zM12 16.4v4.2",
  },
  {
    key: "layers",
    cat: "tech",
    labelNl: "Lagen",
    labelEn: "Layers",
    path: "M12 3.4l8 4.2-8 4.2-8-4.2zM4.4 12l7.6 4 7.6-4M4.4 16.2l7.6 4 7.6-4",
  },
  {
    key: "qr",
    cat: "tech",
    labelNl: "QR-code",
    labelEn: "QR code",
    path: "M4.4 4.4h5.2v5.2H4.4zM14.4 4.4h5.2v5.2h-5.2zM4.4 14.4h5.2v5.2H4.4zM14.4 14.4h2.2v2.2h-2.2zM17.4 17.4h2.2v2.2h-2.2zM14.4 19.6h.01M19.6 14.4h.01",
  },

  // --- Kring & campus ---
  {
    key: "graduation",
    cat: "kring",
    labelNl: "Studie",
    labelEn: "Studies",
    path: "M12 4l8.5 3.8L12 11.6 3.5 7.8zM7.4 9.9v4.6c0 1.4 2.1 2.6 4.6 2.6s4.6-1.2 4.6-2.6V9.9M20 8.4v5.2",
  },
  {
    key: "building",
    cat: "kring",
    labelNl: "Gebouw",
    labelEn: "Building",
    path: "M5 20V5a1 1 0 0 1 1-1h7.5a1 1 0 0 1 1 1v15M14.5 20V9.4h3.5a1 1 0 0 1 1 1V20M3.5 20h17M8 8h3.5M8 11.6h3.5M8 15.2h3.5",
  },
  {
    key: "shop",
    cat: "kring",
    labelNl: "Winkel",
    labelEn: "Shop",
    path: "M4 9.6h16V19a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1zM4.6 4.4h14.8L21 9.6H3zM9.6 20v-5.4h4.8V20",
  },
  {
    key: "beer",
    cat: "kring",
    labelNl: "Theokot",
    labelEn: "Bar",
    path: "M6.2 6.4h8.6v13.2H6.2zM14.8 9.2h2.6a1.6 1.6 0 0 1 1.6 1.6v3a1.6 1.6 0 0 1-1.6 1.6h-2.6M6.2 9.6h8.6M9 11.8v4.6M12 11.8v4.6",
  },
  {
    key: "coffee",
    cat: "kring",
    labelNl: "Koffie",
    labelEn: "Coffee",
    path: "M4 8.4h12v6.2a4.4 4.4 0 0 1-4.4 4.4H8.4A4.4 4.4 0 0 1 4 14.6zM16 10.4h1.8a2.6 2.6 0 0 1 0 5.2H16M3.6 21.2h13",
  },
  {
    key: "food",
    cat: "kring",
    labelNl: "Eten",
    labelEn: "Food",
    path: "M6.4 3.4v5.4a2.2 2.2 0 0 0 4.4 0V3.4M8.6 11v9.6M16.8 3.4c-1.3 1.4-2 3.2-2 5.2 0 1.7.8 2.7 2 2.7v9.3",
  },
  {
    key: "truck",
    cat: "kring",
    labelNl: "Logistiek",
    labelEn: "Logistics",
    path: "M3.5 6.6a1 1 0 0 1 1-1h9.2a1 1 0 0 1 1 1v9.4H3.5zM14.7 9.6h3.4l2.4 3v3.4h-5.8zM7.6 19a1.8 1.8 0 1 0 0-3.6 1.8 1.8 0 0 0 0 3.6M17.4 19a1.8 1.8 0 1 0 0-3.6 1.8 1.8 0 0 0 0 3.6",
  },
  {
    key: "box",
    cat: "kring",
    labelNl: "Materiaal",
    labelEn: "Equipment",
    path: "M12 3.4l8 4v9.2l-8 4-8-4V7.4zM4.2 7.5l7.8 4 7.8-4M12 11.5v9.1M8 5.4l8 4",
  },
  {
    key: "leaf",
    cat: "kring",
    labelNl: "Duurzaam",
    labelEn: "Sustainability",
    path: "M20 4C10 4 4.6 8 4.6 14.4c0 2 .7 3.6 1.8 4.8 1.7-3.3 4.6-6.3 9.6-7.8-3.8 2.2-6.6 5-8 9 1 .4 2 .6 3 .6 6 0 9-5.6 9-17z",
  },
  {
    key: "rocket",
    cat: "kring",
    labelNl: "Lancering",
    labelEn: "Launch",
    path: "M12 3.2c3 2.5 4.6 6 4.6 9.6L14.2 16H9.8l-2.4-3.2C7.4 9.2 9 5.7 12 3.2M12 8.2a1.6 1.6 0 1 0 0 3.2 1.6 1.6 0 0 0 0-3.2M9.8 16l-2.2 2.2 1 2.8 3.4-2 3.4 2 1-2.8-2.2-2.2",
  },
  {
    key: "lightbulb",
    cat: "kring",
    labelNl: "Idee",
    labelEn: "Idea",
    path: "M9.4 17h5.2M10.4 20h3.2M12 3.6a5.6 5.6 0 0 0-3.2 10.2V17h6.4v-3.2A5.6 5.6 0 0 0 12 3.6",
  },
  {
    key: "dumbbell",
    cat: "kring",
    labelNl: "Sport",
    labelEn: "Sports",
    path: "M4 9.6v4.8M6.6 7.4v9.2M17.4 7.4v9.2M20 9.6v4.8M6.6 12h10.8",
  },
];

export const TILE_ICONS: Array<{
  key: string;
  cat: TileIconCategory;
  labelNl: string;
  labelEn: string;
}> = ICONS.map(({ key, cat, labelNl, labelEn }) => ({ key, cat, labelNl, labelEn }));

const ICON_PATHS: Record<string, ReactNode> = Object.fromEntries(
  ICONS.map((i) => [i.key, <path d={i.path} key={i.key} />]),
);

export function TileIcon({
  name,
  size = 22,
  className,
  style,
}: {
  name: string;
  size?: number;
  className?: string;
  style?: CSSProperties;
}) {
  const key = name in ICON_PATHS ? name : "link";
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={style}
      aria-hidden="true"
    >
      {ICON_PATHS[key]}
    </svg>
  );
}

// -----------------------------------------------------------------------------
// Eigen afbeelding in plaats van een pictogram.
// -----------------------------------------------------------------------------

/** Prefix waaronder de uploadroute tegelafbeeldingen legt. */
export const TILE_IMAGE_PREFIX = "tiles/";

/** Een key uit een ander prefix is geknoei met het verborgen veld. */
export function isTileImageKey(key: string): boolean {
  return key.startsWith(TILE_IMAGE_PREFIX);
}

/** Prepend https:// when the user omits a scheme, otherwise leave untouched. */
export function normalizeUrl(raw: string): string {
  const s = raw.trim();
  if (!s) return s;
  if (/^[a-z][a-z0-9+.-]*:/i.test(s)) return s;
  return `https://${s}`;
}

/**
 * Same-origin media-URL. `publicUrl` uit `lib/storage` doet hetzelfde, maar dat
 * bestand her-exporteert heel `@vtk/storage` (aws-sdk, node) en hoort dus niet
 * in een client-bundel; deze module wordt wél in de browser geladen.
 */
export function tileImageUrl(key: string): string {
  return `/api/media/${key.split("/").map(encodeURIComponent).join("/")}`;
}

/**
 * De gekleurde chip van een tegel: een geüpload logo wanneer er een is, anders
 * het gekozen pictogram. Overal hetzelfde, zodat het dashboard, de beheerlijst
 * en de preview in de bewerker niet uit elkaar kunnen lopen.
 */
export function TileChip({
  icon,
  imageKey,
  color,
  size = 22,
  className,
}: {
  icon: string;
  imageKey?: string | null;
  color: string;
  size?: number;
  className?: string;
}) {
  const c = tileColor(color);
  return (
    <span
      className={"vtk-tile-chip" + (className ? ` ${className}` : "")}
      style={{ background: c.chipBg, color: c.chipFg }}
    >
      {imageKey ? (
        // Geen next/image: de upload perst een tegellogo al tot binnen 128x128 en
        // laat SVG ongemoeid, dus er valt niets meer te winnen. De verhouding
        // verschilt bovendien per logo, dus width/height zou hier een gok zijn.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={tileImageUrl(imageKey)}
          alt=""
          className="vtk-tile-chip-img"
          style={{ width: size + 4, height: size + 4 }}
        />
      ) : (
        <TileIcon name={icon} size={size} />
      )}
    </span>
  );
}

// -----------------------------------------------------------------------------
// Color palette. Each tile renders a colored icon chip; `chipBg`/`chipFg` are
// the chip background and icon color, aligned to the VTK design tokens.
// -----------------------------------------------------------------------------

export type TileColorKey =
  | "navy"
  | "blue"
  | "yellow"
  | "green"
  | "red"
  | "purple"
  | "teal"
  | "slate"
  | "paper";

export const TILE_COLORS: Array<{
  key: TileColorKey;
  labelNl: string;
  labelEn: string;
  chipBg: string;
  chipFg: string;
}> = [
  { key: "navy", labelNl: "Marineblauw", labelEn: "Navy", chipBg: "#0E1A36", chipFg: "#FAFAF7" },
  { key: "blue", labelNl: "Blauw", labelEn: "Blue", chipBg: "#E4ECFB", chipFg: "#1B3C8A" },
  { key: "yellow", labelNl: "Geel", labelEn: "Yellow", chipBg: "#FFD23F", chipFg: "#0A0F1F" },
  { key: "green", labelNl: "Groen", labelEn: "Green", chipBg: "#E1F0E4", chipFg: "#1F6B3A" },
  { key: "red", labelNl: "Rood", labelEn: "Red", chipBg: "#FBE4E4", chipFg: "#A31F1F" },
  { key: "purple", labelNl: "Paars", labelEn: "Purple", chipBg: "#EDE6FB", chipFg: "#5B2EA3" },
  { key: "teal", labelNl: "Turquoise", labelEn: "Teal", chipBg: "#DEF1F0", chipFg: "#13726B" },
  { key: "slate", labelNl: "Grijsblauw", labelEn: "Slate", chipBg: "#E7E9EE", chipFg: "#3A4358" },
  { key: "paper", labelNl: "Papier", labelEn: "Paper", chipBg: "#E6ECF5", chipFg: "#0A0F1F" },
];

const COLOR_MAP = new Map(TILE_COLORS.map((c) => [c.key, c]));

export function tileColor(key: string): { chipBg: string; chipFg: string } {
  return COLOR_MAP.get(key as TileColorKey) ?? COLOR_MAP.get("navy")!;
}

// -----------------------------------------------------------------------------
// Merge logic: turn shared (global/group) tiles + per-user prefs + personal
// tiles into a single ordered list of effective tiles for one user.
// -----------------------------------------------------------------------------

export type TileSource = "global" | "group" | "personal";

export type EffectiveTile = {
  /** Stable React/payload key. */
  key: string;
  /** Underlying DashboardTile id. */
  tileId: string;
  source: TileSource;
  label: string;
  url: string;
  icon: string;
  color: string;
  /** Storage-key van een eigen logo; wint van `icon` wanneer gezet. */
  imageKey: string | null;
  order: number;
  /** Whether this tile is currently hidden for the user (shared tiles only). */
  hidden: boolean;
  /** Shared tile has a per-user display override. */
  overridden: boolean;
  /** Group id + label, for the group section on the dashboard. */
  groupId?: string | null;
  groupLabel?: string;
};

type SharedTileRow = {
  id: string;
  label: string;
  url: string;
  icon: string;
  color: string;
  imageKey: string | null;
  order: number;
  scope: "GLOBAL" | "GROUP" | "USER" | string;
  groupId: string | null;
  groupLabel?: string;
};

type PersonalTileRow = {
  id: string;
  label: string;
  url: string;
  icon: string;
  color: string;
  imageKey: string | null;
  order: number;
};

type PrefRow = {
  tileId: string;
  hidden: boolean;
  order: number | null;
  label: string | null;
  url: string | null;
  icon: string | null;
  color: string | null;
  imageKey: string | null;
  imageCleared: boolean;
};

export function mergeTiles(
  sharedTiles: SharedTileRow[],
  prefs: PrefRow[],
  personalTiles: PersonalTileRow[]
): EffectiveTile[] {
  const prefByTile = new Map(prefs.map((p) => [p.tileId, p]));

  const shared: EffectiveTile[] = sharedTiles.map((t) => {
    const pref = prefByTile.get(t.id);
    const overridden =
      !!pref &&
      (pref.label != null ||
        pref.url != null ||
        pref.icon != null ||
        pref.color != null ||
        pref.imageKey != null ||
        pref.imageCleared);
    return {
      key: t.id,
      tileId: t.id,
      source: t.scope === "GROUP" ? "group" : "global",
      label: pref?.label ?? t.label,
      url: pref?.url ?? t.url,
      icon: pref?.icon ?? t.icon,
      color: pref?.color ?? t.color,
      // Een eigen upload wint; `imageCleared` betekent "ik wil hier bewust het
      // pictogram, ook al heeft de standaardtegel een logo".
      imageKey: pref?.imageKey ?? (pref?.imageCleared ? null : t.imageKey),
      order: pref?.order ?? t.order,
      hidden: pref?.hidden ?? false,
      overridden,
      groupId: t.groupId,
      groupLabel: t.groupLabel,
    };
  });

  const personal: EffectiveTile[] = personalTiles.map((t) => ({
    key: `personal:${t.id}`,
    tileId: t.id,
    source: "personal",
    label: t.label,
    url: t.url,
    icon: t.icon,
    color: t.color,
    imageKey: t.imageKey,
    order: t.order,
    hidden: false,
    overridden: false,
  }));

  return [...shared, ...personal].sort(
    (a, b) => a.order - b.order || a.label.localeCompare(b.label)
  );
}

// -----------------------------------------------------------------------------
// Secties per herkomst. Het dashboard groepeert de tegels onder een kop ("Voor
// iedereen", de postnaam, "Van jou") in plaats van ze in één raster te gooien:
// wie in drie posten zit, zag anders niet welke snelkoppeling van wie kwam.
// -----------------------------------------------------------------------------

export type TileSection = {
  /** Stabiele sleutel: "global", "own" of "group:<id>". */
  key: string;
  kind: "global" | "group" | "own";
  /** Postnaam bij een groepssectie. */
  groupLabel?: string;
  tiles: EffectiveTile[];
};

export function groupTilesBySource(tiles: EffectiveTile[]): TileSection[] {
  const global: EffectiveTile[] = [];
  const own: EffectiveTile[] = [];
  const groups = new Map<string, TileSection>();

  for (const tile of tiles) {
    if (tile.source === "personal") {
      own.push(tile);
    } else if (tile.source === "group") {
      // Een groepstegel zonder groupId kan niet bestaan (de scope vereist hem),
      // maar val terug op de globale sectie in plaats van de tegel te laten
      // verdwijnen als de data ooit toch scheef staat.
      const id = tile.groupId;
      if (!id) {
        global.push(tile);
        continue;
      }
      const key = `group:${id}`;
      let section = groups.get(key);
      if (!section) {
        section = { key, kind: "group", groupLabel: tile.groupLabel, tiles: [] };
        groups.set(key, section);
      }
      section.tiles.push(tile);
    } else {
      global.push(tile);
    }
  }

  const sections: TileSection[] = [];
  if (global.length) sections.push({ key: "global", kind: "global", tiles: global });
  sections.push(
    ...[...groups.values()].sort((a, b) =>
      (a.groupLabel ?? "").localeCompare(b.groupLabel ?? "")
    )
  );
  if (own.length) sections.push({ key: "own", kind: "own", tiles: own });
  return sections;
}

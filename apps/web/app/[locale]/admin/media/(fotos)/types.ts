import type { AlbumVisibility } from "@vtk/gallery";

/**
 * Eén rij in de albumlijst links. Enkel wat de lijst toont: dit gaat naar de
 * browser, en de beschrijving of de tabnamen van 144 albums horen daar niet in.
 */
export type LibraryRow = {
  id: string;
  title: string;
  date: string | null;
  photoCount: number;
  /** Openbaar, privé (enkel via het adres) of verborgen. */
  visibility: AlbumVisibility;
  hidden: boolean;
  coverAssetId: string | null;
  /** 0 wanneer het album geen tabs heeft. */
  tabCount: number;
  /** Het werkingsjaar (startjaar) van de datum, om de lijst in te delen. */
  workingYear: number | null;
  /** Heeft het album minstens één privélink die nog werkt? */
  shared: boolean;
};

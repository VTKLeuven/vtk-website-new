import type { Locale } from '@vtk/i18n';

type LocalizableShift = {
  name: string;
  description: string;
  instructions: string | null;
  nameEn?: string | null;
  descriptionEn?: string | null;
  instructionsEn?: string | null;
};

/**
 * De shift in de taal van de pagina: in het Engels de Engelse naam, beschrijving
 * en uitleg waar die ingevuld zijn, en per veld de Nederlandse waar niet. Een
 * shift van voor er Engelse velden waren, toont dus gewoon wat ze altijd toonde.
 * In het Nederlands verandert er niets.
 */
export function localizeShift<T extends LocalizableShift>(shift: T, locale: Locale): T {
  if (locale === 'nl') return shift;
  const pick = (en: string | null | undefined) => (en && en.trim() ? en : null);
  return {
    ...shift,
    name: pick(shift.nameEn) ?? shift.name,
    description: pick(shift.descriptionEn) ?? shift.description,
    instructions: pick(shift.instructionsEn) ?? shift.instructions,
  };
}

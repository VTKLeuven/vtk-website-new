/** Universiteitsadressen verdwijnen na het afstuderen en zijn geen hersteladres. */
export function isKuLeuvenEmail(email: string): boolean {
  return /@(?:[^@.]+\.)*kuleuven\.be$/i.test(email.trim());
}

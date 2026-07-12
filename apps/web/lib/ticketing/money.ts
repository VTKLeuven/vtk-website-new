export function formatMoney(cents: number, currency = "EUR", locale = "nl-BE"): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
  }).format(cents / 100);
}

export function parseEuroAmount(value: FormDataEntryValue | null): number {
  const normalized = String(value ?? "")
    .trim()
    .replace(/\s/g, "")
    .replace(",", ".");
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) {
    throw new Error("INVALID_AMOUNT");
  }
  const cents = Math.round(Number(normalized) * 100);
  if (!Number.isSafeInteger(cents) || cents < 0) throw new Error("INVALID_AMOUNT");
  return cents;
}

import { z } from "zod";

const text = (max: number) => z.string().trim().max(max).default("");

/**
 * Beide adressen zoals ze uit een formulier komen. De databankvelden zijn
 * nullable voor bestaande profielen, maar elke nieuwe opslag moet een volledig
 * thuisadres bevatten en, behalve bij `noKot`, ook een volledig kotadres.
 */
export const addressSchema = z
  .object({
    noKot: z.boolean().default(false),
    street: text(120),
    houseNumber: text(20),
    bus: text(20),
    postalCode: text(12),
    city: text(120),
    homeStreet: text(120),
    homeHouseNumber: text(20),
    homeBus: text(20),
    homePostalCode: text(12),
    homeCity: text(120),
  })
  .superRefine((data, ctx) => {
    const required: Array<keyof typeof data> = [
      "homeStreet",
      "homeHouseNumber",
      "homePostalCode",
      "homeCity",
      ...(data.noKot
        ? []
        : (["street", "houseNumber", "postalCode", "city"] as Array<keyof typeof data>)),
    ];

    for (const field of required) {
      if (data[field] === "") {
        ctx.addIssue({ code: "custom", path: [field], message: "ADDRESS_REQUIRED" });
      }
    }
  });

export type AddressInput = z.infer<typeof addressSchema>;

export type StoredAddress = {
  noKot: boolean;
  street: string | null;
  houseNumber: string | null;
  bus: string | null;
  postalCode: string | null;
  city: string | null;
  homeStreet: string | null;
  homeHouseNumber: string | null;
  homeBus: string | null;
  homePostalCode: string | null;
  homeCity: string | null;
};

/** Onbetrouwbare formulierdata omzetten naar de invoervorm van `addressSchema`. */
export function addressFieldsFromForm(formData: FormData) {
  return {
    noKot: formData.get("noKot") === "on",
    street: formData.get("street") ?? "",
    houseNumber: formData.get("houseNumber") ?? "",
    bus: formData.get("bus") ?? "",
    postalCode: formData.get("postalCode") ?? "",
    city: formData.get("city") ?? "",
    homeStreet: formData.get("homeStreet") ?? "",
    homeHouseNumber: formData.get("homeHouseNumber") ?? "",
    homeBus: formData.get("homeBus") ?? "",
    homePostalCode: formData.get("homePostalCode") ?? "",
    homeCity: formData.get("homeCity") ?? "",
  };
}

/** Nullable Prisma-waarden terug in dezelfde vorm zetten voor validatie. */
export function addressFieldsFromUser(user: StoredAddress) {
  return {
    noKot: user.noKot,
    street: user.street ?? "",
    houseNumber: user.houseNumber ?? "",
    bus: user.bus ?? "",
    postalCode: user.postalCode ?? "",
    city: user.city ?? "",
    homeStreet: user.homeStreet ?? "",
    homeHouseNumber: user.homeHouseNumber ?? "",
    homeBus: user.homeBus ?? "",
    homePostalCode: user.homePostalCode ?? "",
    homeCity: user.homeCity ?? "",
  };
}

/** Of een bestaand profiel zonder wijzigingen bevestigd mag worden. */
export function hasCompleteAddresses(user: StoredAddress): boolean {
  return addressSchema.safeParse(addressFieldsFromUser(user)).success;
}

/**
 * Gevalideerde adresdata voor Prisma. Bij "geen kot" wissen we een eventueel
 * oud kotadres bewust, zodat de vlag en de feitelijke data niet uiteenlopen.
 */
export function addressUpdate(data: AddressInput) {
  return {
    noKot: data.noKot,
    street: data.noKot ? null : data.street,
    houseNumber: data.noKot ? null : data.houseNumber,
    bus: data.noKot || !data.bus ? null : data.bus,
    postalCode: data.noKot ? null : data.postalCode,
    city: data.noKot ? null : data.city,
    homeStreet: data.homeStreet,
    homeHouseNumber: data.homeHouseNumber,
    homeBus: data.homeBus || null,
    homePostalCode: data.homePostalCode,
    homeCity: data.homeCity,
  };
}

"use client";

import { saveProductCatalogAction } from "@/app/actions/theokot";
import { SaveForm } from "@/components/ui/SaveForm";
import { OfferingRows, type OfferingRow } from "./OfferingRows";

/**
 * Bewerkt de standaardcatalogus (`TheokotProduct`): namen, prijzen, aantallen,
 * foto's, ingrediënten en het "broodje van de week"-slot. Deze waarden zijn het
 * startpunt van elk aanbod bij "Verkoopweek aanmaken". De rijen zelf komen uit
 * {@link OfferingRows}; die post `product-<i>-…` + `productCount`, gelezen door
 * {@link saveProductCatalogAction}.
 */
export function ProductCatalogManager({ nl, initial }: { nl: boolean; initial: OfferingRow[] }) {
  return (
    <SaveForm
      action={saveProductCatalogAction}
      submitLabel={nl ? "Standaardaanbod opslaan" : "Save default offering"}
      savingLabel={nl ? "Bezig met opslaan..." : "Saving..."}
      savedMessage={nl ? "Standaardaanbod opgeslagen" : "Default offering saved"}
      errorMessages={
        nl
          ? { INVALID_IMAGE: "Eén van de foto's is niet geldig. Laad ze opnieuw op." }
          : { INVALID_IMAGE: "One of the photos is not valid. Upload it again." }
      }
      fallbackErrorMessage={nl ? "Opslaan van het aanbod mislukt." : "Saving the offering failed."}
    >
      <OfferingRows nl={nl} initial={initial} prefix="product" countField="productCount" />
    </SaveForm>
  );
}

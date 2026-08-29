/**
 * Zet de waarden uit een `FormData` terug op de velden van een formulier.
 *
 * React 19 reset een `<form action={...}>` automatisch zodra de action klaar
 * is, ook wanneer die action een fout teruggeeft in plaats van iets op te
 * slaan (zie de uitleg bovenaan `components/ui/save-form.tsx`). Deze functie
 * herstelt na zo'n reset wat de gebruiker net intikte, zodat een afgewezen
 * invoer niet ook nog eens verdwijnt.
 */
export function restoreFormValues(form: HTMLFormElement, formData: FormData): void {
  for (const element of Array.from(form.elements)) {
    if (element instanceof HTMLInputElement) {
      restoreInput(element, formData);
    } else if (element instanceof HTMLTextAreaElement) {
      restoreSingleValue(element, formData);
    } else if (element instanceof HTMLSelectElement) {
      restoreSelect(element, formData);
    }
    // Andere elementen in form.elements zijn knoppen (HTMLButtonElement,
    // <input type="submit/button/reset/image">) of fieldsets/objects zonder
    // een waarde om te herstellen; die slaan we bewust over.
  }
}

function restoreInput(element: HTMLInputElement, formData: FormData): void {
  const name = element.name;
  if (!name) return;

  switch (element.type) {
    // Kan je om veiligheidsredenen niet programmatisch zetten.
    case 'file':
      return;
    case 'submit':
    case 'button':
    case 'reset':
    case 'image':
      return;
    case 'checkbox':
    case 'radio': {
      // Een uitgevinkte checkbox staat niet in de FormData: het ontbreken van
      // de waarde is dus net zo betekenisvol als haar aanwezigheid, in
      // tegenstelling tot de tekstvelden hieronder.
      const checkedValues = formData.getAll(name);
      element.checked = checkedValues.includes(element.value);
      return;
    }
    default:
      restoreSingleValue(element, formData);
  }
}

function restoreSingleValue(element: HTMLInputElement | HTMLTextAreaElement, formData: FormData): void {
  const name = element.name;
  if (!name || !formData.has(name)) return; // met rust laten, niet leegmaken
  const value = formData.get(name);
  if (typeof value === 'string') element.value = value;
}

function restoreSelect(element: HTMLSelectElement, formData: FormData): void {
  const name = element.name;
  if (!name) return;

  if (element.multiple) {
    // Zelfde redenering als bij checkboxen: een niet-geselecteerde optie
    // staat niet in de FormData, dus elke optie moet expliciet aan of uit.
    const selectedValues = formData.getAll(name);
    for (const option of Array.from(element.options)) {
      option.selected = selectedValues.includes(option.value);
    }
    return;
  }

  if (!formData.has(name)) return;
  const value = formData.get(name);
  if (typeof value === 'string') element.value = value;
}

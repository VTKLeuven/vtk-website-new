import type { BudgetContent, BudgetTemplate, CostRow, IncomeRow, Section } from './types';

/*
 * De sjablonen waarmee een post een budget start. Standaard volgt het blad van
 * de penning; Cantus volgt het blad van Activiteiten (Live Cantus, BO 12): de
 * zaal komt uit de locatie, de drank is een verdeling met water als rest, en
 * het inkom hangt af van de doelgroep.
 */

export function newId(): string {
  return Math.random().toString(36).slice(2, 10);
}

function cost(row: Omit<CostRow, 'id'>): CostRow {
  return { id: newId(), ...row };
}

function income(row: Omit<IncomeRow, 'id'>): IncomeRow {
  return { id: newId(), ...row };
}

function base(sections: Section[], params: BudgetContent['params']): BudgetContent {
  return {
    version: 1,
    params,
    info: { date: '', location: '', concept: '' },
    begroting: null,
    vat: null,
    allocation: [{ org: 'VTK', share: 1 }],
    sections,
  };
}

export function templateContent(template: BudgetTemplate, nl: boolean): BudgetContent {
  if (template === 'cantus') {
    const drankId = newId();
    return base(
      [
        {
          id: newId(),
          name: nl ? 'Inkom' : 'Entrance',
          type: 'income',
          rows: [
            income({
              name: nl ? 'Leden' : 'Members',
              count: { type: 'audience', audience: 'leden' },
              price: { type: 'drinks', sectionId: drankId, main: 0, rest: 0 },
            }),
            income({
              name: nl ? 'Niet-leden' : 'Non-members',
              count: { type: 'audience', audience: 'nietleden' },
              price: { type: 'drinks', sectionId: drankId, main: 0, rest: 0 },
            }),
            income({
              name: nl ? 'Praesidiumkorting' : 'Praesidium discount',
              count: { type: 'manual', qty: 0 },
              price: { type: 'manual', value: 0 },
            }),
            income({
              name: nl ? 'Ereleden' : 'Honorary members',
              count: { type: 'audience', audience: 'ereleden' },
              price: { type: 'manual', value: 0 },
            }),
            income({
              name: nl ? 'Genodigden' : 'Guests',
              count: { type: 'audience', audience: 'genodigden' },
              price: { type: 'manual', value: 0 },
              note: nl
                ? 'Uit de praesesbegroting (interne transactie)'
                : "From the president's budget (internal transfer)",
            }),
          ],
        },
        {
          id: newId(),
          name: nl ? 'Zaal' : 'Venue',
          type: 'fixed',
          rows: [
            cost({ name: nl ? 'Huur' : 'Rent', qty: 1, source: { type: 'locatie', field: 'zaal' } }),
            cost({
              name: nl ? 'Licht en geluid' : 'Light and sound',
              qty: 1,
              source: { type: 'locatie', field: 'licht' },
            }),
            cost({ name: nl ? 'Stopselgeld' : 'Corkage', qty: 0, source: { type: 'locatie', field: 'stopsel' } }),
          ],
        },
        { id: newId(), name: nl ? 'Inkleding & varia' : 'Decoration & other', type: 'fixed', rows: [] },
        {
          id: drankId,
          name: nl ? 'Drank' : 'Drinks',
          type: 'variable',
          distribute: true,
          rows: [
            cost({
              name: nl ? 'Bier' : 'Beer',
              pct: 0,
              perPerson: 10,
              perUnit: 175,
              unit: nl ? 'vat' : 'keg',
              source: { type: 'locatie', field: 'vaten' },
            }),
            cost({
              name: 'Sangria',
              pct: 0,
              perPerson: 9,
              perUnit: 6,
              unit: nl ? 'fles' : 'bottle',
              source: { type: 'locatie', field: 'sangria' },
            }),
            cost({ name: nl ? 'Water (de rest)' : 'Water (the rest)', rest: true }),
          ],
        },
      ],
      { persons: 0, guests: 0, memberShare: 0, honoraryShare: 0 }
    );
  }
  if (template === 'fakfeestje') {
    // Het blad "Budget Fakfeestje": wat een promo kost tegenover de gewone
    // verkoop, de inkleding en de dj's. De prijzen van de Fakbar staan niet in
    // de code: de post typt per promo "=verkoopprijs - promoprijs/1,21".
    return base(
      [
        {
          id: newId(),
          name: nl ? "Drankpromo's" : 'Drink promos',
          type: 'fixed',
          rows: [
            cost({
              name: '',
              qty: 0,
              price: 0,
              basis: 'excl',
              productVat: 0.21,
              source: {
                type: 'afspraak',
                note: nl
                  ? 'Verlies per consumptie: de gewone verkoopprijs excl. min de promoprijs excl. (typ "=1,05-0,75/1,21")'
                  : 'Loss per drink: the normal selling price excl. minus the promo price excl.',
              },
            }),
          ],
        },
        { id: newId(), name: nl ? 'Inkleding' : 'Decoration', type: 'fixed', rows: [] },
        { id: newId(), name: "DJ's", type: 'fixed', rows: [] },
        {
          id: newId(),
          name: nl ? 'Tappersdrank en huur' : 'Bar staff drinks and rent',
          type: 'fixed',
          rows: [],
        },
      ],
      { persons: 0 }
    );
  }
  if (template === 'sectornight') {
    // Het blad van Bedrijvenrelaties: bedrijven betalen een deelnameprijs, en
    // de catering rekent op studenten plus vertegenwoordigers.
    const bedrijven = newId();
    return {
      ...base(
        [
          {
            id: newId(),
            name: nl ? 'Deelname bedrijven' : 'Company fees',
            type: 'income',
            rows: [
              income({
                name: nl ? 'Bedrijven' : 'Companies',
                count: { type: 'manual', qty: 0 },
                price: { type: 'manual', value: 0 },
                fx: {
                  qty: nl ? '=[Aantal bedrijven]' : '=[Companies]',
                  price: nl ? '=[Prijs deelname bedrijf]' : '=[Fee per company]',
                },
              }),
            ],
          },
          { id: newId(), name: nl ? 'Vaste kosten' : 'Fixed costs', type: 'fixed', rows: [] },
          {
            id: newId(),
            name: nl ? 'Catering' : 'Catering',
            type: 'variable',
            distribute: false,
            perPerson: 1,
            base: 0,
            fx: {
              base: nl
                ? '=Deelnemers+[Aantal bedrijven]*[Vertegenwoordigers per bedrijf]'
                : '=Participants+[Companies]*[Representatives per company]',
            },
            rows: [],
          },
        ],
        { persons: 0 }
      ),
      params: {
        persons: 0,
        extra: [
          { id: bedrijven, name: nl ? 'Aantal bedrijven' : 'Companies', value: 0, kind: 'number' },
          {
            id: newId(),
            name: nl ? 'Vertegenwoordigers per bedrijf' : 'Representatives per company',
            value: 2,
            kind: 'number',
          },
          { id: newId(), name: nl ? 'Prijs deelname bedrijf' : 'Fee per company', value: 0, kind: 'money' },
        ],
      },
    };
  }
  return base(
    [
      // Niet "Inkomsten": dat is in het blad de regel met de som eronder.
      { id: newId(), name: nl ? 'Inkom' : 'Entrance', type: 'income', rows: [] },
      { id: newId(), name: nl ? 'Vaste kosten' : 'Fixed costs', type: 'fixed', rows: [] },
      {
        id: newId(),
        name: nl ? 'Variabele kosten' : 'Variable costs',
        type: 'variable',
        distribute: true,
        perPerson: 1,
        rows: [],
      },
    ],
    { persons: 0 }
  );
}

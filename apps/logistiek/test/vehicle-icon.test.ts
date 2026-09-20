import { describe, expect, it } from 'vitest';
import { isVehicleIcon, VEHICLE_ICON_LABELS, VEHICLE_ICONS, vehicleIconName } from '../lib/vehicle-icon';

describe('vehicleIconName', () => {
  it('leidt de drie voertuigen van VTK af uit hun code', () => {
    // Dit is wat er getekend werd voor de kolom bestond, en wat een bestaand
    // voertuig met `icon: null` blijft krijgen.
    expect(vehicleIconName({ code: 'kar' })).toBe('van');
    expect(vehicleIconName({ code: 'auto' })).toBe('car');
    expect(vehicleIconName({ code: 'bakfiets' })).toBe('cargobike');
  });

  it('herkent een voertuig dat het team zelf invoerde', () => {
    // De code wordt uit de naam afgeleid, dus een tweede auto heet geen `auto`.
    expect(vehicleIconName({ code: 'tweede-auto-clio' })).toBe('car');
    expect(vehicleIconName({ code: 'bestelwagen-2' })).toBe('car');
    expect(vehicleIconName({ code: 'kleine-bakfiets' })).toBe('cargobike');
  });

  it('tekent een bestelwagen wanneer de naam niets zegt', () => {
    expect(vehicleIconName({ code: 'dockx' })).toBe('van');
    expect(vehicleIconName({ code: '' })).toBe('van');
  });

  it('laat de ingestelde keuze de afleiding overrulen', () => {
    // Precies het geval uit F4.22: een gehuurd busje dat "Dockx" heet.
    expect(vehicleIconName({ code: 'dockx', icon: 'car' })).toBe('car');
    expect(vehicleIconName({ code: 'auto', icon: 'van' })).toBe('van');
  });

  it('valt terug op de afleiding bij een icoon dat niet meer bestaat', () => {
    // Een naam uit de databank is geen enum: haalt iemand een icoon uit de set,
    // dan hoort de planning terug te vallen en niet leeg te blijven.
    expect(vehicleIconName({ code: 'auto', icon: 'tractor' })).toBe('car');
    expect(vehicleIconName({ code: 'auto', icon: '' })).toBe('car');
    expect(vehicleIconName({ code: 'auto', icon: null })).toBe('car');
  });
});

describe('isVehicleIcon', () => {
  it('aanvaardt enkel de namen uit de lijst', () => {
    expect(isVehicleIcon('van')).toBe(true);
    expect(isVehicleIcon('trash')).toBe(false);
    expect(isVehicleIcon(null)).toBe(false);
    expect(isVehicleIcon(42)).toBe(false);
  });
});

describe('VEHICLE_ICON_LABELS', () => {
  it('geeft elk icoon uit de keuzelijst een naam', () => {
    // Een keuzelijst met een lege regel erin is een keuze die je niet kan maken.
    for (const icon of VEHICLE_ICONS) {
      expect(VEHICLE_ICON_LABELS[icon]).toBeTruthy();
    }
  });
});

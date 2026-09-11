import { describe, expect, it } from 'vitest';

describe('karchauffeurs filtering voor transportplanning', () => {
  type Driver = {
    id: string;
    name: string;
    canDriveVan: boolean;
  };

  const pool: Driver[] = [
    { id: 'usr-1', name: 'Alice Van Bestuur', canDriveVan: true },
    { id: 'usr-2', name: 'Bob Auto Alleen', canDriveVan: false },
    { id: 'usr-3', name: 'Charlie Kar', canDriveVan: true },
    { id: 'usr-4', name: 'Dana Postlid Zonder Kar', canDriveVan: false },
  ];

  it('laat enkel karchauffeurs door naar het beschikbaarheidsbord', () => {
    const forBoard = pool.filter((d) => d.canDriveVan);
    expect(forBoard.map((d) => d.name)).toEqual(['Alice Van Bestuur', 'Charlie Kar']);
    expect(forBoard.every((d) => d.canDriveVan)).toBe(true);
  });

  it('sluit autochauffeurs uit', () => {
    const forBoard = pool.filter((d) => d.canDriveVan);
    expect(forBoard.some((d) => d.id === 'usr-2')).toBe(false);
    expect(forBoard.some((d) => d.id === 'usr-4')).toBe(false);
  });
});

describe('availability zoom step calculation', () => {
  function computeStep(dayCount: number, zoom: number): number {
    if (dayCount <= 1) {
      return zoom >= 3 ? 0.5 : zoom >= 1.5 ? 1 : 2;
    }
    if (dayCount <= 7) {
      if (zoom >= 4) return 0.5;
      if (zoom >= 2.5) return 1;
      if (zoom >= 1.5) return 3;
      return 6;
    }
    return zoom >= 4 ? 3 : zoom >= 2 ? 6 : 24;
  }

  it('geeft 6-uurs stappen op zoom 1 voor een weekweergave', () => {
    expect(computeStep(7, 1)).toBe(6);
  });

  it('geeft 3-uurs stappen op zoom 2 voor een weekweergave', () => {
    expect(computeStep(7, 2)).toBe(3);
  });

  it('geeft 1-uurs stappen op zoom 3 voor een weekweergave', () => {
    expect(computeStep(7, 3)).toBe(1);
  });

  it('geeft 30-minuten stappen op zoom 4+ voor maximale precisie', () => {
    expect(computeStep(7, 4)).toBe(0.5);
    expect(computeStep(7, 5)).toBe(0.5);
  });

  it('geeft fijnere stappen voor een dagweergave', () => {
    expect(computeStep(1, 1)).toBe(2);
    expect(computeStep(1, 2)).toBe(1);
    expect(computeStep(1, 3)).toBe(0.5);
  });
});

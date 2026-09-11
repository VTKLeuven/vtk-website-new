'use client';

import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';

type AccountTab = 'vtk' | 'details';

export function AccountTabs({
  locale,
  vtkContent,
  detailsContent,
}: {
  locale: 'nl' | 'en';
  vtkContent: ReactNode;
  detailsContent: ReactNode;
}) {
  const nl = locale === 'nl';
  const idPrefix = useId();
  const [activeTab, setActiveTab] = useState<AccountTab>('vtk');
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const tabs: Array<{ id: AccountTab; label: string }> = [
    { id: 'vtk', label: nl ? 'Mijn VTK' : 'My VTK' },
    { id: 'details', label: nl ? 'Mijn gegevens' : 'My details' },
  ];

  function activateTab(index: number) {
    const tab = tabs[index];
    if (!tab) return;
    setActiveTab(tab.id);
    tabRefs.current[index]?.focus();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let nextIndex: number | null = null;
    if (event.key === 'ArrowRight') nextIndex = (index + 1) % tabs.length;
    if (event.key === 'ArrowLeft') nextIndex = (index - 1 + tabs.length) % tabs.length;
    if (event.key === 'Home') nextIndex = 0;
    if (event.key === 'End') nextIndex = tabs.length - 1;
    if (nextIndex === null) return;

    event.preventDefault();
    activateTab(nextIndex);
  }

  const activeIndex = tabs.findIndex((tab) => tab.id === activeTab);
  const active = tabs[activeIndex] ?? tabs[0];

  return (
    <div>
      <div
        role="tablist"
        aria-label={nl ? 'Onderdelen van mijn account' : 'My account sections'}
        className="grid grid-cols-2 gap-1 rounded-xl border border-vtk-blue/12 bg-vtk-blue-soft/45 p-1"
      >
        {tabs.map((tab, index) => {
          const selected = tab.id === activeTab;
          return (
            <button
              key={tab.id}
              ref={(node) => {
                tabRefs.current[index] = node;
              }}
              id={`${idPrefix}-${tab.id}-tab`}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={`${idPrefix}-${tab.id}-panel`}
              tabIndex={selected ? 0 : -1}
              className={`rounded-lg px-4 py-3 text-sm font-semibold transition ${
                selected ? 'bg-white text-vtk-blue shadow-sm' : 'text-[#5c667f] hover:bg-white/60 hover:text-vtk-ink'
              }`}
              onClick={() => setActiveTab(tab.id)}
              onKeyDown={(event) => handleKeyDown(event, index)}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      <div
        id={`${idPrefix}-${active.id}-panel`}
        role="tabpanel"
        aria-labelledby={`${idPrefix}-${active.id}-tab`}
        tabIndex={0}
        className="mt-6"
      >
        {activeTab === 'vtk' ? vtkContent : detailsContent}
      </div>
    </div>
  );
}

'use client';

import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';

type AccountTab = 'vtk' | 'details';
const TAB_IDS: readonly AccountTab[] = ['vtk', 'details'];

function isAccountTab(value: string | undefined): value is AccountTab {
  return TAB_IDS.includes(value as AccountTab);
}

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
  const panelsRef = useRef<HTMLDivElement>(null);
  const pendingScroll = useRef<{ id: string; tab: AccountTab } | null>(null);
  const tabs: Array<{ id: AccountTab; label: string }> = [
    { id: 'vtk', label: nl ? 'Mijn VTK' : 'My VTK' },
    { id: 'details', label: nl ? 'Mijn gegevens' : 'My details' },
  ];

  // Een anker zoals /account#tickets of #study opent het tabblad waarin dat
  // onderdeel staat en scrolt ernaar; #vtk en #details openen enkel het tabblad.
  // Beide panelen staan daarom altijd in de DOM (het andere `hidden`), zodat
  // elk id op de pagina te vinden is. De lijst staat in docs/account.md.
  useEffect(() => {
    function openFromHash() {
      const id = decodeURIComponent(window.location.hash.slice(1));
      if (!id) return;
      if (isAccountTab(id)) {
        setActiveTab(id);
        return;
      }
      const target = document.getElementById(id);
      const panel = target?.closest<HTMLElement>('[data-account-tab]');
      const tab = panel?.dataset.accountTab;
      if (!target || !panel || !panelsRef.current?.contains(panel) || !isAccountTab(tab)) return;
      if (panel.hidden) {
        // In een `hidden` paneel heeft het doel geen positie: scrol pas nadat
        // het tabblad open staat (het effect hieronder).
        pendingScroll.current = { id, tab };
        setActiveTab(tab);
      } else {
        target.scrollIntoView({ block: 'start' });
      }
    }
    openFromHash();
    window.addEventListener('hashchange', openFromHash);
    return () => window.removeEventListener('hashchange', openFromHash);
  }, []);

  // Wacht tot het juiste tabblad echt open staat. Bij het laden draait dit
  // effect meteen na het vorige, nog op het oude tabblad: toen werd het doel
  // daar al opgebruikt en scrolde een verse /account#study niet.
  useEffect(() => {
    const pending = pendingScroll.current;
    if (!pending || pending.tab !== activeTab) return;
    // Een frame later, zodat het net zichtbare paneel al een layout heeft. Pas
    // daar leegmaken: Strict Mode annuleert het eerste frame via de cleanup.
    const frame = requestAnimationFrame(() => {
      pendingScroll.current = null;
      document.getElementById(pending.id)?.scrollIntoView({ block: 'start' });
    });
    return () => cancelAnimationFrame(frame);
  }, [activeTab]);

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

      <div ref={panelsRef}>
        {tabs.map((tab) => (
          <div
            key={tab.id}
            id={`${idPrefix}-${tab.id}-panel`}
            role="tabpanel"
            aria-labelledby={`${idPrefix}-${tab.id}-tab`}
            data-account-tab={tab.id}
            hidden={tab.id !== activeTab}
            tabIndex={0}
            className="mt-6"
          >
            {tab.id === 'vtk' ? vtkContent : detailsContent}
          </div>
        ))}
      </div>
    </div>
  );
}

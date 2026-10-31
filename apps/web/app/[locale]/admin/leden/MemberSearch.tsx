"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { SearchBar } from "../admin-table";

/**
 * Zoeken in de leden of de ereleden. Zoals op /admin/gebruikers gebeurt het op
 * de server: de term komt na 300 ms in `?zoek=` en de pagina query't ermee. De
 * ledenlijst van een academiejaar telt al snel duizenden faculteitsstudenten,
 * en die horen niet allemaal in de browser om er daar op te filteren.
 */
export function MemberSearch({
  initialQuery,
  placeholder,
  ariaLabel,
}: {
  initialQuery: string;
  placeholder: string;
  ariaLabel: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [query, setQuery] = useState(initialQuery);
  const firstRender = useRef(true);

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    const timer = setTimeout(() => {
      const next = new URLSearchParams(params.toString());
      const term = query.trim();
      if (term) next.set("zoek", term);
      else next.delete("zoek");
      const search = next.toString();
      router.replace(search ? `${pathname}?${search}` : pathname, { scroll: false });
    }, 300);
    return () => clearTimeout(timer);
    // Enkel op een nieuwe term; params en pathname zijn stabiel per render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  return <SearchBar value={query} onChange={setQuery} placeholder={placeholder} ariaLabel={ariaLabel} />;
}

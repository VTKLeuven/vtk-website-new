'use client';

import { useState } from 'react';
import { CategoryThumb } from '@/components/category-thumb';

const mediaUrl = (key: string) => `/api/media/${key.split('/').map(encodeURIComponent).join('/')}`;

export function ItemGallery({ name, keys, categoryName }: { name: string; keys: string[]; categoryName?: string | null }) {
  const [active, setActive] = useState(0);
  if (!keys.length) return <div className="aspect-[16/9] w-full"><CategoryThumb categoryName={categoryName} /></div>;
  return <div>
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img src={mediaUrl(keys[active])} alt={name} className="aspect-[16/9] w-full object-cover" />
    {keys.length > 1 ? <div className="flex gap-2 overflow-x-auto p-3">
      {keys.map((key, index) => <button key={key} type="button" onClick={() => setActive(index)} aria-label={`Toon foto ${index + 1}`} aria-pressed={active === index} className={`h-14 w-16 shrink-0 overflow-hidden rounded-md border-2 ${active === index ? 'border-vtk-yellow' : 'border-transparent'}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}<img src={mediaUrl(key)} alt="" className="h-full w-full object-cover" />
      </button>)}
    </div> : null}
  </div>;
}

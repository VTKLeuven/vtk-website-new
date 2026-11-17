"use client";

import { useState } from "react";
import { QrCode } from "lucide-react";
import { IconButton, IconLink, RowActions } from "@/components/ui/IconButton";
import { ExternalLinkIcon, PencilIcon } from "@/components/ui/icons";
import { PageQrModal } from "./PageQrModal";

export function PageRowActions({
  host,
  nl,
  base,
  page,
}: {
  host: string;
  nl: boolean;
  base: string;
  page: {
    id: string;
    slug: string;
    title: string;
    published: boolean;
  };
}) {
  const [qrOpen, setQrOpen] = useState(false);

  return (
    <>
      <RowActions>
        {page.published && (
          <IconLink
            href={`${base}/p/${page.slug}`}
            target="_blank"
            label={nl ? "Bekijk pagina" : "View page"}
            srLabel={`${nl ? "Bekijk pagina" : "View page"}: ${page.title}`}
          >
            <ExternalLinkIcon />
          </IconLink>
        )}
        <IconButton
          label={nl ? "QR-code maken" : "Create QR code"}
          srLabel={`${nl ? "QR-code maken" : "Create QR code"}: ${page.title}`}
          onClick={() => setQrOpen(true)}
        >
          <QrCode size={16} aria-hidden="true" />
        </IconButton>
        <IconLink
          href={`${base}/admin/paginas/${page.id}`}
          label={nl ? "Bewerken" : "Edit"}
          srLabel={`${nl ? "Bewerken" : "Edit"}: ${page.title}`}
        >
          <PencilIcon />
        </IconLink>
      </RowActions>

      {qrOpen && (
        <PageQrModal
          host={host}
          nl={nl}
          page={page}
          onClose={() => setQrOpen(false)}
        />
      )}
    </>
  );
}

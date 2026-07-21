'use client';

import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Download,
  ExternalLink,
  FileText,
  LoaderCircle,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { useEffect, useId, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';

type MagazineIssue = {
  id: string;
  kind: 'bakske' | 'ir-reeel';
  publicationTitle: string;
  cadence: string;
  issueLabel: string;
  publishedAt: string | null;
  dateLabel: string | null;
  documentUrl: string;
};

type Labels = {
  open: string;
  close: string;
  loadingPreview: string;
  previewError: string;
  viewerTitle: string;
  openNewTab: string;
  download: string;
  viewerFallback: string;
  viewerError: string;
  previousPage: string;
  nextPage: string;
  pageCounter: string;
  archiveTitle: string;
  showArchive: string;
  hideArchive: string;
  zoomIn: string;
  zoomOut: string;
  resetZoom: string;
};

type PdfJs = typeof import('pdfjs-dist');
type PdfRenderTask = { cancel: () => void; promise: Promise<void> };
type PdfDocument = import('pdfjs-dist').PDFDocumentProxy;

let pdfJsPromise: Promise<PdfJs> | null = null;

const PUBLICATION_KINDS = ['bakske', 'ir-reeel'] as const;

function publicationTimestamp(issue: MagazineIssue) {
  if (!issue.publishedAt) return null;
  const timestamp = Date.parse(issue.publishedAt);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function compareIssuesByPublicationDate(left: MagazineIssue, right: MagazineIssue) {
  const leftTimestamp = publicationTimestamp(left);
  const rightTimestamp = publicationTimestamp(right);

  if (leftTimestamp !== null && rightTimestamp !== null) {
    if (leftTimestamp !== rightTimestamp) return rightTimestamp - leftTimestamp;
    return left.id.localeCompare(right.id);
  }
  if (leftTimestamp !== null) return -1;
  if (rightTimestamp !== null) return 1;
  return left.id.localeCompare(right.id);
}

function formatArchiveToggle(label: string, count: number) {
  const formatted = label.replace('{count}', String(count));
  return formatted === label ? `${label} (${count})` : formatted;
}

/**
 * Opties voor elk `getDocument`. `disableAutoFetch` laat pdf.js enkel de stukken
 * ophalen die het echt nodig heeft: zonder dat haalt de lezer eerst de volledige
 * PDF binnen (tientallen MB voor een magazine) voor hij bladzijde 1 kan tonen.
 * Werkt samen met de byte-ranges die `/api/media` sinds kort ondersteunt.
 */
const PDF_LOAD_OPTIONS = {
  disableAutoFetch: true,
  rangeChunkSize: 262144,
} as const;

/** Zoomstappen in de lezer; 1 = precies passend op de breedte. */
const ZOOM_STEPS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3] as const;
const DEFAULT_ZOOM_INDEX = 2;

function loadPdfJs() {
  if (!pdfJsPromise) {
    pdfJsPromise = import('pdfjs-dist').then((pdfjs) => {
      pdfjs.GlobalWorkerOptions.workerSrc = new URL(
        'pdfjs-dist/build/pdf.worker.min.mjs',
        import.meta.url
      ).toString();
      return pdfjs;
    });
  }

  return pdfJsPromise;
}

function PdfThumbnail({ issue, labels }: { issue: MagazineIssue; labels: Labels }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    if (typeof IntersectionObserver === 'undefined') {
      const timeout = globalThis.setTimeout(() => setVisible(true), 0);
      return () => globalThis.clearTimeout(timeout);
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: '240px' }
    );
    observer.observe(root);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!visible) return;

    let disposed = false;
    let renderTask: PdfRenderTask | null = null;
    let loadingTask: { destroy: () => Promise<void> } | null = null;

    async function renderFirstPage() {
      try {
        setStatus('loading');
        const pdfjs = await loadPdfJs();
        if (disposed) return;

        const task = pdfjs.getDocument({ url: issue.documentUrl, ...PDF_LOAD_OPTIONS });
        loadingTask = task;
        const pdf = await task.promise;
        const page = await pdf.getPage(1);
        const canvas = canvasRef.current;
        if (!canvas || disposed) return;

        const baseViewport = page.getViewport({ scale: 1 });
        const cssWidth = 360;
        const cssScale = cssWidth / baseViewport.width;
        const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
        const viewport = page.getViewport({ scale: cssScale * pixelRatio });
        const context = canvas.getContext('2d', { alpha: false });
        if (!context) throw new Error('Canvas is unavailable');

        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        canvas.style.width = `${cssWidth}px`;
        canvas.style.height = `${Math.ceil(viewport.height / pixelRatio)}px`;

        renderTask = page.render({ canvasContext: context, viewport });
        await renderTask.promise;
        if (!disposed) setStatus('ready');
        await pdf.destroy();
        loadingTask = null;
      } catch (error) {
        if (
          !disposed &&
          !(error instanceof Error && error.name === 'RenderingCancelledException')
        ) {
          setStatus('error');
        }
      }
    }

    void renderFirstPage();
    return () => {
      disposed = true;
      renderTask?.cancel();
      void loadingTask?.destroy();
    };
  }, [issue.documentUrl, visible]);

  return (
    <div ref={rootRef} className="vtk-media-magazine-preview" aria-hidden="true">
      <canvas ref={canvasRef} className={status === 'ready' ? 'is-ready' : ''} />
      {status === 'loading' ? (
        <span className="vtk-media-preview-state">
          <LoaderCircle aria-hidden="true" />
          {labels.loadingPreview}
        </span>
      ) : null}
      {status === 'error' ? (
        <span className="vtk-media-preview-state is-error">
          <FileText aria-hidden="true" />
          {labels.previewError}
        </span>
      ) : null}
    </div>
  );
}

function PdfDocumentViewer({ issue, labels }: { issue: MagazineIssue; labels: Labels }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const [document, setDocument] = useState<PdfDocument | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [pageCount, setPageCount] = useState(0);
  const [bounds, setBounds] = useState({ width: 0, height: 0 });
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [zoomIndex, setZoomIndex] = useState<number>(DEFAULT_ZOOM_INDEX);

  useEffect(() => {
    let disposed = false;
    let loadingTask: import('pdfjs-dist').PDFDocumentLoadingTask | null = null;

    async function loadDocument() {
      try {
        const pdfjs = await loadPdfJs();
        if (disposed) return;
        loadingTask = pdfjs.getDocument({ url: issue.documentUrl, ...PDF_LOAD_OPTIONS });
        const loadedDocument = await loadingTask.promise;
        if (disposed) return;
        setDocument(loadedDocument);
        setPageCount(loadedDocument.numPages);
      } catch {
        if (!disposed) setStatus('error');
      }
    }

    void loadDocument();
    return () => {
      disposed = true;
      void loadingTask?.destroy();
    };
  }, [issue.documentUrl]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setBounds({ width, height });
    });
    observer.observe(viewport);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!document || bounds.width <= 0 || bounds.height <= 0) return;

    let disposed = false;
    let renderTask: PdfRenderTask | null = null;

    async function renderPage() {
      try {
        const page = await document!.getPage(pageNumber);
        const canvas = canvasRef.current;
        if (!canvas || disposed) return;

        const baseViewport = page.getViewport({ scale: 1 });
        // Standaard vult de bladzijde de breedte (leesbaar), niet de hoogte; de
        // zoomknoppen vertrekken van die basis.
        const availableWidth = Math.max(bounds.width, 120);
        const cssScale = (availableWidth / baseViewport.width) * ZOOM_STEPS[zoomIndex];
        const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
        const viewport = page.getViewport({ scale: cssScale * pixelRatio });
        const context = canvas.getContext('2d', { alpha: false });
        if (!context) throw new Error('Canvas is unavailable');

        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        canvas.style.width = `${Math.ceil(viewport.width / pixelRatio)}px`;
        canvas.style.height = `${Math.ceil(viewport.height / pixelRatio)}px`;

        renderTask = page.render({ canvasContext: context, viewport });
        await renderTask.promise;
        if (!disposed) setStatus('ready');
      } catch (error) {
        if (
          !disposed &&
          !(error instanceof Error && error.name === 'RenderingCancelledException')
        ) {
          setStatus('error');
        }
      }
    }

    void renderPage();
    return () => {
      disposed = true;
      renderTask?.cancel();
    };
  }, [bounds.height, bounds.width, document, pageNumber, zoomIndex]);

  function selectPage(nextPage: number) {
    setStatus('loading');
    setPageNumber(nextPage);
    viewportRef.current?.scrollTo({ top: 0, left: 0 });
  }

  const counter = labels.pageCounter
    .replace('{current}', String(pageNumber))
    .replace('{total}', String(pageCount));

  return (
    <div className="vtk-media-pdf-viewer" aria-busy={status === 'loading'}>
      <div ref={viewportRef} className="vtk-media-pdf-scroll">
        <div className="vtk-media-pdf-page">
          <canvas
            ref={canvasRef}
            className={status === 'ready' ? 'is-ready' : ''}
            role="img"
            aria-label={`${issue.publicationTitle}, ${counter}`}
          />
        </div>
      </div>
      {status === 'loading' ? (
        <span className="vtk-media-document-loading">
          <LoaderCircle aria-hidden="true" />
          {labels.viewerFallback}
        </span>
      ) : null}
      {status === 'error' ? (
        <span className="vtk-media-document-loading is-error" role="status">
          <FileText aria-hidden="true" />
          {labels.viewerError}
        </span>
      ) : null}
      {pageCount > 0 ? (
        <nav className="vtk-media-pdf-pagination" aria-label={labels.viewerTitle}>
          <button
            type="button"
            onClick={() => selectPage(pageNumber - 1)}
            disabled={pageNumber <= 1}
            title={labels.previousPage}
          >
            <ChevronLeft aria-hidden="true" />
            <span className="vtk-immich-visually-hidden">{labels.previousPage}</span>
          </button>
          <span>{counter}</span>
          <button
            type="button"
            onClick={() => selectPage(pageNumber + 1)}
            disabled={pageNumber >= pageCount}
            title={labels.nextPage}
          >
            <ChevronRight aria-hidden="true" />
            <span className="vtk-immich-visually-hidden">{labels.nextPage}</span>
          </button>
          <span className="vtk-media-pdf-zoom">
            <button
              type="button"
              onClick={() => setZoomIndex((current) => Math.max(0, current - 1))}
              disabled={zoomIndex <= 0}
              title={labels.zoomOut}
            >
              <ZoomOut aria-hidden="true" />
              <span className="vtk-immich-visually-hidden">{labels.zoomOut}</span>
            </button>
            <button
              type="button"
              className="vtk-media-pdf-zoom-level"
              onClick={() => setZoomIndex(DEFAULT_ZOOM_INDEX)}
              title={labels.resetZoom}
            >
              {Math.round(ZOOM_STEPS[zoomIndex] * 100)}%
            </button>
            <button
              type="button"
              onClick={() =>
                setZoomIndex((current) => Math.min(ZOOM_STEPS.length - 1, current + 1))
              }
              disabled={zoomIndex >= ZOOM_STEPS.length - 1}
              title={labels.zoomIn}
            >
              <ZoomIn aria-hidden="true" />
              <span className="vtk-immich-visually-hidden">{labels.zoomIn}</span>
            </button>
          </span>
        </nav>
      ) : null}
    </div>
  );
}

export function MagazineShelf({ issues, labels }: { issues: MagazineIssue[]; labels: Labels }) {
  const [activeIssue, setActiveIssue] = useState<MagazineIssue | null>(null);
  const [expandedKinds, setExpandedKinds] = useState<Record<MagazineIssue['kind'], boolean>>({
    bakske: false,
    'ir-reeel': false,
  });
  const shelfId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const returnFocusRef = useRef<HTMLButtonElement | null>(null);
  const publicationGroups = PUBLICATION_KINDS.map((kind) => ({
    kind,
    issues: issues.filter((issue) => issue.kind === kind).sort(compareIssuesByPublicationDate),
  })).filter((group) => group.issues.length > 0);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!activeIssue || !dialog) return;

    dialog.showModal();
    return () => {
      if (dialog.open) dialog.close();
    };
  }, [activeIssue]);

  function openIssue(issue: MagazineIssue, event: ReactMouseEvent<HTMLButtonElement>) {
    returnFocusRef.current = event.currentTarget;
    setActiveIssue(issue);
  }

  function closeIssue() {
    const dialog = dialogRef.current;
    const returnFocus = returnFocusRef.current;
    if (dialog?.open) dialog.close();
    setActiveIssue(null);
    returnFocus?.focus({ preventScroll: true });
  }

  function toggleArchive(kind: MagazineIssue['kind']) {
    setExpandedKinds((current) => ({
      ...current,
      [kind]: !current[kind],
    }));
  }

  return (
    <>
      <div className="vtk-media-magazine-grid">
        {publicationGroups.map(({ kind, issues: groupIssues }) => {
          const [latestIssue, ...archivedIssues] = groupIssues;
          const expanded = expandedKinds[kind];
          const titleId = `${shelfId}-${kind}-title`;
          const archiveTitleId = `${shelfId}-${kind}-archive-title`;
          const archiveId = `${shelfId}-${kind}-archive`;
          const archiveToggleLabel = expanded
            ? labels.hideArchive
            : formatArchiveToggle(labels.showArchive, archivedIssues.length);

          return (
            <section key={kind} className="vtk-media-publication-group" aria-labelledby={titleId}>
              <article className="vtk-media-magazine-card">
                <button
                  type="button"
                  className="vtk-media-magazine-open"
                  onClick={(event) => openIssue(latestIssue, event)}
                  aria-label={`${labels.open}: ${latestIssue.publicationTitle}, ${latestIssue.issueLabel}`}
                >
                  <PdfThumbnail issue={latestIssue} labels={labels} />
                  <span className="vtk-media-preview-action" aria-hidden="true">
                    <FileText />
                    {labels.open}
                  </span>
                </button>
                <div className="vtk-media-magazine-copy">
                  <div className="vtk-media-magazine-heading">
                    <div>
                      <p>{latestIssue.cadence}</p>
                      <h3 id={titleId}>{latestIssue.publicationTitle}</h3>
                    </div>
                    <FileText aria-hidden="true" />
                  </div>
                  <p className="vtk-media-magazine-issue">{latestIssue.issueLabel}</p>
                  {latestIssue.dateLabel ? (
                    <time dateTime={latestIssue.publishedAt ?? undefined}>
                      {latestIssue.dateLabel}
                    </time>
                  ) : null}
                </div>
              </article>

              {archivedIssues.length > 0 ? (
                <div className="vtk-media-magazine-archive-shell">
                  <button
                    type="button"
                    className="vtk-media-magazine-archive-toggle"
                    aria-expanded={expanded}
                    aria-controls={archiveId}
                    aria-label={`${archiveToggleLabel}: ${latestIssue.publicationTitle}`}
                    onClick={() => toggleArchive(kind)}
                  >
                    <span>{archiveToggleLabel}</span>
                    {expanded ? (
                      <ChevronUp aria-hidden="true" />
                    ) : (
                      <ChevronDown aria-hidden="true" />
                    )}
                  </button>

                  <section
                    id={archiveId}
                    className="vtk-media-magazine-archive"
                    aria-labelledby={`${titleId} ${archiveTitleId}`}
                    hidden={!expanded}
                  >
                    <h4 id={archiveTitleId}>{labels.archiveTitle}</h4>
                    <ul className="vtk-media-magazine-archive-list">
                      {archivedIssues.map((issue) => (
                        <li key={issue.id} className="vtk-media-magazine-archive-item">
                          <button
                            type="button"
                            className="vtk-media-magazine-archive-open"
                            onClick={(event) => openIssue(issue, event)}
                            aria-label={`${labels.open}: ${issue.publicationTitle}, ${issue.issueLabel}`}
                          >
                            <span className="vtk-media-magazine-archive-copy">
                              <strong>{issue.issueLabel}</strong>
                              {issue.dateLabel ? (
                                <time dateTime={issue.publishedAt ?? undefined}>
                                  {issue.dateLabel}
                                </time>
                              ) : null}
                            </span>
                            <FileText aria-hidden="true" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  </section>
                </div>
              ) : null}
            </section>
          );
        })}
      </div>

      {activeIssue ? (
        <dialog
          ref={dialogRef}
          className="vtk-media-document-dialog"
          aria-label={`${labels.viewerTitle}: ${activeIssue.publicationTitle}`}
          onCancel={(event) => {
            event.preventDefault();
            closeIssue();
          }}
          onClick={(event) => {
            if (event.target === event.currentTarget) closeIssue();
          }}
        >
          <div className="vtk-media-document-shell">
            <header className="vtk-media-document-bar">
              <div>
                <strong>{activeIssue.publicationTitle}</strong>
                <span>{activeIssue.issueLabel}</span>
              </div>
              <nav aria-label={labels.viewerTitle}>
                <a
                  href={activeIssue.documentUrl}
                  target="_blank"
                  rel="noreferrer"
                  title={labels.openNewTab}
                >
                  <ExternalLink aria-hidden="true" />
                  <span>{labels.openNewTab}</span>
                </a>
                <a
                  href={activeIssue.documentUrl}
                  download={`${activeIssue.id}.pdf`}
                  title={labels.download}
                >
                  <Download aria-hidden="true" />
                  <span>{labels.download}</span>
                </a>
                <button type="button" onClick={closeIssue} title={labels.close} autoFocus>
                  <X aria-hidden="true" />
                  <span className="vtk-immich-visually-hidden">{labels.close}</span>
                </button>
              </nav>
            </header>
            <div className="vtk-media-document-frame">
              <PdfDocumentViewer key={activeIssue.id} issue={activeIssue} labels={labels} />
            </div>
          </div>
        </dialog>
      ) : null}
    </>
  );
}

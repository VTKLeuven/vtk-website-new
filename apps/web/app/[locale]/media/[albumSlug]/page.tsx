import Link from "next/link";
import { notFound } from "next/navigation";
import { getDictionary, type Locale } from "@vtk/i18n";
import { hasLocale } from "@/lib/locale";
import { getImmichFaceSearchPublicConfig } from "@/lib/immich-face-search";
import { getImmichGalleryAlbum } from "@/lib/immich-gallery";
import { AlbumViewer } from "./AlbumViewer";
import { FaceSearchPanel } from "./FaceSearchPanel";

export const dynamic = "force-dynamic";

function formatAlbumDate(value: string | null, locale: Locale) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat(locale === "nl" ? "nl-BE" : "en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

export default async function MediaAlbumPage({
  params,
}: {
  params: Promise<{ locale: string; albumSlug: string }>;
}) {
  const { locale: localeParam, albumSlug } = await params;
  if (!hasLocale(localeParam)) notFound();
  const locale: Locale = localeParam;
  const dict = getDictionary(locale);
  const base = locale === "nl" ? "" : "/en";

  let album: Awaited<ReturnType<typeof getImmichGalleryAlbum>>;
  try {
    album = await getImmichGalleryAlbum(albumSlug);
  } catch {
    album = null;
  }
  if (!album) notFound();

  const date = formatAlbumDate(album.date, locale);
  const faceSearch = getImmichFaceSearchPublicConfig();
  const viewerLabels = {
    openPhoto: dict.photos.openPhoto,
    close: dict.photos.close,
    previous: dict.photos.previousPhoto,
    next: dict.photos.nextPhoto,
    previousPhoto: dict.photos.previousPhoto,
    nextPhoto: dict.photos.nextPhoto,
    downloadPhoto: dict.photos.downloadPhoto,
    photoCounter: dict.photos.photoCounter,
  };

  return (
    <div className="vtk-page">
      <header className="vtk-page-head">
        <div>
          <div className="vtk-page-kicker">
            <Link className="vtk-link" href={`${base}/media`}>
              {dict.photos.title}
            </Link>
            {" · Media"}
          </div>
          <h1 className="vtk-page-title">{album.title}</h1>
          {album.description ? <p className="vtk-page-subtitle">{album.description}</p> : null}
        </div>
        <div className="page-head-meta">
          <b>{album.photos.length}</b>
          <br />
          {album.photos.length === 1 ? dict.photos.photo : dict.photos.photos}
          {date ? (
            <>
              <br />
              {date}
            </>
          ) : null}
        </div>
      </header>

      <div className="vtk-page-shell vtk-immich-detail-shell">
        {album.photos.length === 0 ? (
          <div className="vtk-card vtk-immich-state">
            <h2>{dict.photos.emptyAlbum}</h2>
          </div>
        ) : (
          <>
            {faceSearch.enabled ? (
              <FaceSearchPanel
                albumSlug={album.slug}
                configured={faceSearch.configured}
                labels={{
                  ...viewerLabels,
                  findMyPhotos: dict.photos.findMyPhotos,
                  faceSearchIntro: dict.photos.faceSearchIntro,
                  search: dict.photos.search,
                  choosePhoto: dict.photos.choosePhoto,
                  takeSelfie: dict.photos.takeSelfie,
                  profilePhoto: dict.photos.profilePhoto,
                  deviceCameraUpload: dict.photos.deviceCameraUpload,
                  selectedProfilePhoto: dict.photos.selectedProfilePhoto,
                  recognitionPhoto: dict.photos.recognitionPhoto,
                  noPhotoSelected: dict.photos.noPhotoSelected,
                  removePhoto: dict.photos.removePhoto,
                  choosePhotoOrSelfie: dict.photos.choosePhotoOrSelfie,
                  selfieSuffix: dict.photos.selfieSuffix,
                  openingCamera: dict.photos.openingCamera,
                  useSelfie: dict.photos.useSelfie,
                  openDeviceCamera: dict.photos.openDeviceCamera,
                  cameraOpenFailed: dict.photos.cameraOpenFailed,
                  cameraNotReady: dict.photos.cameraNotReady,
                  cameraSaveFailed: dict.photos.cameraSaveFailed,
                  consent: dict.photos.faceSearchConsent,
                  start: dict.photos.startFaceSearch,
                  processing: dict.photos.processing,
                  again: dict.photos.again,
                  cancel: dict.photos.cancel,
                  matches: dict.photos.matches,
                  faceProcessing: dict.photos.faceProcessing,
                  faceSearchNotConfigured: dict.photos.faceSearchNotConfigured,
                  faceMatchedSingular: dict.photos.faceMatchedSingular,
                  faceMatchedPlural: dict.photos.faceMatchedPlural,
                  faceNoMatch: dict.photos.faceNoMatch,
                  faceNoIndexedFaces: dict.photos.faceNoIndexedFaces,
                  faceTimeout: dict.photos.faceTimeout,
                  faceMultipleFaces: dict.photos.faceMultipleFaces,
                  faceFailed: dict.photos.faceFailed,
                  faceFileTooLarge: dict.photos.faceFileTooLarge,
                  faceFileType: dict.photos.faceFileType,
                  faceConsentRequired: dict.photos.faceConsentRequired,
                  faceBusy: dict.photos.faceBusy,
                  photo: dict.photos.photo,
                  photos: dict.photos.photos,
                }}
              />
            ) : null}
            <AlbumViewer
              photos={album.photos.map((photo) => ({
                id: photo.id,
                title: photo.title,
                width: photo.width,
                height: photo.height,
                thumbnailUrl: photo.thumbnailUrl,
                previewUrl: photo.previewUrl,
                downloadUrl: photo.downloadUrl,
              }))}
              labels={viewerLabels}
            />
          </>
        )}
      </div>
    </div>
  );
}

-- Een album kan nu ook privé staan (`[gallery-private]`): gepubliceerd, maar
-- enkel op zijn eigen adres. De prullenmand onthoudt dat, zodat terugzetten het
-- niet als openbaar album in het overzicht zet.
--
-- Bestaande rijen krijgen false, en dat is juist: voor deze migratie bestond
-- de stand privé niet, dus geen enkel weggegooid album was privé.
ALTER TABLE "GalleryTrashedAlbum" ADD COLUMN "wasPrivate" BOOLEAN NOT NULL DEFAULT false;

-- De oude hero is weer te kiezen in /admin/home, dus de tabel met de frontpages en
-- de slogans komen terug. 20261029160000_remove_homepage_hero gooide de inhoud weg:
-- de tabel start hier leeg (de site valt dan terug op de standaardteksten en de
-- foto's in public/), en de slogans zijn die uit de fixtures. Bestaat er al een
-- rij met slogans, dan blijft die staan.
--
-- `heroWeek`, `heroWeekNoticeAt` en de permissie `calendar.heroWeek` komen niet
-- terug: voorrang in het weekoverzicht volgt nu de ster (`homeFeaturedAt`).

CREATE TABLE "Frontpage" (
    "id" TEXT NOT NULL,
    "layout" TEXT NOT NULL,
    "values" JSONB NOT NULL DEFAULT '{}',
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT false,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Frontpage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Frontpage_layout_key" ON "Frontpage"("layout");

CREATE INDEX "Frontpage_active_startsAt_endsAt_idx" ON "Frontpage"("active", "startsAt", "endsAt");

ALTER TABLE "Frontpage" ADD CONSTRAINT "Frontpage_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "Setting" ("key", "value", "updatedAt")
VALUES ('home.slogans', '{"enabled": true, "items": [{"id": "opener-ochtend", "nl": "Goeiemorgen, *{firstName}*.", "en": "Good morning, *{firstName}*.", "audience": "members", "opener": true, "window": "morning"}, {"id": "opener-middag", "nl": "Welkom terug, *{firstName}*.", "en": "Welcome back, *{firstName}*.", "audience": "members", "opener": true, "window": "afternoon"}, {"id": "opener-avond", "nl": "Goeieavond, *{firstName}*.", "en": "Good evening, *{firstName}*.", "audience": "members", "opener": true, "window": "evening"}, {"id": "opener-nacht", "nl": "Nog laat bezig, *{firstName}*?", "en": "Still up, *{firstName}*?", "audience": "members", "opener": true, "window": "night"}, {"id": "slogan-thuis", "nl": "De thuis voor\n*ingenieurs*\nin Leuven.", "en": "The home for\n*engineers*\nin Leuven.", "audience": "all", "opener": false, "window": "any"}, {"id": "slogan-glory", "nl": "Glory, glory, *wij zijn VTK!*", "en": "Glory, glory, *we are VTK!*", "audience": "all", "opener": false, "window": "any"}, {"id": "slogan-superieur", "nl": "Ingenieurs zijn *superieur*.", "en": "Engineers are *superior*.", "audience": "all", "opener": false, "window": "any"}, {"id": "slogan-verstand", "nl": "Het verstand zit aan *deze kant*.", "en": "The brains are on *this side*.", "audience": "all", "opener": false, "window": "any"}, {"id": "slogan-staal", "nl": "Wij zijn machines, *wij zijn van staal*.", "en": "We are machines, *we are made of steel*.", "audience": "all", "opener": false, "window": "any"}, {"id": "slogan-100jaar", "nl": "Al meer dan 100 jaar *thuis* in Leuven.", "en": "For over 100 years *at home* in Leuven.", "audience": "all", "opener": false, "window": "any"}, {"id": "slogan-aula-fakbar", "nl": "Van aula tot fakbar, *jouw kring*.", "en": "From lecture hall to fakbar, *your society*.", "audience": "all", "opener": false, "window": "any"}, {"id": "slogan-hoofden-benen", "nl": "Met slimme hoofden en *snelle benen*.", "en": "With sharp minds and *fast legs*.", "audience": "all", "opener": false, "window": "any"}, {"id": "slogan-sfeer", "nl": "Waar is de beste sfeer?\n*V-T-K!*", "en": "Where is the best vibe?\n*V-T-K!*", "audience": "all", "opener": false, "window": "any"}, {"id": "slogan-studeren-fuiven", "nl": "Studeren, fuiven, lopen: *zonder ons hard te forceren*.", "en": "Study, party, run: *without breaking a sweat*.", "audience": "all", "opener": false, "window": "any"}, {"id": "slogan-winnen-feesten", "nl": "Winnen doen we gauw, *feesten doen we trouw*.", "en": "Quick to win, *loyal to the party*.", "audience": "all", "opener": false, "window": "any"}], "intervalSeconds": 8}'::jsonb, CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;

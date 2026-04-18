-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Locale" AS ENUM ('NL', 'EN');

-- CreateEnum
CREATE TYPE "GroupCode" AS ENUM ('ACTIVITEITEN', 'BEDRIJVENRELATIES', 'COMMUNICATIE', 'CULTUUR', 'CURSUSDIENST', 'DEVELOPMENT', 'FAKBAR', 'GROEP5', 'INTERNATIONAAL', 'IT', 'LOGISTIEK', 'ONDERWIJS', 'ONTHAAL', 'SPORT', 'THEOKOT', 'ALGEMEEN');

-- CreateEnum
CREATE TYPE "MembershipRole" AS ENUM ('MEMBER', 'LEAD');

-- CreateEnum
CREATE TYPE "PageAssetKind" AS ENUM ('EMBEDDED_PDF', 'DOWNLOAD');

-- CreateEnum
CREATE TYPE "EventVisibility" AS ENUM ('PUBLIC', 'MEMBERS');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "avatarKey" TEXT,
    "locale" "Locale" NOT NULL DEFAULT 'NL',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "isSuperAdmin" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Group" (
    "id" TEXT NOT NULL,
    "code" "GroupCode" NOT NULL,
    "slug" TEXT NOT NULL,
    "nameNl" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "descriptionNl" TEXT,
    "descriptionEn" TEXT,
    "orderInPraesidium" INTEGER NOT NULL DEFAULT 0,
    "photoKey" TEXT,

    CONSTRAINT "Group_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GroupMembership" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "role" "MembershipRole" NOT NULL DEFAULT 'MEMBER',
    "year" INTEGER,
    "titleNl" TEXT,
    "titleEn" TEXT,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "GroupMembership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Permission" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "labelNl" TEXT NOT NULL,
    "labelEn" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'general',

    CONSTRAINT "Permission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GroupPermission" (
    "groupId" TEXT NOT NULL,
    "permissionId" TEXT NOT NULL,

    CONSTRAINT "GroupPermission_pkey" PRIMARY KEY ("groupId","permissionId")
);

-- CreateTable
CREATE TABLE "Session" (
    "token" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "userAgent" TEXT,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("token")
);

-- CreateTable
CREATE TABLE "HeaderTab" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "labelNl" TEXT NOT NULL,
    "labelEn" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "visible" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "HeaderTab_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Page" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "headerTabId" TEXT,
    "visibleInHeader" BOOLEAN NOT NULL DEFAULT true,
    "titleNl" TEXT NOT NULL,
    "titleEn" TEXT,
    "contentJsonNl" JSONB NOT NULL,
    "contentJsonEn" JSONB,
    "excerptNl" TEXT,
    "excerptEn" TEXT,
    "publishedAt" TIMESTAMP(3),
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Page_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PageAsset" (
    "id" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "kind" "PageAssetKind" NOT NULL,
    "labelNl" TEXT NOT NULL,
    "labelEn" TEXT,
    "sizeBytes" INTEGER,
    "mimeType" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PageAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalendarEvent" (
    "id" TEXT NOT NULL,
    "titleNl" TEXT NOT NULL,
    "titleEn" TEXT,
    "descriptionNl" TEXT,
    "descriptionEn" TEXT,
    "location" TEXT,
    "start" TIMESTAMP(3) NOT NULL,
    "end" TIMESTAMP(3) NOT NULL,
    "allDay" BOOLEAN NOT NULL DEFAULT false,
    "visibility" "EventVisibility" NOT NULL DEFAULT 'PUBLIC',
    "url" TEXT,
    "groupId" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CalendarEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PhotoAlbum" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "titleNl" TEXT NOT NULL,
    "titleEn" TEXT,
    "descriptionNl" TEXT,
    "descriptionEn" TEXT,
    "coverPhotoId" TEXT,
    "eventDate" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PhotoAlbum_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Photo" (
    "id" TEXT NOT NULL,
    "albumId" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "thumbnailKey" TEXT,
    "width" INTEGER,
    "height" INTEGER,
    "sizeBytes" INTEGER,
    "originalName" TEXT,
    "takenAt" TIMESTAMP(3),
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Photo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Poc" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "nameNl" TEXT NOT NULL,
    "nameEn" TEXT,
    "studyTrack" TEXT NOT NULL,
    "descriptionNl" TEXT,
    "descriptionEn" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Poc_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PocRepresentative" (
    "id" TEXT NOT NULL,
    "pocId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "roleNl" TEXT,
    "roleEn" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "PocRepresentative_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Partner" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "logoKey" TEXT NOT NULL,
    "url" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Partner_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Setting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Setting_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Group_code_key" ON "Group"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Group_slug_key" ON "Group"("slug");

-- CreateIndex
CREATE INDEX "GroupMembership_groupId_idx" ON "GroupMembership"("groupId");

-- CreateIndex
CREATE UNIQUE INDEX "GroupMembership_userId_groupId_key" ON "GroupMembership"("userId", "groupId");

-- CreateIndex
CREATE UNIQUE INDEX "Permission_code_key" ON "Permission"("code");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "HeaderTab_code_key" ON "HeaderTab"("code");

-- CreateIndex
CREATE UNIQUE INDEX "HeaderTab_slug_key" ON "HeaderTab"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Page_slug_key" ON "Page"("slug");

-- CreateIndex
CREATE INDEX "Page_headerTabId_idx" ON "Page"("headerTabId");

-- CreateIndex
CREATE INDEX "PageAsset_pageId_idx" ON "PageAsset"("pageId");

-- CreateIndex
CREATE INDEX "CalendarEvent_start_idx" ON "CalendarEvent"("start");

-- CreateIndex
CREATE INDEX "CalendarEvent_groupId_idx" ON "CalendarEvent"("groupId");

-- CreateIndex
CREATE UNIQUE INDEX "PhotoAlbum_slug_key" ON "PhotoAlbum"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "PhotoAlbum_coverPhotoId_key" ON "PhotoAlbum"("coverPhotoId");

-- CreateIndex
CREATE INDEX "Photo_albumId_idx" ON "Photo"("albumId");

-- CreateIndex
CREATE UNIQUE INDEX "Poc_slug_key" ON "Poc"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "PocRepresentative_pocId_userId_key" ON "PocRepresentative"("pocId", "userId");

-- AddForeignKey
ALTER TABLE "GroupMembership" ADD CONSTRAINT "GroupMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupMembership" ADD CONSTRAINT "GroupMembership_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupPermission" ADD CONSTRAINT "GroupPermission_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupPermission" ADD CONSTRAINT "GroupPermission_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "Permission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Page" ADD CONSTRAINT "Page_headerTabId_fkey" FOREIGN KEY ("headerTabId") REFERENCES "HeaderTab"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Page" ADD CONSTRAINT "Page_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PageAsset" ADD CONSTRAINT "PageAsset_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "Page"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarEvent" ADD CONSTRAINT "CalendarEvent_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarEvent" ADD CONSTRAINT "CalendarEvent_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PhotoAlbum" ADD CONSTRAINT "PhotoAlbum_coverPhotoId_fkey" FOREIGN KEY ("coverPhotoId") REFERENCES "Photo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Photo" ADD CONSTRAINT "Photo_albumId_fkey" FOREIGN KEY ("albumId") REFERENCES "PhotoAlbum"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PocRepresentative" ADD CONSTRAINT "PocRepresentative_pocId_fkey" FOREIGN KEY ("pocId") REFERENCES "Poc"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PocRepresentative" ADD CONSTRAINT "PocRepresentative_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "jwks" ADD COLUMN     "alg" TEXT,
ADD COLUMN     "crv" TEXT;

-- AlterTable
ALTER TABLE "oauthAccessToken" ADD COLUMN     "authorizationCodeId" TEXT,
ADD COLUMN     "confirmation" JSONB,
ADD COLUMN     "requestedUserInfoClaims" TEXT[],
ADD COLUMN     "resources" TEXT[],
ADD COLUMN     "revoked" TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "oauthClient" ADD COLUMN     "applicationType" TEXT,
ADD COLUMN     "backchannelLogoutSessionRequired" BOOLEAN,
ADD COLUMN     "backchannelLogoutUri" TEXT,
ADD COLUMN     "clientCredentialsScopes" TEXT[],
ADD COLUMN     "clientDiscoveryId" TEXT,
ADD COLUMN     "dpopBoundAccessTokens" BOOLEAN,
ADD COLUMN     "jwks" TEXT,
ADD COLUMN     "jwksUri" TEXT;

-- AlterTable
ALTER TABLE "oauthConsent" ADD COLUMN     "requestedUserInfoClaims" TEXT[],
ADD COLUMN     "resources" TEXT[];

-- AlterTable
ALTER TABLE "oauthRefreshToken" ADD COLUMN     "authorizationCodeId" TEXT,
ADD COLUMN     "confirmation" JSONB,
ADD COLUMN     "requestedUserInfoClaims" TEXT[],
ADD COLUMN     "resources" TEXT[],
ADD COLUMN     "rotatedAt" TIMESTAMPTZ(3),
ADD COLUMN     "rotationReplayExpiresAt" TIMESTAMPTZ(3),
ADD COLUMN     "rotationReplayResponse" TEXT;

-- CreateTable
CREATE TABLE "oauthResource" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "accessTokenTtl" INTEGER,
    "refreshTokenTtl" INTEGER,
    "signingAlgorithm" TEXT,
    "signingKeyId" TEXT,
    "allowedScopes" TEXT[],
    "customClaims" JSONB,
    "dpopBoundAccessTokensRequired" BOOLEAN,
    "disabled" BOOLEAN,
    "createdAt" TIMESTAMPTZ(3),
    "updatedAt" TIMESTAMPTZ(3),
    "policyVersion" INTEGER,
    "metadata" JSONB,

    CONSTRAINT "oauthResource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "oauthClientResource" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMPTZ(3),

    CONSTRAINT "oauthClientResource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "oauthClientAssertion" (
    "id" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "oauthClientAssertion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "oauthResource_identifier_key" ON "oauthResource"("identifier");

-- CreateIndex
CREATE INDEX "oauthClientResource_resourceId_idx" ON "oauthClientResource"("resourceId");

-- CreateIndex
CREATE UNIQUE INDEX "oauthClientResource_clientId_resourceId_key" ON "oauthClientResource"("clientId", "resourceId");

-- CreateIndex
CREATE INDEX "oauthClientAssertion_expiresAt_idx" ON "oauthClientAssertion"("expiresAt");

-- CreateIndex
CREATE INDEX "oauthAccessToken_authorizationCodeId_idx" ON "oauthAccessToken"("authorizationCodeId");

-- CreateIndex
CREATE INDEX "oauthRefreshToken_authorizationCodeId_idx" ON "oauthRefreshToken"("authorizationCodeId");

-- AddForeignKey
ALTER TABLE "oauthClientResource" ADD CONSTRAINT "oauthClientResource_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "oauthClient"("clientId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oauthClientResource" ADD CONSTRAINT "oauthClientResource_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "oauthResource"("identifier") ON DELETE CASCADE ON UPDATE CASCADE;


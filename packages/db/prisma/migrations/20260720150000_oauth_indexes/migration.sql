-- CreateIndex
CREATE INDEX "oauthAccessToken_clientId_idx" ON "oauthAccessToken"("clientId");
-- CreateIndex
CREATE INDEX "oauthAccessToken_userId_idx" ON "oauthAccessToken"("userId");
-- CreateIndex
CREATE INDEX "oauthAccessToken_sessionId_idx" ON "oauthAccessToken"("sessionId");
-- CreateIndex
CREATE INDEX "oauthAccessToken_refreshId_idx" ON "oauthAccessToken"("refreshId");
-- CreateIndex
CREATE INDEX "oauthAccessToken_expiresAt_idx" ON "oauthAccessToken"("expiresAt");
-- CreateIndex
CREATE INDEX "oauthConsent_clientId_idx" ON "oauthConsent"("clientId");
-- CreateIndex
CREATE INDEX "oauthConsent_userId_idx" ON "oauthConsent"("userId");
-- CreateIndex
CREATE UNIQUE INDEX "oauthRefreshToken_token_key" ON "oauthRefreshToken"("token");
-- CreateIndex
CREATE INDEX "oauthRefreshToken_clientId_idx" ON "oauthRefreshToken"("clientId");
-- CreateIndex
CREATE INDEX "oauthRefreshToken_userId_idx" ON "oauthRefreshToken"("userId");
-- CreateIndex
CREATE INDEX "oauthRefreshToken_sessionId_idx" ON "oauthRefreshToken"("sessionId");
-- CreateIndex
CREATE INDEX "oauthRefreshToken_expiresAt_idx" ON "oauthRefreshToken"("expiresAt");

-- Uniciteit van een toestemming. Niet als @@unique in schema.prisma: Postgres
-- ziet NULL's als onderling verschillend, dus die zou het courante geval
-- (referenceId IS NULL) net niet afdekken.
CREATE UNIQUE INDEX "oauthConsent_client_user_ref_key"
    ON "oauthConsent"("clientId", "userId", COALESCE("referenceId", ''));

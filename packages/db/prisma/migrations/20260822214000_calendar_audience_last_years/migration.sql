-- PostgreSQL enum additions are additive: existing category rows keep their
-- value and no editorial content is created or changed by this migration.
ALTER TYPE "CalendarAudience" ADD VALUE IF NOT EXISTS 'LAST_YEARS';

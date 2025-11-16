-- Add sync token and webhook metadata to connected accounts
ALTER TABLE "ConnectedAccount"
  ADD COLUMN "calendarSyncToken" TEXT,
  ADD COLUMN "calendarChannelId" TEXT,
  ADD COLUMN "calendarChannelToken" TEXT,
  ADD COLUMN "calendarResourceId" TEXT,
  ADD COLUMN "calendarChannelExpiresAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "ConnectedAccount_calendarChannelId_idx"
  ON "ConnectedAccount"("calendarChannelId");

CREATE INDEX IF NOT EXISTS "ConnectedAccount_calendarResourceId_idx"
  ON "ConnectedAccount"("calendarResourceId");

-- Track logical deletions on calendar events
ALTER TABLE "CalendarEvent"
  ADD COLUMN "deletedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "CalendarEvent_userId_deletedAt_idx"
  ON "CalendarEvent"("userId", "deletedAt");



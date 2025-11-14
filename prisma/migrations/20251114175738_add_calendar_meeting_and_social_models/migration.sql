/*
  Warnings:

  - You are about to drop the `GoogleAccount` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "ConnectedProvider" AS ENUM ('GOOGLE_CALENDAR', 'LINKEDIN', 'FACEBOOK');

-- CreateEnum
CREATE TYPE "MeetingPlatform" AS ENUM ('ZOOM', 'GOOGLE_MEET', 'MICROSOFT_TEAMS', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "CalendarEventStatus" AS ENUM ('UPCOMING', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "RecallBotStatus" AS ENUM ('SCHEDULED', 'JOINING', 'IN_CALL', 'DONE', 'FATAL', 'CANCELLED');

-- CreateEnum
CREATE TYPE "MeetingMediaType" AS ENUM ('TRANSCRIPT', 'VIDEO', 'PARTICIPANT_EVENTS', 'AUDIO', 'METADATA');

-- CreateEnum
CREATE TYPE "MeetingMediaStatus" AS ENUM ('PENDING', 'STORED', 'FAILED');

-- CreateEnum
CREATE TYPE "SocialChannel" AS ENUM ('LINKEDIN', 'FACEBOOK');

-- CreateEnum
CREATE TYPE "SocialPostStatus" AS ENUM ('DRAFT', 'READY', 'POSTING', 'POSTED', 'FAILED');

-- DropForeignKey
ALTER TABLE "GoogleAccount" DROP CONSTRAINT "GoogleAccount_userId_fkey";

-- DropTable
DROP TABLE "GoogleAccount";

-- CreateTable
CREATE TABLE "ConnectedAccount" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" "ConnectedProvider" NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "label" TEXT,
    "scopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "expiresAt" TIMESTAMP(3),
    "lastSyncedAt" TIMESTAMP(3),
    "metadata" JSONB,
    "linkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConnectedAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MeetingPreference" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "leadMinutes" INTEGER NOT NULL DEFAULT 10,
    "defaultNotetaker" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MeetingPreference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalendarEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "connectedAccountId" TEXT NOT NULL,
    "externalEventId" TEXT NOT NULL,
    "calendarId" TEXT,
    "calendarTitle" TEXT,
    "title" TEXT,
    "description" TEXT,
    "meetingUrl" TEXT,
    "meetingPlatform" "MeetingPlatform" NOT NULL DEFAULT 'UNKNOWN',
    "startTime" TIMESTAMP(3) NOT NULL,
    "endTime" TIMESTAMP(3) NOT NULL,
    "timezone" TEXT,
    "attendees" JSONB,
    "deduplicationKey" TEXT NOT NULL,
    "status" "CalendarEventStatus" NOT NULL DEFAULT 'UPCOMING',
    "notetakerEnabled" BOOLEAN NOT NULL DEFAULT false,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CalendarEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecallBot" (
    "id" TEXT NOT NULL,
    "calendarEventId" TEXT NOT NULL,
    "status" "RecallBotStatus" NOT NULL DEFAULT 'SCHEDULED',
    "scheduledBy" TEXT,
    "joinAt" TIMESTAMP(3) NOT NULL,
    "meetingUrl" TEXT NOT NULL,
    "meetingPlatform" "MeetingPlatform" NOT NULL DEFAULT 'UNKNOWN',
    "leadTimeMinutes" INTEGER NOT NULL DEFAULT 10,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecallBot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MeetingMedia" (
    "id" TEXT NOT NULL,
    "recallBotId" TEXT NOT NULL,
    "type" "MeetingMediaType" NOT NULL,
    "status" "MeetingMediaStatus" NOT NULL DEFAULT 'PENDING',
    "downloadUrl" TEXT,
    "storagePath" TEXT,
    "expiresAt" TIMESTAMP(3),
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MeetingMedia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MeetingInsight" (
    "id" TEXT NOT NULL,
    "calendarEventId" TEXT NOT NULL,
    "summary" TEXT,
    "followUpEmail" TEXT,
    "actionItems" JSONB,
    "generatedAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MeetingInsight_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Automation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "channel" "SocialChannel" NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "promptTemplate" TEXT NOT NULL,
    "config" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Automation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SocialPost" (
    "id" TEXT NOT NULL,
    "calendarEventId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "automationId" TEXT,
    "channel" "SocialChannel" NOT NULL,
    "content" TEXT NOT NULL,
    "status" "SocialPostStatus" NOT NULL DEFAULT 'DRAFT',
    "error" TEXT,
    "externalPostId" TEXT,
    "publishedAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SocialPost_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ConnectedAccount_userId_provider_idx" ON "ConnectedAccount"("userId", "provider");

-- CreateIndex
CREATE UNIQUE INDEX "ConnectedAccount_provider_providerAccountId_key" ON "ConnectedAccount"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "MeetingPreference_userId_key" ON "MeetingPreference"("userId");

-- CreateIndex
CREATE INDEX "CalendarEvent_userId_startTime_idx" ON "CalendarEvent"("userId", "startTime");

-- CreateIndex
CREATE INDEX "CalendarEvent_deduplicationKey_idx" ON "CalendarEvent"("deduplicationKey");

-- CreateIndex
CREATE UNIQUE INDEX "CalendarEvent_connectedAccountId_externalEventId_key" ON "CalendarEvent"("connectedAccountId", "externalEventId");

-- CreateIndex
CREATE UNIQUE INDEX "RecallBot_calendarEventId_key" ON "RecallBot"("calendarEventId");

-- CreateIndex
CREATE INDEX "MeetingMedia_recallBotId_type_idx" ON "MeetingMedia"("recallBotId", "type");

-- CreateIndex
CREATE INDEX "Automation_userId_channel_idx" ON "Automation"("userId", "channel");

-- CreateIndex
CREATE INDEX "SocialPost_calendarEventId_status_idx" ON "SocialPost"("calendarEventId", "status");

-- CreateIndex
CREATE INDEX "SocialPost_userId_channel_idx" ON "SocialPost"("userId", "channel");

-- AddForeignKey
ALTER TABLE "ConnectedAccount" ADD CONSTRAINT "ConnectedAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingPreference" ADD CONSTRAINT "MeetingPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarEvent" ADD CONSTRAINT "CalendarEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarEvent" ADD CONSTRAINT "CalendarEvent_connectedAccountId_fkey" FOREIGN KEY ("connectedAccountId") REFERENCES "ConnectedAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecallBot" ADD CONSTRAINT "RecallBot_calendarEventId_fkey" FOREIGN KEY ("calendarEventId") REFERENCES "CalendarEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingMedia" ADD CONSTRAINT "MeetingMedia_recallBotId_fkey" FOREIGN KEY ("recallBotId") REFERENCES "RecallBot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingInsight" ADD CONSTRAINT "MeetingInsight_calendarEventId_fkey" FOREIGN KEY ("calendarEventId") REFERENCES "CalendarEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Automation" ADD CONSTRAINT "Automation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocialPost" ADD CONSTRAINT "SocialPost_calendarEventId_fkey" FOREIGN KEY ("calendarEventId") REFERENCES "CalendarEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocialPost" ADD CONSTRAINT "SocialPost_automationId_fkey" FOREIGN KEY ("automationId") REFERENCES "Automation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocialPost" ADD CONSTRAINT "SocialPost_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

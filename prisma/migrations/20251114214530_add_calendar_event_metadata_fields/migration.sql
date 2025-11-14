-- AlterTable
ALTER TABLE "CalendarEvent" ADD COLUMN     "creatorDisplayName" TEXT,
ADD COLUMN     "creatorEmail" TEXT,
ADD COLUMN     "htmlLink" TEXT,
ADD COLUMN     "location" TEXT,
ADD COLUMN     "recurrence" JSONB,
ADD COLUMN     "reminders" JSONB;

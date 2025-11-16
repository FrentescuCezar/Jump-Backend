-- CreateTable
CREATE TABLE "MeetingChatThread" (
    "id" TEXT NOT NULL,
    "calendarEventId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MeetingChatThread_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MeetingChatMessage" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "senderName" TEXT NOT NULL,
    "senderEmail" TEXT,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MeetingChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MeetingChatReceipt" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MeetingChatReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MeetingShare" (
    "id" TEXT NOT NULL,
    "calendarEventId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "invitedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MeetingShare_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MeetingChatThread_calendarEventId_key" ON "MeetingChatThread"("calendarEventId");

-- CreateIndex
CREATE INDEX "MeetingChatThread_calendarEventId_idx" ON "MeetingChatThread"("calendarEventId");

-- CreateIndex
CREATE INDEX "MeetingChatMessage_threadId_createdAt_idx" ON "MeetingChatMessage"("threadId", "createdAt");

-- CreateIndex
CREATE INDEX "MeetingChatReceipt_userId_idx" ON "MeetingChatReceipt"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "MeetingChatReceipt_messageId_userId_key" ON "MeetingChatReceipt"("messageId", "userId");

-- CreateIndex
CREATE INDEX "MeetingShare_calendarEventId_idx" ON "MeetingShare"("calendarEventId");

-- CreateIndex
CREATE UNIQUE INDEX "MeetingShare_calendarEventId_email_key" ON "MeetingShare"("calendarEventId", "email");

-- AddForeignKey
ALTER TABLE "MeetingChatThread" ADD CONSTRAINT "MeetingChatThread_calendarEventId_fkey" FOREIGN KEY ("calendarEventId") REFERENCES "CalendarEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingChatMessage" ADD CONSTRAINT "MeetingChatMessage_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "MeetingChatThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingChatReceipt" ADD CONSTRAINT "MeetingChatReceipt_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "MeetingChatMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingShare" ADD CONSTRAINT "MeetingShare_calendarEventId_fkey" FOREIGN KEY ("calendarEventId") REFERENCES "CalendarEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

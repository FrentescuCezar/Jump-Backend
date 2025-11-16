-- Add onboarding completion tracking and automation preferences

ALTER TABLE "User"
ADD COLUMN "onboardingCompletedAt" TIMESTAMP(3);

CREATE TABLE "AutomationPreference" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "generateTranscripts" BOOLEAN NOT NULL DEFAULT true,
    "createEmailDrafts" BOOLEAN NOT NULL DEFAULT true,
    "generateSocialPosts" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AutomationPreference_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AutomationPreference_userId_key"
  ON "AutomationPreference"("userId");

ALTER TABLE "AutomationPreference"
ADD CONSTRAINT "AutomationPreference_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;


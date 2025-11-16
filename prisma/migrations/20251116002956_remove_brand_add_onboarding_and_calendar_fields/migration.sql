/*
  Warnings:

  - You are about to drop the column `brand` on the `User` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "AutomationPreference" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "User" DROP COLUMN "brand";

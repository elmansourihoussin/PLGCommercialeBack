/*
  Warnings:

  - A unique constraint covering the columns `[tenantId,entityType,entityId,eventKey]` on the table `Notification` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "entityId" TEXT,
ADD COLUMN     "entityType" TEXT,
ADD COLUMN     "eventKey" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Notification_tenantId_entityType_entityId_eventKey_key" ON "Notification"("tenantId", "entityType", "entityId", "eventKey");

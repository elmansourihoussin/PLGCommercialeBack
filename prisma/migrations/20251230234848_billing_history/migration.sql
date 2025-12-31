-- CreateTable
CREATE TABLE "BillingSubscriptionHistory" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "plan" TEXT NOT NULL,
    "status" "SubscriptionStatus" NOT NULL,
    "action" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BillingSubscriptionHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BillingSubscriptionHistory_tenantId_idx" ON "BillingSubscriptionHistory"("tenantId");

-- AddForeignKey
ALTER TABLE "BillingSubscriptionHistory" ADD CONSTRAINT "BillingSubscriptionHistory_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "InvoiceLine" ADD COLUMN     "articleId" TEXT;

-- AlterTable
ALTER TABLE "QuoteLine" ADD COLUMN     "articleId" TEXT;

-- CreateTable
CREATE TABLE "Article" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sku" TEXT,
    "description" TEXT,
    "unitPrice" DECIMAL(12,2) NOT NULL,
    "taxRate" DECIMAL(5,4),
    "stockQty" INTEGER NOT NULL DEFAULT 0,
    "unit" TEXT,
    "isService" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Article_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Article_tenantId_idx" ON "Article"("tenantId");

-- CreateIndex
CREATE INDEX "Article_sku_idx" ON "Article"("sku");

-- CreateIndex
CREATE INDEX "InvoiceLine_articleId_idx" ON "InvoiceLine"("articleId");

-- CreateIndex
CREATE INDEX "QuoteLine_articleId_idx" ON "QuoteLine"("articleId");

-- AddForeignKey
ALTER TABLE "Article" ADD CONSTRAINT "Article_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteLine" ADD CONSTRAINT "QuoteLine_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceLine" ADD CONSTRAINT "InvoiceLine_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article"("id") ON DELETE SET NULL ON UPDATE CASCADE;

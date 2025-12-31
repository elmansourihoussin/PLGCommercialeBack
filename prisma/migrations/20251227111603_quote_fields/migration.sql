-- AlterTable
ALTER TABLE "Quote" ADD COLUMN     "defaultTaxRate" DECIMAL(5,4),
ADD COLUMN     "dueDate" TIMESTAMP(3),
ADD COLUMN     "note" TEXT,
ADD COLUMN     "paymentMethod" TEXT,
ADD COLUMN     "quoteDate" TIMESTAMP(3),
ADD COLUMN     "title" TEXT;

-- AlterTable
ALTER TABLE "QuoteLine" ADD COLUMN     "taxAmount" DECIMAL(12,2),
ADD COLUMN     "taxRate" DECIMAL(5,4);

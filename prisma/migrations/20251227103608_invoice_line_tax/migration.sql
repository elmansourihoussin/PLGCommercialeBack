-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "defaultTaxRate" DECIMAL(5,4);

-- AlterTable
ALTER TABLE "InvoiceLine" ADD COLUMN     "taxAmount" DECIMAL(12,2),
ADD COLUMN     "taxRate" DECIMAL(5,4);

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "dueDate" TIMESTAMP(3),
ADD COLUMN     "invoiceDate" TIMESTAMP(3),
ADD COLUMN     "note" TEXT,
ADD COLUMN     "paymentMethod" TEXT,
ADD COLUMN     "title" TEXT;

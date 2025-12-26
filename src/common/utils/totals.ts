export interface LineInput {
  quantity: number;
  unitPrice: number;
}

export const calculateTotals = (
  lines: LineInput[],
  taxRate: number,
): { subtotal: number; taxAmount: number; total: number } => {
  const subtotal = lines.reduce(
    (sum, line) => sum + line.quantity * line.unitPrice,
    0,
  );
  const taxAmount = subtotal * taxRate;
  const total = subtotal + taxAmount;

  return { subtotal, taxAmount, total };
};

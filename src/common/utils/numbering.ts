export const formatSequenceNumber = (
  prefix: string,
  year: number,
  sequence: number,
) => `${prefix}-${year}-${String(sequence).padStart(4, '0')}`;

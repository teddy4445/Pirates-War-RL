export interface ModelAdapter {
  readonly id: string;
  readonly inputWidth: number;
  readonly outputWidth: number;
  readonly maxBatch: number;
  predict(rows: number[][]): Promise<number[][]>;
  dispose(): void;
}

export function validatePredictionRows(rows: unknown, inputWidth: number, maxBatch: number): asserts rows is number[][] {
  if (!Array.isArray(rows) || rows.length < 1 || rows.length > maxBatch) throw new Error(`Prediction batch must contain 1-${maxBatch} rows.`);
  for (const row of rows) if (!Array.isArray(row) || row.length !== inputWidth || row.some(value => typeof value !== "number" || !Number.isFinite(value))) throw new Error(`Each prediction row must contain ${inputWidth} finite numbers.`);
}

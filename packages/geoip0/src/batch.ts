import type { BatchOptions } from "./types";

export interface ResolvedBatchOptions {
  batchSize: number;
  concurrency: number;
}

export function resolveBatchOptions(
  options: BatchOptions | undefined,
  defaults: ResolvedBatchOptions,
): ResolvedBatchOptions {
  const batchSize = options?.batchSize ?? defaults.batchSize;
  const concurrency = options?.concurrency ?? defaults.concurrency;

  if (!Number.isInteger(batchSize) || batchSize < 1) {
    throw new Error("batchSize must be a positive integer");
  }

  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new Error("concurrency must be a positive integer");
  }

  return { batchSize, concurrency };
}

export function splitBatch<T>(items: readonly T[], batchSize: number): T[][] {
  const batches: T[][] = [];

  for (let index = 0; index < items.length; index += batchSize) {
    batches.push(items.slice(index, index + batchSize));
  }

  return batches;
}

/** Run at most concurrency mapper tasks at a time, preserving input order. */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = Array.from({ length: items.length }) as R[];
  let nextIndex = 0;

  const worker = async (): Promise<void> => {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      results[index] = await mapper(items[index]!, index);
    }
  };

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
}

/** Split input into batches and process at most concurrency batches at a time. */
export async function mapBatches<T, R>(
  items: readonly T[],
  options: ResolvedBatchOptions,
  mapper: (batch: T[], startIndex: number) => Promise<R>,
): Promise<R[]> {
  const batches = splitBatch(items, options.batchSize);
  const results = Array.from({ length: batches.length }) as R[];
  let nextBatch = 0;

  const worker = async (): Promise<void> => {
    while (nextBatch < batches.length) {
      const batchIndex = nextBatch++;
      const startIndex = batchIndex * options.batchSize;
      results[batchIndex] = await mapper(batches[batchIndex]!, startIndex);
    }
  };

  await Promise.all(Array.from({ length: Math.min(options.concurrency, batches.length) }, worker));
  return results;
}

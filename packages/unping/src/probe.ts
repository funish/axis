import type { PingOptions, PingResult, ProbeMetadata } from "./types";

export const DEFAULT_COUNT = 1;
export const DEFAULT_TIMEOUT = 5000;
export const DEFAULT_INTERVAL = 0;

export interface NormalizedProbeOptions {
  count: number;
  timeout: number;
  interval: number;
  size?: number;
}

export interface ProbeContext {
  sequence: number;
  timeout: number;
  size?: number;
}

export type ProbeFunction = (host: string, context: ProbeContext) => Promise<PingResult>;

function assertFinite(name: string, value: number): void {
  if (!Number.isFinite(value)) {
    throw new RangeError(`${name} must be a finite number`);
  }
}

export function normalizeProbeOptions(
  options: PingOptions = {},
  overrides: Partial<NormalizedProbeOptions> = {},
): NormalizedProbeOptions {
  const count = options.count ?? overrides.count ?? DEFAULT_COUNT;
  const timeout = options.timeout ?? overrides.timeout ?? DEFAULT_TIMEOUT;
  const interval = options.interval ?? overrides.interval ?? DEFAULT_INTERVAL;
  const size = options.size ?? overrides.size;

  assertFinite("count", count);
  assertFinite("timeout", timeout);
  assertFinite("interval", interval);

  if (count < 0) {
    throw new RangeError("count must be greater than or equal to 0");
  }
  if (timeout <= 0) {
    throw new RangeError("timeout must be greater than 0");
  }
  if (interval < 0) {
    throw new RangeError("interval must be greater than or equal to 0");
  }
  if (size !== undefined) {
    assertFinite("size", size);
    if (size <= 0) {
      throw new RangeError("size must be greater than 0");
    }
  }

  return {
    count: Math.floor(count),
    timeout,
    interval,
    size,
  };
}

export function delay(ms: number): Promise<void> {
  if (ms <= 0) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    timer.unref?.();
  });
}

/**
 * Runs all probes sequentially and owns only the interval timers. Individual
 * drivers remain responsible for cleaning up sockets and child processes.
 */
export async function runProbeSeries(
  host: string,
  options: PingOptions,
  probe: ProbeFunction,
  defaults: Partial<NormalizedProbeOptions> = {},
): Promise<PingResult[]> {
  const normalized = normalizeProbeOptions(options, defaults);
  const results: PingResult[] = [];

  for (let sequence = 1; sequence <= normalized.count; sequence += 1) {
    if (sequence > 1 && normalized.interval > 0) {
      await delay(normalized.interval);
    }

    const result = await probe(host, {
      sequence,
      timeout: normalized.timeout,
      size: normalized.size,
    });
    results.push({
      ...result,
      sequence: result.sequence ?? sequence,
      timestamp: result.timestamp ?? Date.now(),
    });
  }

  return results;
}

export function metadataFor(result: PingResult, metadata: ProbeMetadata): PingResult {
  return {
    ...result,
    ...metadata,
    metadata: {
      ...result.metadata,
      ...metadata,
    },
  };
}

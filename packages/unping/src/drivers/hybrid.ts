import type { Driver, DriverOptions, PingResult, PingOptions } from "../types";

export interface HybridDriverOptions extends DriverOptions {
  drivers: Driver[];
}

export default function hybridDriver(
  options: HybridDriverOptions,
): Driver<HybridDriverOptions> {
  const { drivers } = options;

  const ping = async (
    host: string,
    opts?: PingOptions,
  ): Promise<PingResult[]> => {
    for (const driver of drivers) {
      try {
        const result = await driver.ping!(host, opts);
        return result;
      } catch {
        // Continue to next driver
        continue;
      }
    }

    throw new Error("All drivers failed");
  };

  return {
    name: "hybrid",
    options,
    ping,
  };
}

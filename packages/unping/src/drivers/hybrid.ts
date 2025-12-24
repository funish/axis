import type { Driver, DriverOptions, PingResult, PingOptions } from "../types";

export interface HybridDriverOptions extends DriverOptions {
  /** Array of drivers to try in order (default: [tcp, http, dns]) */
  drivers?: Driver[];
}

export default function hybridDriver(
  options: HybridDriverOptions = {},
): Driver {
  const { drivers: customDrivers } = options;
  const defaultDrivers = getDefaultDrivers();

  const drivers = customDrivers || defaultDrivers;

  const ping = async (
    host: string,
    opts?: PingOptions,
  ): Promise<PingResult[]> => {
    // Try each driver in order
    const lastError = new Error("All drivers failed");

    for (const driver of drivers) {
      try {
        const result = await driver.ping!(host, opts);
        return result;
      } catch (error) {
        (lastError as any).cause = error;
        continue;
      }
    }

    throw lastError;
  };

  return {
    name: "hybrid",
    options,
    ping,
  };
}

// Get default driver configuration
function getDefaultDrivers(): Driver[] {
  const { default: tcpDriver } = require("./tcp");
  const { default: httpDriver } = require("./http");
  const { default: dnsDriver } = require("./dns");

  return [
    tcpDriver({ port: 80 }),
    httpDriver({ method: "HEAD" }),
    dnsDriver({ type: "A" }),
  ];
}

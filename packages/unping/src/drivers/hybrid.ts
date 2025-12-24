import type { Driver, DriverOptions, PingResult, PingOptions } from "../types";

export interface HybridDriverOptions extends DriverOptions {
  /** Priority order of drivers (default: ["tcp", "http", "dns"]) */
  priority?: Array<"http" | "tcp" | "dns">;
}

export default function hybridDriver(
  options: HybridDriverOptions = {},
): Driver {
  const { priority = ["tcp", "http", "dns"] } = options;

  const ping = async (
    host: string,
    opts?: PingOptions,
  ): Promise<PingResult[]> => {
    // Try each driver in priority order
    const lastError = new Error("All drivers failed");

    for (const driverType of priority) {
      try {
        let driver: Driver;

        switch (driverType) {
          case "http": {
            const { default: httpDriver } = await import("./http");
            driver = httpDriver(options);
            break;
          }
          case "tcp": {
            const { default: tcpDriver } = await import("./tcp");
            driver = tcpDriver(options);
            break;
          }
          case "dns": {
            const { default: dnsDriver } = await import("./dns");
            driver = dnsDriver(options);
            break;
          }
          default:
            continue;
        }

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

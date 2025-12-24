import { Socket } from "net";
import type { Driver, DriverOptions, PingResult, PingOptions } from "../types";

export interface TCPDriverOptions extends DriverOptions {
  /** Target port (default: 80) */
  port?: number;
  /** Connection timeout in ms (default: 5000) */
  connectTimeout?: number;
}

// Export pingOnce for reuse
export async function pingOnceTCP(
  host: string,
  port: number,
  timeout: number,
  sequence: number,
): Promise<PingResult> {
  return new Promise((resolve) => {
    const socket = new Socket();
    const startTime = Date.now();
    let resolved = false;

    const cleanup = () => {
      if (resolved) return;
      resolved = true;
      socket.destroy();
    };

    socket.setTimeout(timeout, () => {
      cleanup();
      resolve({
        host,
        alive: false,
        time: timeout,
        sequence,
      });
    });

    socket.on("connect", () => {
      const time = Date.now() - startTime;
      cleanup();
      resolve({
        host,
        alive: true,
        time,
        sequence,
      });
    });

    socket.on("error", () => {
      cleanup();
      resolve({
        host,
        alive: false,
        time: Date.now() - startTime,
        sequence,
      });
    });

    socket.connect(port, host);
  });
}

export default function tcpDriver(options: TCPDriverOptions = {}): Driver {
  const { port = 80, connectTimeout = 5000 } = options;

  const ping = async (
    host: string,
    opts?: PingOptions,
  ): Promise<PingResult[]> => {
    const count = opts?.count || 1;
    const timeout = opts?.timeout || connectTimeout;
    const results: PingResult[] = [];

    for (let i = 0; i < count; i++) {
      const result = await pingOnceTCP(host, port, timeout, i + 1);
      results.push(result);

      // Add interval if count > 1
      if (i < count - 1 && opts?.interval) {
        await new Promise((resolve) => setTimeout(resolve, opts.interval));
      }
    }

    return results;
  };

  return {
    name: "tcp",
    options,
    ping,
  };
}

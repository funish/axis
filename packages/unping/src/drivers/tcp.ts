import { Socket } from "node:net";

import { classifyError, timeoutError } from "../errors";
import { runProbeSeries } from "../probe";
import type { DriverOptions, PingDriver, PingOptions, PingResult, ProbeErrorInfo } from "../types";

export interface TCPDriverOptions extends DriverOptions {
  /** Target port (default: 80) */
  port?: number;
  /** Legacy alias for timeout; request timeout takes precedence */
  connectTimeout?: number;
}

function finish(socket: Socket, settle: (result: PingResult) => void, result: PingResult): void {
  socket.destroy();
  settle(result);
}

// Exported for reuse by the hybrid driver.
export async function pingOnceTCP(
  host: string,
  port: number,
  timeout: number,
  sequence: number,
): Promise<PingResult> {
  return new Promise((resolve) => {
    const socket = new Socket();
    const startTime = Date.now();
    let settled = false;

    const settle = (result: PingResult) => {
      if (settled) {
        return;
      }
      settled = true;
      finish(socket, resolve, result);
    };

    socket.setTimeout(timeout, () => {
      settle({
        host,
        alive: false,
        time: Math.max(timeout, Date.now() - startTime),
        sequence,
        kind: "tcp",
        method: "tcp",
        error: timeoutError("connect", timeout),
        metadata: {
          port,
        },
      });
    });

    socket.once("connect", () => {
      settle({
        host,
        alive: true,
        time: Date.now() - startTime,
        sequence,
        kind: "tcp",
        method: "tcp",
        metadata: {
          port,
          connectTime: Date.now() - startTime,
        },
      });
    });

    socket.once("error", (error: Error) => {
      const errorInfo: ProbeErrorInfo = classifyError(error, "connect");
      settle({
        host,
        alive: false,
        time: Date.now() - startTime,
        sequence,
        kind: "tcp",
        method: "tcp",
        error: errorInfo,
        metadata: {
          port,
        },
      });
    });

    socket.connect(port, host);
  });
}

export default function tcpDriver(options: TCPDriverOptions = {}): PingDriver<TCPDriverOptions> {
  const { port = 80, connectTimeout = 5000 } = options;

  return {
    name: "tcp",
    options,
    ping: (host: string, pingOptions?: PingOptions): Promise<PingResult[]> =>
      runProbeSeries(
        host,
        pingOptions ?? {},
        (target, context) => pingOnceTCP(target, port, context.timeout, context.sequence),
        { timeout: connectTimeout },
      ),
  };
}

import { spawn } from "node:child_process";
import { platform } from "node:os";

import { classifyError, commandError, timeoutError } from "../errors";
import type { ProbeContext } from "../probe";
import { runProbeSeries } from "../probe";
import type { PingDriver, PingOptions, PingResult, ProbeErrorInfo } from "../types";

export interface ICMPDriverOptions {
  /** Absolute path or command name for the native ping binary (default: platform ping) */
  binaryPath?: string;
  /** Per-platform override used when binaryPath is not supplied */
  platformBinaryPaths?: Partial<Record<NodeJS.Platform, string>>;
}

export interface ICMPSummary {
  sent?: number;
  received?: number;
  loss?: number;
  ttl?: number;
  time?: number;
}

const DEFAULT_BINARY_PATHS: Record<string, string> = {
  darwin: "/sbin/ping",
  linux: "ping",
  win32: "C:\\Windows\\System32\\PING.EXE",
};

const SAFE_HOST_PATTERN = /^[A-Za-z0-9._:%-]{1,253}$/;

export function resolveICMPBinaryPath(
  options: ICMPDriverOptions = {},
  currentPlatform: NodeJS.Platform = platform() as NodeJS.Platform,
): string {
  const configured = options.platformBinaryPaths?.[currentPlatform] ?? options.binaryPath;
  return configured ?? DEFAULT_BINARY_PATHS[currentPlatform] ?? "ping";
}

export function buildICMPArguments(
  currentPlatform: NodeJS.Platform,
  host: string,
  context: ProbeContext,
): string[] {
  if (!SAFE_HOST_PATTERN.test(host) || host.startsWith("-")) {
    throw new RangeError("host must be a hostname or IP address");
  }
  const packetSize = context.size ?? (currentPlatform === "win32" ? 32 : 56);
  if (!Number.isInteger(packetSize) || packetSize <= 0) {
    throw new RangeError("ICMP size must be an integer greater than 0");
  }

  const timeout = Math.ceil(context.timeout);

  if (currentPlatform === "win32") {
    return [
      ...(host.includes(":") ? ["-6"] : []),
      "-n",
      "1",
      "-w",
      String(timeout),
      "-l",
      String(packetSize),
      host,
    ];
  }

  if (currentPlatform === "darwin") {
    return ["-c", "1", "-W", String(timeout), "-s", String(packetSize), host];
  }

  return [
    "-c",
    "1",
    "-W",
    String(Math.max(1, Math.ceil(timeout / 1000))),
    "-s",
    String(packetSize),
    host,
  ];
}

export function parseICMPOutput(output: string): ICMPSummary {
  const summary: ICMPSummary = {};
  const windowsCounts = output.match(
    /(?:Sent|发送)\s*=\s*(\d+).*(?:Received|接收)\s*=\s*(\d+).*(?:Lost|丢失)\s*=\s*(\d+)/s,
  );
  if (windowsCounts) {
    summary.sent = Number(windowsCounts[1]);
    summary.received = Number(windowsCounts[2]);
    summary.loss = Number(windowsCounts[3]);
  } else {
    const unixCounts = output.match(
      /(\d+)\s+packets?\s+transmitted,\s+(\d+)(?:\s+packets?)?\s+received/i,
    );
    if (unixCounts) {
      summary.sent = Number(unixCounts[1]);
      summary.received = Number(unixCounts[2]);
      summary.loss = summary.sent - summary.received;
    }
  }

  const lossRate = output.match(/([\d.]+)%\s+(?:packet\s+)?loss/i);
  if (lossRate && summary.sent === undefined && summary.received === undefined) {
    const loss = Number(lossRate[1]);
    summary.loss = Number.isFinite(loss) ? loss : undefined;
  }

  const ttl = output.match(/\bttl[=:]\s*(\d+)/i);
  if (ttl) {
    summary.ttl = Number(ttl[1]);
  }

  const times = [...output.matchAll(/[=<]\s*(\d+(?:[.,]\d+)?)\s*(?:ms|毫秒)/gi)];
  const lastTime = times.at(-1)?.[1];
  if (lastTime) {
    summary.time = Number(lastTime.replace(",", "."));
  }

  return summary;
}

function resultFromProcess(
  host: string,
  context: ProbeContext,
  binaryPath: string,
  args: string[],
  output: string,
  exitCode: number | null,
  signal: NodeJS.Signals | null,
  timedOut: boolean,
  elapsed: number,
  commandFailure?: unknown,
): PingResult {
  const summary = parseICMPOutput(output);
  const sent = summary.sent ?? 1;
  const received = timedOut
    ? (summary.received ?? 0)
    : (summary.received ?? (exitCode === 0 ? 1 : 0));

  let error: ProbeErrorInfo | undefined;
  if (commandFailure) {
    error = classifyError(commandFailure, "command");
  } else if (timedOut) {
    error = timeoutError("command", context.timeout);
  } else if (signal) {
    error = commandError(`SIGNAL_${signal}`, `Ping process ended with signal ${signal}`);
  } else if (exitCode !== 0) {
    error = commandError(`EXIT_${exitCode}`, `Ping process exited with code ${exitCode}`);
  }

  const alive = !error && exitCode === 0;
  const time = summary.time ?? elapsed;
  const commandArguments = [...args];

  return {
    host,
    alive,
    time,
    sequence: context.sequence,
    kind: "icmp",
    method: "native-ping",
    ttl: summary.ttl,
    sent,
    received,
    loss: Math.max(0, sent - received),
    error,
    metadata: {
      binaryPath,
      commandArguments,
      platform: process.platform,
      driverFailure: commandFailure !== undefined,
      outputSummary: summary,
    },
  };
}

// Exported for reuse and test fixtures.
export async function pingOnceICMP(
  host: string,
  context: ProbeContext,
  binaryPath: string,
  currentPlatform: NodeJS.Platform = platform() as NodeJS.Platform,
): Promise<PingResult> {
  const args = buildICMPArguments(currentPlatform, host, context);
  const child = spawn(binaryPath, args, {
    windowsHide: true,
    shell: false,
    stdio: ["ignore", "pipe", "pipe"],
  });

  const startTime = Date.now();
  let stdout = "";
  let stderr = "";
  let timedOut = false;
  let settled = false;
  let timer: NodeJS.Timeout | undefined;
  let commandFailure: unknown;
  let exitCode: number | null = null;
  let exitSignal: NodeJS.Signals | null = null;

  child.stdout?.setEncoding?.("utf8");
  child.stderr?.setEncoding?.("utf8");
  child.stdout?.on?.("data", (chunk: string) => {
    stdout += chunk;
  });
  child.stderr?.on?.("data", (chunk: string) => {
    stderr += chunk;
  });

  return new Promise((resolve) => {
    const settle = () => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      resolve(
        resultFromProcess(
          host,
          context,
          binaryPath,
          args,
          stdout + stderr,
          exitCode,
          exitSignal,
          timedOut,
          Date.now() - startTime,
          commandFailure,
        ),
      );
    };

    timer = setTimeout(() => {
      timedOut = true;
      child.kill();
      settle();
    }, context.timeout);
    timer.unref?.();

    child.once("error", (error: Error) => {
      commandFailure = error;
      child.kill();
      settle();
    });
    child.once("close", (code: number | null, signal: NodeJS.Signals | null) => {
      exitCode = code;
      exitSignal = signal;
      settle();
    });
  });
}

export default function icmpDriver(options: ICMPDriverOptions = {}): PingDriver<ICMPDriverOptions> {
  const binaryPath = resolveICMPBinaryPath(options);

  return {
    name: "icmp",
    options,
    ping: (host: string, pingOptions?: PingOptions): Promise<PingResult[]> =>
      runProbeSeries(host, pingOptions ?? {}, (target, context) =>
        pingOnceICMP(target, context, binaryPath),
      ),
  };
}

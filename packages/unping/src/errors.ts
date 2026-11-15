import type { ProbeErrorCategory, ProbeErrorInfo } from "./types";

const DNS_CODES = new Set(["EAI_AGAIN", "ENODATA", "ENOTFOUND", "ESERVFAIL", "ETIMEDOUT_DNS"]);

const TLS_PATTERNS = [
  /^CERT_/,
  /^ERR_TLS/,
  /^ERR_SSL/,
  /^DEPTH_ZERO_SELF_SIGNED_CERT$/,
  /^UNABLE_TO_(?:GET_ISSUER|VERIFY)(?:_.*)?$/,
];

function readCode(value: unknown): string | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }
  const code = (value as { code?: unknown }).code;
  return typeof code === "string" && code.length > 0 ? code : undefined;
}

/** Inspects Node.js fetch/socket causes to expose the lowest-level error code. */
export function errorCode(error: unknown): string | undefined {
  const direct = readCode(error);
  if (direct) {
    return direct;
  }

  const cause = error instanceof Error ? error.cause : undefined;
  return readCode(cause);
}

export function classifyError(
  error: unknown,
  fallbackPhase: ProbeErrorInfo["phase"] = "unknown",
): ProbeErrorInfo {
  const code = errorCode(error);
  let category: ProbeErrorCategory = "network";

  if (code && DNS_CODES.has(code)) {
    category = "dns";
  } else if (code && TLS_PATTERNS.some((pattern) => pattern.test(code))) {
    category = "certificate";
  } else if (code === "ENOENT") {
    category = "configuration";
  } else if (error instanceof RangeError) {
    category = "configuration";
  }

  return {
    code,
    message: error instanceof Error ? error.message : String(error),
    category,
    phase: code === "ETIMEDOUT" || code === "UND_ERR_CONNECT_TIMEOUT" ? "timeout" : fallbackPhase,
  };
}

export function timeoutError(phase: ProbeErrorInfo["phase"], timeout: number): ProbeErrorInfo {
  return {
    code: "UNPING_TIMEOUT",
    message: `Probe timed out after ${timeout}ms`,
    category: "timeout",
    phase,
  };
}

export function commandError(code: string, message: string): ProbeErrorInfo {
  return {
    code,
    message,
    category: "command",
    phase: "command",
  };
}

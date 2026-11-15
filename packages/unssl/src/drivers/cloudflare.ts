import type { DriverOptions, UnsslDriver } from "../types";

export interface CloudflareSslDriverOptions extends DriverOptions {}

/** Cloudflare SSL and origin-certificate API binding is not enabled. */
export default function cloudflareSslDriver(
  options: CloudflareSslDriverOptions = {},
): UnsslDriver<CloudflareSslDriverOptions> {
  return {
    name: "cloudflare",
    options,
    dispose: async () => {},
  };
}

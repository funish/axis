import type { DriverOptions, UnsslDriver } from "../types";

export interface ZeroSslDriverOptions extends DriverOptions {}

/** Provider API binding is not enabled. */
export default function zeroSslDriver(
  options: ZeroSslDriverOptions = {},
): UnsslDriver<ZeroSslDriverOptions> {
  return {
    name: "zerossl",
    options,
    dispose: async () => {},
  };
}

import acmeDriver from "./acme";
import type { AcmeDriverOptions } from "./acme";

/** SwissSign Horizon creates one ACME directory URL per tenant profile. */
export interface SwissSignDriverOptions extends Omit<AcmeDriverOptions, "provider"> {
  directoryUrl: AcmeDriverOptions["directoryUrl"];
}

export default function swissSignDriver(options: SwissSignDriverOptions) {
  return acmeDriver({
    ...options,
    provider: "swisssign",
  });
}

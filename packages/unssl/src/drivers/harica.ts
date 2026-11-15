import acmeDriver from "./acme";
import type { AcmeDriverOptions } from "./acme";

/** HARICA creates a provider-specific directory URL for each ACME endpoint. */
export interface HaricaDriverOptions extends Omit<AcmeDriverOptions, "provider"> {
  directoryUrl: AcmeDriverOptions["directoryUrl"];
  externalAccount: AcmeDriverOptions["externalAccount"];
}

export default function haricaDriver(options: HaricaDriverOptions) {
  return acmeDriver({
    ...options,
    provider: "harica",
  });
}

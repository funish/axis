import acmeDriver from "./acme";
import type { AcmeDriverOptions } from "./acme";

export interface EntrustDriverOptions extends Omit<AcmeDriverOptions, "provider" | "directoryUrl"> {
  externalAccount: AcmeDriverOptions["externalAccount"];
}

export default function entrustDriver(options: EntrustDriverOptions) {
  return acmeDriver({
    ...options,
    provider: "entrust",
    directoryUrl: "https://acme.entrust.net/acme2/directory",
  });
}

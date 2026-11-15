import acmeDriver from "./acme";
import type { AcmeDriverOptions } from "./acme";

export interface ActalisDriverOptions extends Omit<AcmeDriverOptions, "provider" | "directoryUrl"> {
  externalAccount: AcmeDriverOptions["externalAccount"];
}

export default function actalisDriver(options: ActalisDriverOptions) {
  return acmeDriver({
    ...options,
    provider: "actalis",
    directoryUrl: "https://acme-api.actalis.com/acme/directory",
  });
}

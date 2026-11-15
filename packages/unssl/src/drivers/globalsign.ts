import acmeDriver from "./acme";
import type { AcmeDriverOptions } from "./acme";

export interface GlobalSignDriverOptions extends Omit<
  AcmeDriverOptions,
  "provider" | "directoryUrl"
> {
  externalAccount: AcmeDriverOptions["externalAccount"];
}

export default function globalSignDriver(options: GlobalSignDriverOptions) {
  return acmeDriver({
    ...options,
    provider: "globalsign",
    directoryUrl: "https://emea.acme.atlas.globalsign.com/directory",
  });
}

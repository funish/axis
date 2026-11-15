import acmeDriver from "./acme";
import type { AcmeDriverOptions } from "./acme";

export interface SectigoDriverOptions extends Omit<AcmeDriverOptions, "provider" | "directoryUrl"> {
  validationType?: "DV" | "OV";
  externalAccount: AcmeDriverOptions["externalAccount"];
}

export default function sectigoDriver(options: SectigoDriverOptions) {
  return acmeDriver({
    ...options,
    provider: "sectigo",
    directoryUrl: `https://acme.sectigo.com/v2/${options.validationType || "DV"}`,
  });
}

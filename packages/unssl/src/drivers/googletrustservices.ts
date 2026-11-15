import acmeDriver from "./acme";
import type { AcmeDriverOptions } from "./acme";

export interface GoogleTrustServicesDriverOptions extends Omit<
  AcmeDriverOptions,
  "provider" | "directoryUrl"
> {
  staging?: boolean;
  externalAccount: AcmeDriverOptions["externalAccount"];
}

export default function googleTrustServicesDriver(options: GoogleTrustServicesDriverOptions) {
  return acmeDriver({
    ...options,
    provider: "googletrustservices",
    directoryUrl: options.staging
      ? "https://dv.acme-v02.test-api.pki.goog/directory"
      : "https://dv.acme-v02.api.pki.goog/directory",
  });
}

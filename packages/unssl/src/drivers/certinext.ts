import acmeDriver from "./acme";
import type { AcmeDriverOptions } from "./acme";

export interface CertiNextDriverOptions extends Omit<
  AcmeDriverOptions,
  "provider" | "directoryUrl"
> {
  environment?: "production" | "sandbox";
  externalAccount: AcmeDriverOptions["externalAccount"];
}

export default function certiNextDriver(options: CertiNextDriverOptions) {
  return acmeDriver({
    ...options,
    provider: "certinext",
    directoryUrl:
      options.environment === "sandbox"
        ? "https://sandbox-us-acme.certinext.io/v1/directory"
        : "https://acme-us.certinext.io/v1/directory",
  });
}

import acmeDriver from "./acme";
import type { AcmeDriverOptions } from "./acme";

export interface ZeroSslAcmeDriverOptions extends Omit<
  AcmeDriverOptions,
  "provider" | "directoryUrl"
> {
  /** ZeroSSL ACME requires EAB credentials generated in the developer console. */
  externalAccount: AcmeDriverOptions["externalAccount"];
}

export default function zeroSslAcmeDriver(options: ZeroSslAcmeDriverOptions) {
  return acmeDriver({
    ...options,
    provider: "zerossl-acme",
    directoryUrl: "https://acme.zerossl.com/v2/DV90",
  });
}

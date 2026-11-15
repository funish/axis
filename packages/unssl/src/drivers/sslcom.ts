import acmeDriver from "./acme";
import type { AcmeDriverOptions } from "./acme";

export interface SslComDriverOptions extends Omit<AcmeDriverOptions, "provider" | "directoryUrl"> {
  algorithm?: "ecc" | "rsa";
  externalAccount?: AcmeDriverOptions["externalAccount"];
}

export default function sslComDriver(options: SslComDriverOptions = {}) {
  return acmeDriver({
    ...options,
    provider: "sslcom",
    directoryUrl:
      options.algorithm === "rsa"
        ? "https://acme.ssl.com/sslcom-dv-rsa"
        : "https://acme.ssl.com/sslcom-dv-ecc",
  });
}

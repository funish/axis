import acmeDriver from "./acme";
import type { AcmeDriverOptions } from "./acme";

export interface CertumDriverOptions extends Omit<AcmeDriverOptions, "provider" | "directoryUrl"> {
  externalAccount: AcmeDriverOptions["externalAccount"];
}

export default function certumDriver(options: CertumDriverOptions) {
  return acmeDriver({
    ...options,
    provider: "certum",
    directoryUrl: "https://acme.certum.pl/directory",
  });
}

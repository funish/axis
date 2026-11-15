import acmeDriver from "./acme";
import type { AcmeDriverOptions } from "./acme";

export interface LetsEncryptDriverOptions extends Omit<
  AcmeDriverOptions,
  "provider" | "directoryUrl"
> {
  staging?: boolean;
}

export default function letsEncryptDriver(options: LetsEncryptDriverOptions = {}) {
  return acmeDriver({
    ...options,
    provider: "letsencrypt",
    directoryUrl: options.staging
      ? "https://acme-staging-v02.api.letsencrypt.org/directory"
      : "https://acme-v02.api.letsencrypt.org/directory",
  });
}

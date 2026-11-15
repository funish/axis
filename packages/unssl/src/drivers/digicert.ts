import acmeDriver from "./acme";
import type { AcmeDriverOptions } from "./acme";

export interface DigiCertDriverOptions extends Omit<
  AcmeDriverOptions,
  "provider" | "directoryUrl"
> {
  /** CertCentral issues a product-specific ACME directory URL. */
  directoryUrl?: AcmeDriverOptions["directoryUrl"];
  region?: "us" | "eu" | "jp";
  externalAccount: AcmeDriverOptions["externalAccount"];
}

const regionalDirectoryUrls = {
  us: "https://one.us.digicert.com/mpki/api/v1/acme/v2/directory",
  eu: "https://one.nl.digicert.com/mpki/api/v1/acme/v2/directory",
  jp: "https://one.digicert.co.jp/mpki/api/v1/acme/v2/directory",
} as const;

export default function digiCertDriver(options: DigiCertDriverOptions) {
  return acmeDriver({
    ...options,
    provider: "digicert",
    directoryUrl: options.directoryUrl || regionalDirectoryUrls[options.region || "us"],
  });
}

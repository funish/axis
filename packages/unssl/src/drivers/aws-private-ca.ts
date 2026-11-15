import acmeDriver from "./acme";
import type { AcmeDriverOptions } from "./acme";

/** AWS ACM exposes an account-specific ACME endpoint and EAB credentials. */
export interface AwsPrivateCaDriverOptions extends Omit<AcmeDriverOptions, "provider"> {
  directoryUrl: AcmeDriverOptions["directoryUrl"];
  externalAccount: AcmeDriverOptions["externalAccount"];
}

export default function awsPrivateCaDriver(options: AwsPrivateCaDriverOptions) {
  return acmeDriver({
    ...options,
    provider: "aws-private-ca",
  });
}

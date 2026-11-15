export type ChallengeType = "http-01" | "dns-01";

export type CertificateStatus = "pending" | "issued" | "revoked" | "expired";

export interface CertificateRequest {
  identifiers: string[];
  csrPem: string;
  validityDays?: number;
  metadata?: Record<string, string>;
  /** Protocol-specific issue callbacks and polling controls. */
  acme?: AcmeIssueOptions;
  /** Provider validation callbacks for non-ACME REST certificate flows. */
  validation?: CertificateValidationOptions;
}

export interface IssuedCertificate {
  id: string;
  certificatePem: string;
  chainPem?: string;
  privateKeyRef: string;
  identifiers: string[];
  status: CertificateStatus;
  expiresAt?: string;
  metadata?: Record<string, string>;
}

export interface DeploymentMetadata {
  certificateId: string;
  provider: string;
  location?: string;
  endpoint?: string;
  properties?: Record<string, string>;
}

export interface Http01Challenge {
  type: "http-01";
  identifier: string;
  token: string;
  keyAuthorization: string;
  content: string;
  path: string;
}

export interface Dns01Challenge {
  type: "dns-01";
  identifier: string;
  token: string;
  keyAuthorization: string;
  recordName: string;
  recordValue: string;
}

export interface HttpFileValidationChallenge {
  type: "http-file";
  identifier: string;
  url?: string;
  path: string;
  content: string;
}

export interface DnsCnameValidationChallenge {
  type: "dns-cname";
  identifier: string;
  recordName: string;
  recordValue: string;
}

export type CertificateChallenge =
  | Http01Challenge
  | Dns01Challenge
  | HttpFileValidationChallenge
  | DnsCnameValidationChallenge;

export interface ChallengeRequest {
  identifier: string;
  type: ChallengeType;
  token?: string;
  keyAuthorization?: string;
}

export interface DnsRecordInput {
  name?: string;
  type: string;
  value?: string;
  entries?: string[];
  ttl?: number;
  [key: string]: unknown;
}

export interface DnsRecord {
  id?: string;
  name?: string;
  type?: string;
  value?: string;
  entries?: string[];
  [key: string]: unknown;
}

/**
 * The minimum DNS surface needed by certificate challenges. An UnDns manager
 * satisfies it; UnSSL itself never binds to a particular DNS provider.
 */
export interface DnsRecordOperations {
  getRecords(
    domain: string,
    options?: { name?: string; type?: string },
  ): DnsRecord[] | Promise<DnsRecord[]>;
  setRecord(domain: string, record: DnsRecordInput): DnsRecord | Promise<DnsRecord>;
  upsertRecord?(domain: string, record: DnsRecordInput): DnsRecord | Promise<DnsRecord>;
  removeRecord(domain: string, record: DnsRecord): void | Promise<void>;
}

export interface StoredKey {
  privateKeyPem: string;
  metadata?: Record<string, string>;
}

/** Storage backends implement this interface; UnSSL does not ship one. */
export interface KeyStorage {
  put(reference: string, key: StoredKey): void | Promise<void>;
  get(reference: string): StoredKey | null | Promise<StoredKey | null>;
  delete(reference: string): void | Promise<void>;
}

export type HttpFetch = (input: string, init?: RequestInit) => Promise<Response>;

export interface AcmeDirectory {
  newNonce: string;
  newAccount: string;
  newOrder: string;
  revokeCert?: string;
  keyChange?: string;
  meta?: Record<string, unknown>;
}

export interface AcmeProtectedHeader {
  alg: string;
  nonce: string;
  url: string;
  jwk?: Record<string, unknown>;
  kid?: string;
}

export interface AcmeJws {
  protected: string;
  payload: string;
  signature: string;
}

/** The caller supplies account-key signing; UnSSL does not handle private keys. */
export interface JwsSigner {
  alg: string;
  sign(
    header: AcmeProtectedHeader,
    payload: string,
  ): Promise<Omit<AcmeJws, "protected" | "payload">>;
}

export interface NonceStore {
  take(): string | undefined | Promise<string | undefined>;
  put(nonce: string): void | Promise<void>;
}

export interface AcmeExternalAccountBinding {
  keyId: string;
  /** Base64url-encoded HMAC key supplied by the CA. */
  hmacKey: string;
  alg?: "HS256" | "HS384" | "HS512";
}

export interface AcmeChallenge {
  type: string;
  url: string;
  token: string;
  status?: string;
  validated?: string;
  error?: { type?: string; detail?: string };
}

export interface AcmeAuthorization {
  identifier: { type: string; value: string };
  status?: string;
  expires?: string;
  wildcard?: boolean;
  challenges?: AcmeChallenge[];
  error?: { type?: string; detail?: string };
}

export interface AcmeOrder {
  status: string;
  url?: string;
  expires?: string;
  finalize?: string;
  certificate?: string;
  identifiers: Array<{ type: string; value: string }>;
  authorizations?: string[];
  error?: { type?: string; detail?: string };
}

export type RevokeReason =
  | "unspecified"
  | "keyCompromise"
  | "caCompromise"
  | "affiliationChanged"
  | "superseded"
  | "cessationOfOperation";

export interface RevokeRequest {
  certificateId?: string;
  certificatePem?: string;
  reason?: RevokeReason;
}

export interface DriverOptions {
  [key: string]: unknown;
}

export type MaybePromise<T> = T | Promise<T>;

export interface CertificateValidationOptions {
  method?: "http-file" | "dns-cname";
  onValidation?: (challenges: CertificateChallenge[]) => Promise<void>;
  onValidationComplete?: (challenges: CertificateChallenge[]) => Promise<void>;
  pollIntervalMs?: number;
  timeoutMs?: number;
}

export interface AcmeIssueOptions {
  preferredChallenge?: ChallengeType;
  onChallenge?: (challenge: CertificateChallenge) => Promise<void>;
  onChallengeComplete?: (challenge: CertificateChallenge) => Promise<void>;
  pollIntervalMs?: number;
  timeoutMs?: number;
}

export interface UnsslDriver<OptionsT = DriverOptions> {
  name: string;
  options?: OptionsT;

  issue?: (request: CertificateRequest) => MaybePromise<IssuedCertificate>;
  renew?: (
    certificate: IssuedCertificate,
    request?: Partial<CertificateRequest>,
  ) => MaybePromise<IssuedCertificate>;
  revoke?: (request: RevokeRequest) => MaybePromise<void>;
  getDeploymentMetadata?: (certificateId: string) => MaybePromise<DeploymentMetadata>;
  createChallenge?: (request: ChallengeRequest) => MaybePromise<CertificateChallenge>;
  dispose?: () => MaybePromise<void>;
}

export interface UnsslManagerOptions {
  driver: UnsslDriver;
  keyStorage?: KeyStorage;
  dns?: DnsRecordOperations;
  fetch?: HttpFetch;
}

export interface UnsslManager {
  readonly driver: UnsslDriver;
  issue(request: CertificateRequest): Promise<IssuedCertificate>;
  renew(
    certificate: IssuedCertificate,
    request?: Partial<CertificateRequest>,
  ): Promise<IssuedCertificate>;
  revoke(request: RevokeRequest): Promise<void>;
  getDeploymentMetadata(certificateId: string): Promise<DeploymentMetadata>;
  createChallenge(request: ChallengeRequest): Promise<CertificateChallenge>;
  putDns01Challenge(challenge: Dns01Challenge): Promise<void>;
  removeDns01Challenge(challenge: Dns01Challenge): Promise<void>;
  dispose(): Promise<void>;
}

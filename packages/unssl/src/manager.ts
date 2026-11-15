import { UnsslError } from "./errors";
import type { Dns01Challenge, UnsslManager, UnsslManagerOptions } from "./types";

export function createSSLManager(options: UnsslManagerOptions): UnsslManager {
  const driver = options.driver;
  let disposed = false;

  function assertAvailable(): void {
    if (disposed) {
      throw new UnsslError("UnSSL manager has been disposed", {
        code: "disposed",
        provider: driver.name,
      });
    }
  }

  function requireMethod<T extends (...args: never[]) => unknown>(
    method: T | undefined,
    action: string,
  ): T {
    if (!method) {
      throw new UnsslError(`Driver does not support ${action}`, {
        code: "not_supported",
        provider: driver.name,
      });
    }
    return method;
  }

  const manager: UnsslManager = {
    driver,

    async issue(request) {
      assertAvailable();
      return requireMethod(driver.issue, "issuing certificates")(request);
    },

    async renew(certificate, request) {
      assertAvailable();
      return requireMethod(driver.renew, "renewing certificates")(certificate, request);
    },

    async revoke(request) {
      assertAvailable();
      await requireMethod(driver.revoke, "revoking certificates")(request);
    },

    async getDeploymentMetadata(certificateId) {
      assertAvailable();
      return requireMethod(driver.getDeploymentMetadata, "deployment metadata")(certificateId);
    },

    async createChallenge(request) {
      assertAvailable();
      return requireMethod(driver.createChallenge, "certificate challenges")(request);
    },

    async putDns01Challenge(challenge: Dns01Challenge) {
      assertAvailable();
      if (!options.dns) {
        throw new UnsslError("DNS-01 challenge placement requires injected DNS operations", {
          code: "invalid_request",
          provider: driver.name,
        });
      }
      const record = {
        name: challenge.recordName,
        type: "TXT",
        entries: [challenge.recordValue],
        value: challenge.recordValue,
      };
      const domain = challenge.identifier.replace(/\.$/, "");
      if (options.dns.upsertRecord) {
        await options.dns.upsertRecord(domain, record);
      } else {
        await options.dns.setRecord(domain, record);
      }
    },

    async removeDns01Challenge(challenge: Dns01Challenge) {
      assertAvailable();
      if (!options.dns) {
        throw new UnsslError("DNS-01 challenge cleanup requires injected DNS operations", {
          code: "invalid_request",
          provider: driver.name,
        });
      }
      const records = await options.dns.getRecords(challenge.identifier, {
        name: challenge.recordName,
        type: "TXT",
      });
      const matching = records.filter(
        (record) => record.entries?.join("") === challenge.recordValue,
      );
      for (const record of matching) {
        await options.dns.removeRecord(challenge.identifier, record);
      }
    },

    async dispose() {
      if (disposed) {
        return;
      }
      disposed = true;
      await driver.dispose?.();
    },
  };

  return manager;
}

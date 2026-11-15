/**
 * RDAP Driver
 * Uses RDAP (Registration Data Access Protocol) to query IP network information
 */

import { queryIP } from "rdap";
import type { RdapEntity, RdapIpNetwork, VCardProperty } from "rdap";

import type {
  BatchQueryOptions,
  Driver,
  DriverCapabilities,
  DriverOptions,
  GeoLocation,
  QueryOptions,
} from "..";
import { mapBatches, resolveBatchOptions } from "../batch";
import { createProviderError } from "../errors";
import { normalizeGeoLocation, type RawGeoLocation } from "../normalize";

export interface RdapDriverOptions extends DriverOptions {
  /**
   * Custom RDAP server URL
   */
  baseUrl?: string;

  /**
   * Fetch options for RDAP requests
   */
  fetchOptions?: RequestInit;
  batchSize?: number;
  concurrency?: number;
}

const SOURCE = "rdap";

function organization(entities?: RdapEntity[]): string | undefined {
  for (const entity of entities || []) {
    const vcard = entity.vcardArray?.[1];
    if (!vcard) {
      continue;
    }

    const properties = vcard as VCardProperty[];
    const org = properties.find((property) => property[0] === "org")?.[3];
    const name = properties.find((property) => property[0] === "fn")?.[3];
    const value = org || name;
    if (value?.trim()) {
      return value.trim();
    }
  }

  return undefined;
}

function extractGeoLocation(
  response: RdapIpNetwork,
  ip: string,
  queryOptions?: QueryOptions,
): GeoLocation | null {
  const countryCode =
    response.country && /^[A-Z]{2}$/i.test(response.country)
      ? response.country.toUpperCase()
      : undefined;

  const raw: RawGeoLocation = {
    ip: ip || response.startAddress,
    source: SOURCE,
    country: response.country,
    countryCode,
    org: response.name || organization(response.entities),
    isp: response.name,
  };

  return normalizeGeoLocation(raw, queryOptions);
}

export default function rdapDriver(options: RdapDriverOptions = {}): Driver<RdapDriverOptions> {
  const lookup = async (ip: string, queryOptions?: QueryOptions): Promise<GeoLocation | null> => {
    try {
      const response = await queryIP<RdapIpNetwork>(ip, {
        baseUrl: options.baseUrl,
        fetchOptions: options.fetchOptions,
      });

      return extractGeoLocation(response, ip, queryOptions);
    } catch (error) {
      throw createProviderError(SOURCE, error);
    }
  };

  const batchLookup = async (
    ips: string[],
    queryOptions?: BatchQueryOptions,
  ): Promise<GeoLocation[]> => {
    const batchOptions = resolveBatchOptions(queryOptions, {
      batchSize: options.batchSize ?? 1,
      concurrency: options.concurrency ?? 2,
    });

    const batches = await mapBatches(
      ips,
      batchOptions,
      async (batch) =>
        await Promise.all(
          batch.map(async (ip) => {
            try {
              return await lookup(ip, queryOptions);
            } catch {
              return null;
            }
          }),
        ),
    );

    return batches.flat().filter((result): result is GeoLocation => result !== null);
  };

  const capabilities: DriverCapabilities = {
    lookup: true,
    current: false,
    batchLookup: true,
    nativeBatch: false,
    remote: true,
    proxyDetection: false,
  };

  return {
    name: SOURCE,
    options,
    capabilities,
    lookup,
    batchLookup,
  };
}

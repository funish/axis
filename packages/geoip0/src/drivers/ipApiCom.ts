import { ofetch } from "ofetch";

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
import { normalizeGeoLocation } from "../normalize";

// IP-API.com response interface
export interface IpApiComResponse {
  query?: string;
  status?: "success" | "fail";
  country?: string;
  countryCode?: string;
  region?: string;
  regionName?: string;
  city?: string;
  zip?: string;
  lat?: number;
  lon?: number;
  timezone?: string;
  isp?: string;
  org?: string;
  as?: string;
  mobile?: boolean;
  proxy?: boolean;
  hosting?: boolean;
  message?: string;
}

export type IpApiComBatchResponse = IpApiComResponse[];

// IP-API.com Driver options
export interface IpApiComOptions extends DriverOptions {
  /**
   * Specify response fields to reduce bandwidth
   */
  fields?: string;
  /**
   * Response language
   */
  lang?: "en" | "de" | "es" | "pt-BR" | "fr" | "ja" | "zh-CN" | "ru";
  batchSize?: number;
  concurrency?: number;
}

const DEFAULT_FIELDS =
  "status,message,country,countryCode,region,regionName,city,lat,lon,timezone,isp,org,as,proxy,query";
const SOURCE = "ip-api.com";

function convert(data: IpApiComResponse, queryOptions?: QueryOptions): GeoLocation | null {
  return normalizeGeoLocation(
    {
      ip: data.query || "",
      source: SOURCE,
      country: data.country,
      countryCode: data.countryCode,
      region: data.regionName,
      regionCode: data.region,
      city: data.city,
      latitude: data.lat,
      longitude: data.lon,
      isp: data.isp,
      org: data.org,
      asn: data.as?.split(" ")[0],
      timezone: data.timezone,
      isProxy: data.proxy,
    },
    queryOptions,
  );
}

export default function ipApiComDriver(options: IpApiComOptions = {}): Driver<IpApiComOptions> {
  const lookup = async (ip: string, queryOptions?: QueryOptions): Promise<GeoLocation | null> => {
    try {
      const fields = options.fields || DEFAULT_FIELDS;
      const lang = options.lang || "en";
      const url = `http://ip-api.com/json/${encodeURIComponent(ip)}?fields=${encodeURIComponent(fields)}&lang=${encodeURIComponent(lang)}`;
      const data = await ofetch<IpApiComResponse>(url);

      if (data.status !== "success" || !data.query) {
        throw createProviderError(SOURCE, data.message || "Provider lookup failed");
      }

      return convert(data, queryOptions);
    } catch (error) {
      throw createProviderError(SOURCE, error);
    }
  };

  const current = async (queryOptions?: QueryOptions): Promise<GeoLocation | null> => {
    try {
      const fields = options.fields || DEFAULT_FIELDS;
      const lang = options.lang || "en";
      const url = `http://ip-api.com/json?fields=${encodeURIComponent(fields)}&lang=${encodeURIComponent(lang)}`;
      const data = await ofetch<IpApiComResponse>(url);

      if (data.status !== "success" || !data.query) {
        throw createProviderError(SOURCE, data.message || "Provider lookup failed");
      }

      return convert(data, queryOptions);
    } catch (error) {
      throw createProviderError(SOURCE, error);
    }
  };

  const batchLookup = async (
    ips: string[],
    queryOptions?: BatchQueryOptions,
  ): Promise<GeoLocation[]> => {
    const batchOptions = resolveBatchOptions(queryOptions, {
      batchSize: options.batchSize ?? 100,
      concurrency: options.concurrency ?? 1,
    });
    const lang = options.lang || "en";
    const fields = options.fields || DEFAULT_FIELDS;

    const batches = await mapBatches(ips, batchOptions, async (batch) => {
      try {
        const response = await ofetch<IpApiComBatchResponse>(
          `http://ip-api.com/batch?lang=${encodeURIComponent(lang)}&fields=${encodeURIComponent(fields)}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(batch),
          },
        );

        return response
          .filter((data) => data.status === "success" && Boolean(data.query))
          .map((data) => convert(data, queryOptions))
          .filter((result): result is GeoLocation => result !== null);
      } catch (error) {
        throw createProviderError(SOURCE, error);
      }
    });

    return batches.flat();
  };

  const capabilities: DriverCapabilities = {
    lookup: true,
    current: true,
    batchLookup: true,
    nativeBatch: true,
    remote: true,
    proxyDetection: true,
  };

  return {
    name: SOURCE,
    options,
    capabilities,
    lookup,
    current,
    batchLookup,
  };
}

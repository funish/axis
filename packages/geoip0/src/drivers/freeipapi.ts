import { ofetch } from "ofetch";
import type { Driver, GeoLocation, QueryOptions, DriverOptions } from "..";

// Free IP API response interface
export interface FreeIPAPIResponse {
  ipVersion: number; // IP version (4 or 6)
  ipAddress: string; // IP address, e.g., "1.1.1.1"
  latitude: number; // Latitude coordinate, e.g., -33.8688
  longitude: number; // Longitude coordinate, e.g., 151.209
  countryName: string; // Full country name, e.g., "Australia"
  countryCode: string; // Two-letter country code, e.g., "AU"
  capital: string; // Capital city, e.g., "Canberra"
  phoneCodes: number[]; // Country phone codes, e.g., [61]
  timeZones: string[]; // Array of timezones, e.g., ["Australia/Sydney", ...]
  zipCode: string; // Postal/ZIP code, e.g., "4000"
  cityName: string; // City name, e.g., "Sydney"
  regionName: string; // Region/state name, e.g., "New South Wales"
  continent: string; // Continent name, e.g., "Oceania"
  continentCode: string; // Two-letter continent code, e.g., "OC"
  currencies: string[]; // Array of currency codes, e.g., ["AUD"]
  languages: string[]; // Array of language codes, e.g., ["en"]
  asn: string; // Autonomous System Number, e.g., "13335"
  asnOrganization: string; // ASN organization name, e.g., "Cloudflare, Inc."
  isProxy: boolean; // Whether IP is a proxy
}

// Free IP API Bulk response interface
export interface FreeIPAPIBulkResponse {
  [ip: string]: FreeIPAPIResponse;
}

// Free IP API Driver options
export interface FreeIPAPIOptions extends DriverOptions {}

export default function freeipapiDriver(
  options: FreeIPAPIOptions = {},
): Driver<FreeIPAPIOptions> {
  const lookup = async (
    ip: string,
    _queryOptions?: QueryOptions,
  ): Promise<GeoLocation | null> => {
    try {
      const data: FreeIPAPIResponse = await ofetch(
        `https://freeipapi.com/api/json/${ip}`,
      );

      return {
        ip: data.ipAddress,
        country: data.countryName || "",
        countryCode: data.countryCode || "",
        region: data.regionName || "",
        city: data.cityName || "",
        latitude: data.latitude || 0,
        longitude: data.longitude || 0,
        isp: data.asnOrganization || "",
        org: data.asnOrganization || "",
        asn: data.asn || "",
        timezone: data.timeZones?.[0] || "",
        source: "freeipapi",
        regionCode: "",
        accuracyRadius: "",
        isProxy: false,
      };
    } catch {
      return null;
    }
  };

  const current = async (
    queryOptions?: QueryOptions,
  ): Promise<GeoLocation | null> => {
    try {
      const version = queryOptions?.version || "auto";
      let url = "https://freeipapi.com/api/json";

      if (version === "ipv4") {
        // Free IP API doesn't have separate IPv4 endpoint, use default
        url = "https://freeipapi.com/api/json";
      } else if (version === "ipv6") {
        // Free IP API doesn't have separate IPv6 endpoint, use default
        url = "https://freeipapi.com/api/json";
      }

      const data: FreeIPAPIResponse = await ofetch(url);

      return {
        ip: data.ipAddress,
        country: data.countryName || "",
        countryCode: data.countryCode || "",
        region: data.regionName || "",
        city: data.cityName || "",
        latitude: data.latitude || 0,
        longitude: data.longitude || 0,
        isp: data.asnOrganization || "",
        org: data.asnOrganization || "",
        asn: data.asn || "",
        timezone: data.timeZones?.[0] || "",
        source: "freeipapi",
        regionCode: "",
        accuracyRadius: "",
        isProxy: false,
      };
    } catch {
      return null;
    }
  };

  const batchLookup = async (
    ips: string[],
    _queryOptions?: QueryOptions,
  ): Promise<GeoLocation[]> => {
    try {
      const response: FreeIPAPIBulkResponse = await ofetch(
        "https://freeipapi.com/api/bulk/json",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: {
            ips,
          },
        },
      );

      // Convert bulk API response to GeoLocation array
      const results: GeoLocation[] = [];
      for (const [, data] of Object.entries(response)) {
        if (data && data.ipAddress) {
          results.push({
            ip: data.ipAddress,
            country: data.countryName,
            countryCode: data.countryCode,
            region: data.regionName,
            regionCode: "",
            city: data.cityName,
            latitude: data.latitude,
            longitude: data.longitude,
            isp: data.asnOrganization,
            org: data.asnOrganization,
            asn: data.asn,
            timezone: data.timeZones?.[0] || "", // Use first timezone
            source: "freeipapi",
            accuracyRadius: "",
            isProxy: false,
          });
        }
      }

      return results;
    } catch {
      return [];
    }
  };

  return {
    name: "freeipapi",
    options,
    lookup,
    batchLookup,
    current,
  };
}

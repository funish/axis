import { ofetch } from "ofetch";
import type { Driver, GeoLocation, QueryOptions, DriverOptions } from "..";

// IP.SB API response interface
export interface IPSBResponse {
  ip: string; // IP address, e.g., "8.8.8.8"
  country_code: string; // Two-letter country code, e.g., "US"
  country: string; // Full country name, e.g., "United States"
  region: string; // Region/state code, e.g., "CA"
  region_name: string; // Full region/state name, e.g., "California"
  city: string; // City name, e.g., "Mountain View"
  latitude: number; // Latitude coordinate, e.g., 37.4056
  longitude: number; // Longitude coordinate, e.g., -122.0775
  isp: string; // Internet Service Provider, e.g., "Google LLC"
  org: string; // Organization name, e.g., "Google LLC"
  timezone: string; // Timezone identifier, e.g., "America/Los_Angeles"
  timezone_offset: number; // UTC offset in seconds, e.g., -28800
  asn: number; // Autonomous System Number, e.g., 15169
  aso: string; // Autonomous System Organization, e.g., "Google LLC"
}

// IP.SB Driver options
export interface IPSBOptions extends DriverOptions {}

export default function ipsbDriver(
  options: IPSBOptions = {},
): Driver<IPSBOptions> {
  const lookup = async (
    ip: string,
    _queryOptions?: QueryOptions,
  ): Promise<GeoLocation | null> => {
    try {
      const data: IPSBResponse = await ofetch(`https://api.ip.sb/geoip/${ip}`);

      return {
        ip: data.ip,
        country: data.country,
        countryCode: data.country_code,
        region: data.region_name,
        city: data.city,
        latitude: data.latitude,
        longitude: data.longitude,
        isp: data.isp,
        org: data.org,
        asn: data.asn.toString(),
        timezone: data.timezone,
        source: "ip.sb",
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
      let url = "https://api.ip.sb/geoip";

      if (version === "ipv4") {
        url = "https://api-ipv4.ip.sb/geoip";
      } else if (version === "ipv6") {
        url = "https://api-ipv6.ip.sb/geoip";
      }

      const data: IPSBResponse = await ofetch(url);

      return {
        ip: data.ip,
        country: data.country,
        countryCode: data.country_code,
        region: data.region_name,
        city: data.city,
        latitude: data.latitude,
        longitude: data.longitude,
        isp: data.isp,
        org: data.org,
        asn: data.asn.toString(),
        timezone: data.timezone,
        source: "ip.sb",
      };
    } catch {
      return null;
    }
  };

  return {
    name: "ipsb",
    options,
    lookup,
    current,
  };
}

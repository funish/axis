import type { GeoLocation, QueryOptions } from "./types";

export type RawGeoLocation = Omit<Partial<GeoLocation>, "ip" | "source"> & {
  ip: string;
  source: string;
};

const OPTIONAL_STRINGS = [
  "country",
  "countryCode",
  "region",
  "regionCode",
  "city",
  "isp",
  "org",
  "asn",
  "timezone",
] as const;

const OPTIONAL_NUMBERS = ["latitude", "longitude", "accuracyRadius"] as const;

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value !== "" ? value : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function booleanValue(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

/**
 * Normalize a provider response without inventing values for absent fields.
 */
export function normalizeGeoLocation(
  input: RawGeoLocation,
  options?: Pick<QueryOptions, "legacySparseFields">,
): GeoLocation | null {
  const ip = stringValue(input.ip);
  const source = stringValue(input.source);

  if (!ip || !source) {
    return null;
  }

  const result: GeoLocation = { ip, source };

  for (const field of OPTIONAL_STRINGS) {
    const value = stringValue(input[field]);
    if (value !== undefined) {
      result[field] = value;
    }
  }

  for (const field of OPTIONAL_NUMBERS) {
    const value = numberValue(input[field]);
    if (value !== undefined) {
      result[field] = value;
    }
  }

  const isProxy = booleanValue(input.isProxy);
  if (isProxy !== undefined) {
    result.isProxy = isProxy;
  }

  if (options?.legacySparseFields) {
    return {
      ...result,
      country: result.country ?? "",
      countryCode: result.countryCode ?? "",
      region: result.region ?? "",
      regionCode: result.regionCode ?? "",
      city: result.city ?? "",
      latitude: result.latitude ?? 0,
      longitude: result.longitude ?? 0,
      isp: result.isp ?? "",
      org: result.org ?? "",
      asn: result.asn ?? "",
      timezone: result.timezone ?? "",
      accuracyRadius: result.accuracyRadius?.toString() ?? "",
      isProxy: result.isProxy ?? false,
    };
  }

  return result;
}

/**
 * Determine whether a provider returned usable geolocation/network data.
 * Only ip and source is an honest but empty result.
 */
export function hasGeoLocationData(location: GeoLocation | null | undefined): boolean {
  if (!location) {
    return false;
  }

  const isLegacySparse =
    OPTIONAL_STRINGS.every((field) => location[field] === "") &&
    location.latitude === 0 &&
    location.longitude === 0 &&
    location.accuracyRadius === "" &&
    location.isProxy === false;

  return (
    !isLegacySparse &&
    (OPTIONAL_STRINGS.some((field) => location[field] !== undefined) ||
      OPTIONAL_NUMBERS.some((field) => location[field] !== undefined) ||
      location.isProxy !== undefined)
  );
}

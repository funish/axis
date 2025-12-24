/**
 * RDAP Driver
 * Uses RDAP (Registration Data Access Protocol) to query IP network information
 */

import { queryIP } from "rdap";
import type { RdapIpNetwork } from "rdap";
import type { Driver, DriverOptions, GeoLocation, QueryOptions } from "..";

export interface RdapDriverOptions extends DriverOptions {
  /**
   * Custom RDAP server URL
   */
  baseUrl?: string;

  /**
   * Fetch options for RDAP requests
   */
  fetchOptions?: RequestInit;
}

export default function rdapDriver(
  options: RdapDriverOptions = {},
): Driver<RdapDriverOptions> {
  const { baseUrl, fetchOptions } = options;

  /**
   * Extract geolocation information from RDAP IP network response
   */
  const extractGeoLocation = (
    rdapResponse: RdapIpNetwork,
    ip?: string,
  ): GeoLocation => {
    const location: GeoLocation = {
      ip: ip ?? rdapResponse.startAddress,
      country: "",
      countryCode: "",
      region: "",
      regionCode: "",
      city: "",
      latitude: 0,
      longitude: 0,
      isp: "",
      org: "",
      asn: "",
      timezone: "",
      source: "rdap",
      accuracyRadius: "",
      isProxy: false,
    };

    // Extract country information
    if (rdapResponse.country) {
      location.country = rdapResponse.country;
      location.countryCode = rdapResponse.country;
    }

    // Extract network information for ISP/organization
    if (rdapResponse.name) {
      location.isp = rdapResponse.name;
      location.org = rdapResponse.name;
    }

    if (rdapResponse.type) {
      location.org = location.org
        ? `${location.org} (${rdapResponse.type})`
        : rdapResponse.type;
    }

    // Extract information from entities
    if (rdapResponse.entities) {
      for (const entity of rdapResponse.entities) {
        // Look for registrant or administrative entity
        if (
          entity.roles?.includes("registrant") ||
          entity.roles?.includes("administrative")
        ) {
          // Extract organization and contact information from vcardArray if available
          if (entity.vcardArray && entity.vcardArray[1]) {
            const vcardProps = entity.vcardArray[1];
            for (const prop of vcardProps) {
              // VCardProperty format: [type, params, type_name, value]
              const [propType, params, , value] = prop;

              if (propType === "org" && typeof value === "string") {
                // Organization name
                const orgValue = value.split(";")[0].trim(); // Take first organization if semicolon separated
                location.org = orgValue || location.org;
                location.isp = location.isp || orgValue;
              }

              if (propType === "fn" && typeof value === "string") {
                // Full name (for organizations, this is often the org name)
                if (!location.org && value.trim()) {
                  location.org = value.trim();
                  location.isp = location.isp || value.trim();
                }
              }

              if (propType === "adr") {
                // Address property - check for address in label parameter
                if (
                  params &&
                  params.label &&
                  typeof params.label === "string"
                ) {
                  // Parse address from label parameter
                  const addressLines = params.label.split("\n");
                  if (addressLines.length >= 3) {
                    // Format typically: Street\nCity\nState\nPostal\nCountry
                    const country =
                      addressLines[addressLines.length - 1]?.trim();
                    const stateOrCity =
                      addressLines[addressLines.length - 2]?.trim();
                    const city = addressLines[2]?.trim();

                    if (country) {
                      location.country = country;
                      // Extract country code (last word)
                      const countryWords = country.split(" ");
                      location.countryCode = countryWords[
                        countryWords.length - 1
                      ]
                        .substring(0, 2)
                        .toUpperCase();
                    }

                    if (stateOrCity && /^[A-Z]{2}$/i.test(stateOrCity)) {
                      location.region = stateOrCity.toUpperCase();
                    } else if (city && city !== stateOrCity) {
                      location.city = city;
                    }
                  }
                }
              }
            }
          }
        }
      }
    }

    // Extract coordinates from remarks if available (some RDAP servers include this)
    if (rdapResponse.remarks) {
      for (const remark of rdapResponse.remarks) {
        if (remark.description) {
          for (const desc of remark.description) {
            // Look for coordinate patterns in description
            const coordMatch = desc.match(/(\d+\.\d+),\s*(-?\d+\.\d+)/);
            if (coordMatch) {
              location.latitude = parseFloat(coordMatch[1]);
              location.longitude = parseFloat(coordMatch[2]);
            }

            // Look for timezone information
            const tzMatch = desc.match(/timezone[:\s]+([A-Za-z_/]+)/i);
            if (tzMatch) {
              location.timezone = tzMatch[1].trim();
            }
          }
        }
      }
    }

    // Extract ASN from handle or events
    if (rdapResponse.handle) {
      const asnMatch = rdapResponse.handle.match(/(AS\d+)|(\d+)/);
      if (asnMatch) {
        location.asn = asnMatch[1] || asnMatch[2];
      }
    }

    return location;
  };

  const lookup = async (
    ip: string,
    _queryOptions?: QueryOptions,
  ): Promise<GeoLocation> => {
    try {
      const rdapResponse = await queryIP<RdapIpNetwork>(ip, {
        baseUrl,
        fetchOptions,
      });

      const result = extractGeoLocation(rdapResponse, ip);
      if (result) {
        return result;
      }

      // Return empty object if no data found
      return {
        ip,
        country: "",
        countryCode: "",
        region: "",
        regionCode: "",
        city: "",
        latitude: 0,
        longitude: 0,
        isp: "",
        org: "",
        asn: "",
        timezone: "",
        source: "rdap",
        accuracyRadius: "",
        isProxy: false,
      };
    } catch {
      // Return empty object on error
      return {
        ip,
        country: "",
        countryCode: "",
        region: "",
        regionCode: "",
        city: "",
        latitude: 0,
        longitude: 0,
        isp: "",
        org: "",
        asn: "",
        timezone: "",
        source: "rdap",
        accuracyRadius: "",
        isProxy: false,
      };
    }
  };

  const current = async (
    _queryOptions?: QueryOptions,
  ): Promise<GeoLocation> => {
    // RDAP doesn't support current IP detection, return empty object
    return {
      ip: "",
      country: "",
      countryCode: "",
      region: "",
      regionCode: "",
      city: "",
      latitude: 0,
      longitude: 0,
      isp: "",
      org: "",
      asn: "",
      timezone: "",
      source: "rdap",
      accuracyRadius: "",
      isProxy: false,
    };
  };

  const batchLookup = async (
    ips: string[],
    queryOptions?: QueryOptions,
  ): Promise<GeoLocation[]> => {
    const results: GeoLocation[] = [];

    for (const ip of ips) {
      try {
        const result = await lookup(ip, queryOptions);
        if (result) {
          results.push(result);
        }
      } catch {
        // Continue with next IP on error
        continue;
      }
    }

    return results;
  };

  return {
    name: "rdap",
    options,
    lookup,
    current,
    batchLookup,
  };
}

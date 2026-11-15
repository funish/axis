import type { DOHResponse } from "../../src";

export const DOH_PARTIAL_ANSWER: DOHResponse = {
  Status: 0,
  RD: true,
  RA: true,
  AD: false,
  CD: false,
  Question: [{ name: "example.com.", type: 1 }],
  Answer: [
    { name: "example.com.", type: 5, TTL: 180, data: "target.example.com." },
    { name: "target.example.com.", type: 1, TTL: 300, data: "192.0.2.1" },
  ],
};

export const DOH_NXDOMAIN: DOHResponse = {
  Status: 3,
  RA: true,
  Question: [{ name: "missing.example.com.", type: 1 }],
  Answer: [],
};

export const DOH_FAILURE: DOHResponse = {
  Status: 2,
  RA: true,
  Question: [{ name: "broken.example.com.", type: 1 }],
  Answer: [],
  Error: "upstream timeout",
};

import { describe, expect, it } from "vite-plus/test";

import { parseRdapPath, createRdapHandler } from "../src/server";

describe("RDAP server path parsing", () => {
  it("parses explicit RDAP paths and decodes values", () => {
    expect(parseRdapPath("/domain/example.com")).toEqual({
      queryType: "domain",
      query: "example.com",
    });
    expect(parseRdapPath("/domain/B%C3%BCcher.example")).toEqual({
      queryType: "domain",
      query: "xn--bcher-kva.example",
    });
    expect(parseRdapPath("/ip/2001:db8::1")).toEqual({
      queryType: "ip",
      query: "2001:db8::1",
    });
  });

  it("redirects the root and validates malformed paths", () => {
    expect(parseRdapPath("/")).toMatchObject({ redirect: "/help", queryType: "help" });
    expect(parseRdapPath("/ip/999.999.999.999")).toMatchObject({
      error: expect.stringContaining("Invalid ip query"),
    });
    expect(parseRdapPath("/domain/example.com/extra")).toMatchObject({
      error: expect.stringContaining("exactly one query value"),
    });
    expect(parseRdapPath("/entity/%zz")).toMatchObject({
      error: "Invalid URL encoding",
    });
  });
});

describe("RDAP server handler", () => {
  it("rejects unsupported methods and malformed paths", async () => {
    const handler = createRdapHandler();

    const methodResponse = await handler.fetch(
      new Request("http://localhost/domain/example.com", { method: "POST" }),
    );
    expect(methodResponse.status).toBe(405);
    expect(methodResponse.headers.get("Allow")).toBe("GET, HEAD");

    const pathResponse = await handler.fetch(new Request("http://localhost/ip/bad"));
    expect(pathResponse.status).toBe(400);
  });

  it("uses a local data provider and preserves RDAP content type", async () => {
    const handler = createRdapHandler({
      dataProvider: async (query, type) => ({
        objectClassName: type,
        handle: query,
      }),
    });

    const response = await handler.fetch(new Request("http://localhost/ip/8.8.8.8"));
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("application/rdap+json");
    await expect(response.json()).resolves.toEqual({
      objectClassName: "ip",
      handle: "8.8.8.8",
    });
  });

  it("states the configured upstream source and redirects the root", async () => {
    const handler = createRdapHandler({
      baseUrl: "https://upstream.example.com/rdap",
    });

    const helpResponse = await handler.fetch(new Request("http://localhost/help"));
    expect(helpResponse.status).toBe(200);
    const help = (await helpResponse.json()) as {
      notices: Array<{ title: string; description: string[] }>;
    };
    expect(help.notices.find(({ title }) => title === "Data source")?.description[0]).toContain(
      "https://upstream.example.com/rdap",
    );

    const redirect = await handler.fetch(new Request("http://localhost/"));
    expect(redirect.status).toBe(302);
    expect(redirect.headers.get("Location")).toBe("/help");
  });
});

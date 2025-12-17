/**
 * DoH Server Example
 */

import { createDohServer } from "../../../packages/undns/src/servers/doh";
import dohDriver from "../../../packages/undns/src/drivers/doh";

console.log("<🍭 DoH Server Example\n");

// Create DoH server using Cloudflare's public DoH endpoint
const server = createDohServer({
  driver: dohDriver({
    endpoint: "https://one.one.one.one/dns-query",
    timeout: 5000,
  }),
});

server.serve(8081);

import { defineBuildConfig } from "unbuild";

export default defineBuildConfig({
  declaration: true,
  entries: [
    "src/index",
    "src/types",
    "src/drivers/node",
    "src/drivers/doh",
    "src/drivers/cloudflare",
    "src/drivers/null",
  ],
  rollup: {
    emitCJS: true,
    esbuild: {
      minify: true,
    },
  },
});

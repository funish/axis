import { defineBuildConfig } from "unbuild";

export default defineBuildConfig({
  declaration: true,
  entries: ["src/index", "src/server"],
  rollup: {
    emitCJS: true,
    esbuild: {
      minify: true,
    },
  },
});

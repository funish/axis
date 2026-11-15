import { defineConfig } from "vite-plus";

export default defineConfig({
  pack: {
    entry: ["src/index.ts", "src/drivers/*.ts", "src/servers/*.ts"],
  },
});

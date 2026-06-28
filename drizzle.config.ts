import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./electron/migrations",
  dialect: "sqlite",
  // No dbCredentials needed here — migrations are applied at runtime by the
  // custom runner in electron/main.cjs using the encrypted better-sqlite3 DB.
});

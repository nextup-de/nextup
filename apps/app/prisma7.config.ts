// Prisma 7 moved connection details out of schema.prisma: `url = env("DATABASE_URL")` in the
// datasource is a validation error since v7, so it lives here instead.
//
// No dotenv dependency: Node 22 reads the file itself. In Docker and in CI the variables are
// already in the environment and there is no .env to load, hence the try/catch.
import { defineConfig } from "prisma/config";

try {
  process.loadEnvFile(".env.local");
} catch {
  /* no .env.local - the environment already carries DATABASE_URL (Docker, CI) */
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: { url: process.env.DATABASE_URL },
});

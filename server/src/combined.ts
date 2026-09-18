import "dotenv/config";
import { getEnv } from "@asc/shared";
import { createApp } from "./app";

// Combined entrypoint: runs the Express API and the BullMQ workers in one Node process, so
// a $0 Render free-tier deployment needs only one Web Service instead of a paid API service
// + a paid background worker. This is the ONLY thing that differs from index.ts — the API
// startup below is identical to it.
const env = getEnv();
const app = createApp();

app.listen(env.PORT, () => {
  console.log(`API server listening on port ${env.PORT}`);
});

// Starts the existing worker process (worker/src/index.ts, compiled — its own logic,
// including its SIGTERM/shutdown handler, is untouched) in this same process via require(),
// not `await import()`: both /server and /worker compile to CommonJS (tsconfig.json in both
// sets "module": "commonjs", and neither package.json sets "type": "module"), so a plain
// synchronous require() is correct here and simpler than an unneeded dynamic import.
//
// Because Node caches modules per-process, requiring worker/dist/index.js here doesn't
// create a second, disconnected copy of anything — @asc/shared's env cache, Redis
// connection, and Prisma client singletons are all reused across the API and worker code
// that now share this one process.
require("../../worker/dist/index.js");

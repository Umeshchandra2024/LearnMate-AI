import "dotenv/config";
import { getEnv } from "@asc/shared";
import { createApp } from "./app";

const env = getEnv();
const app = createApp();

app.listen(env.PORT, () => {
  console.log(`API server listening on port ${env.PORT}`);
});

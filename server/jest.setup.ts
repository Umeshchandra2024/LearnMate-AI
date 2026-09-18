import path from "path";
import dotenv from "dotenv";

// Jest's cwd is the server workspace, but the real .env lives at the repo root.
dotenv.config({ path: path.resolve(__dirname, "../.env") });

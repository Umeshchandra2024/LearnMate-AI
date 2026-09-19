/** @type {import('jest').Config} */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  setupFiles: ["<rootDir>/jest.setup.ts"],
  testMatch: ["**/__tests__/**/*.test.ts"],
  // These tests hit the real remote Postgres and (for Tutor groundedness) a live LLM, so
  // jest's 5s default trips on ordinary network latency — a hook timeout is not a real failure.
  testTimeout: 60000,
  transform: {
    "^.+\\.ts$": ["ts-jest", { tsconfig: "<rootDir>/tsconfig.test.json" }],
  },
};

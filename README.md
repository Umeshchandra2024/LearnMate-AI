# AI Study Companion

A prototype MERN-stack (PostgreSQL instead of Mongo) study companion: upload course
materials, get a grounded AI tutor with citations, take adaptive quizzes, and track
mastery growth over time.

See [DEVELOPMENT.md](./DEVELOPMENT.md) for what's been built so far, architecture notes,
and known limitations.

## Stack

React + TypeScript + Vite · Tailwind CSS · Node.js + Express + TypeScript · PostgreSQL +
Prisma + pgvector · Redis + BullMQ · JWT (HTTP-only cookies) · Cloudinary · Groq (primary
LLM) with an OpenAI-compatible fallback for structured output · Hugging Face hosted
Inference API for embeddings (`BAAI/bge-small-en-v1.5`, 384 dimensions).

## Monorepo layout

```
/client   React + Vite frontend
/server   Express API
/worker   BullMQ background job processor
/shared   Code shared between server and worker (Prisma client, callAI, queues, env)
/prisma   Prisma schema + migrations
/scripts  One-off scripts (e.g. the tutor eval harness, added in Phase 2)
```

## Prerequisites

- Node.js 20+ and npm 10+
- A PostgreSQL database with the `pgvector` extension available (e.g. [Neon](https://neon.tech) —
  required locally too: local Postgres installs rarely have `pgvector` prebuilt)
- A Redis instance — if using a hosted one (e.g. [Upstash](https://upstash.com)), use the
  `rediss://` (TLS) URL, not `redis://`; see the note in `.env.example`
- API keys: Groq (LLM), Hugging Face (`HUGGINGFACEHUB_API_TOKEN`, for embeddings), an
  OpenAI-compatible provider (structured-output fallback only), and Cloudinary

## Setup

```bash
npm install                      # installs all workspaces
cp .env.example .env             # fill in DATABASE_URL, REDIS_URL, API keys, etc.
npm run db:generate               # generate the Prisma client
npm run db:migrate                # create tables + the pgvector extension
```

## Running locally

`/shared` is consumed by `/server` and `/worker` as a built package (`@asc/shared`, resolved
via its `dist/` output — see "Deployment" below for why), so build it once before starting
either:

```bash
npm run build:shared
```

Then run these in three separate terminals:

```bash
npm run dev:server   # API on http://localhost:4000
npm run dev:worker    # BullMQ job processor
npm run dev:client    # Vite dev server on http://localhost:5173 (proxies /api to :4000)
```

If you're actively editing `/shared`, run `npm run dev:shared` in a fourth terminal — it
recompiles on save, and `tsx watch` (used by `dev:server`/`dev:worker`) picks up the change
and restarts automatically.

Visit http://localhost:5173, sign up, create a Space, create a Project inside it, and
upload a PDF to see the processing pipeline run.

## Testing

```bash
npm run test            # both workspaces below, in sequence
npm run test:server     # cross-user isolation, admin access control, mastery math,
                         # adaptive selection, Tutor groundedness (Jest + Supertest)
npm run test:worker     # material-processing job idempotency (Jest)
```

These run against whatever `DATABASE_URL`/`REDIS_URL`/API keys are in `.env` — they create
and clean up their own test data, but they're real integration tests against real
infrastructure (including real LLM calls), not in-memory mocks.

## Deployment

Deploy target: Vercel (client) + Render (server + worker, as two separate services sharing
one Redis and one Neon Postgres).

**`/shared` must be built before `/server` or `/worker`** — both import it as the
`@asc/shared` package, which npm workspaces resolves via a symlink into `/shared` itself.
`server`/`worker`'s compiled output does `require("@asc/shared")`, which Node resolves
through `shared/package.json`'s `main` field — pointing at `shared/dist/index.js`, not
`shared/src/index.ts`. (Local dev only works without this extra step because `tsx` has its
own loader that can execute `.ts` files reached via `node_modules` resolution; plain `node`,
used in production, cannot.)

**For each Render service, leave "Root Directory" unset (the repository root) — do not set
it to `/server` or `/worker`.** npm workspaces are declared at the repo root; if Render's
build runs from inside `/server` alone, `/shared` is a sibling directory outside that root
and won't resolve or build correctly, root directory or not.

| Service | Build Command | Start Command |
|---|---|---|
| API | `npm run render-build:api` | `node server/dist/index.js` |
| Worker | `npm run render-build:worker` | `node worker/dist/index.js` |

Both `render-build:*` scripts run `npm install` then build `/shared` before their own
workspace, from the repo root, so the working directory always matches where the
`workspaces` field in the root `package.json` is declared.

## Notes

- OCR (`tesseract.js` + PDF page rendering via `canvas`) requires the `canvas` npm package,
  which has native build requirements (on Windows: Visual Studio's "Desktop development
  with C++" workload). It's an optional dependency — if it can't install/build, the app
  still works for native-text PDFs, and pages needing OCR simply keep whatever sparse text
  was extracted instead of failing the upload. See DEVELOPMENT.md for details.

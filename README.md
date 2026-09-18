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

Run these in three separate terminals:

```bash
npm run dev:server   # API on http://localhost:4000
npm run dev:worker    # BullMQ job processor
npm run dev:client    # Vite dev server on http://localhost:5173 (proxies /api to :4000)
```

Visit http://localhost:5173, sign up, create a Space, create a Project inside it, and
upload a PDF to see the processing pipeline run.

## Testing

```bash
npm run test --workspace server   # cross-user isolation tests (Jest + Supertest)
```

This runs against whatever `DATABASE_URL` is in `.env` — it creates and cleans up its own
test users, but it's a real integration test against a real database, not an in-memory mock.

## Notes

- OCR (`tesseract.js` + PDF page rendering via `canvas`) requires the `canvas` npm package,
  which has native build requirements (on Windows: Visual Studio's "Desktop development
  with C++" workload). It's an optional dependency — if it can't install/build, the app
  still works for native-text PDFs, and pages needing OCR simply keep whatever sparse text
  was extracted instead of failing the upload. See DEVELOPMENT.md for details.

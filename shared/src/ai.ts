import Groq from "groq-sdk";
import OpenAI from "openai";
import type { z } from "zod";
import { getEnv } from "./env";
import { prisma } from "./prisma";

export type ChatRole = "system" | "user" | "assistant";

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export interface CallAIParams<T> {
  /** Short, stable identifier for what's calling the AI, e.g. "tutor-chat", "quiz-generation". */
  feature: string;
  messages: ChatMessage[];
  /** When set, the response is parsed as JSON and validated against this schema. */
  responseSchema?: z.ZodType<T>;
  /** Force a specific provider. Defaults to Groq. */
  provider?: "groq" | "openai";
  /**
   * Overrides the default model for the primary provider (GROQ_MODEL/OPENAI_MODEL). Use for
   * calls where a smaller/faster model is an acceptable quality tradeoff — e.g. quiz
   * question generation and grading use GROQ_FAST_MODEL, while the Tutor keeps the default
   * larger model since answer quality matters most there. Has no effect on the fallback
   * provider, which always uses OPENAI_MODEL.
   */
  model?: string;
  /** Optional passthrough for function-calling tools (OpenAI-compatible tool schema). */
  tools?: OpenAI.Chat.Completions.ChatCompletionTool[];
  temperature?: number;
  maxTokens?: number;
  /** For AIUsageLog attribution. */
  userId?: string;
  projectId?: string;
}

export interface CallAIResult<T> {
  data: T;
  provider: "groq" | "openai";
  model: string;
  latencyMs: number;
  toolCalls?: OpenAI.Chat.Completions.ChatCompletionMessageToolCall[];
}

export class AIError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "AIError";
  }
}

// Rough $/1K-token pricing for cost estimation on the usage dashboard. Not billing-accurate.
const COST_PER_1K_TOKENS: Record<string, { input: number; output: number }> = {
  "llama-3.3-70b-versatile": { input: 0.00059, output: 0.00079 },
  "gpt-4o-mini": { input: 0.00015, output: 0.0006 },
};

function estimateCost(model: string, inputTokens?: number, outputTokens?: number): number | undefined {
  const rates = COST_PER_1K_TOKENS[model];
  if (!rates || inputTokens === undefined || outputTokens === undefined) return undefined;
  return (inputTokens / 1000) * rates.input + (outputTokens / 1000) * rates.output;
}

function getGroqClient(): Groq {
  const env = getEnv();
  return new Groq({ apiKey: env.GROQ_API_KEY });
}

function getOpenAIClient(): OpenAI {
  const env = getEnv();
  return new OpenAI({ apiKey: env.OPENAI_API_KEY, baseURL: env.OPENAI_BASE_URL });
}

interface RawCallOutcome {
  content: string;
  toolCalls?: OpenAI.Chat.Completions.ChatCompletionMessageToolCall[];
  inputTokens?: number;
  outputTokens?: number;
}

async function rawProviderCall(
  provider: "groq" | "openai",
  model: string,
  params: CallAIParams<unknown>,
): Promise<RawCallOutcome> {
  const requestBody = {
    model,
    messages: params.messages,
    temperature: params.temperature ?? 0.3,
    max_tokens: params.maxTokens,
    response_format: params.responseSchema ? ({ type: "json_object" } as const) : undefined,
  };

  // Groq's SDK mirrors OpenAI's request/response shape closely but has its own types, so the
  // two branches are kept separate rather than sharing one client-typed-as-a-union variable
  // (which breaks TS overload resolution on `.create(...)`).
  const response =
    provider === "groq"
      ? await getGroqClient().chat.completions.create({
          ...requestBody,
          tools: params.tools as Groq.Chat.Completions.ChatCompletionTool[] | undefined,
        })
      : await getOpenAIClient().chat.completions.create({
          ...requestBody,
          tools: params.tools,
        });

  const choice = response.choices[0];
  return {
    content: choice?.message?.content ?? "",
    toolCalls: choice?.message?.tool_calls as
      | OpenAI.Chat.Completions.ChatCompletionMessageToolCall[]
      | undefined,
    inputTokens: response.usage?.prompt_tokens,
    outputTokens: response.usage?.completion_tokens,
  };
}

async function logUsage(entry: {
  feature: string;
  provider: string;
  model: string;
  latencyMs: number;
  inputTokens?: number;
  outputTokens?: number;
  status: "SUCCESS" | "FAILURE";
  errorMessage?: string;
  userId?: string;
  projectId?: string;
}) {
  try {
    await prisma.aIUsageLog.create({
      data: {
        feature: entry.feature,
        provider: entry.provider,
        model: entry.model,
        latencyMs: entry.latencyMs,
        inputTokens: entry.inputTokens,
        outputTokens: entry.outputTokens,
        estimatedCost: estimateCost(entry.model, entry.inputTokens, entry.outputTokens),
        status: entry.status,
        errorMessage: entry.errorMessage,
        userId: entry.userId,
        projectId: entry.projectId,
      },
    });
  } catch (loggingError) {
    // Never let observability failures break the caller's AI request.
    console.error("Failed to write AIUsageLog", loggingError);
  }
}

/**
 * The single entry point for every LLM call in the app. Routes to Groq by default; when
 * `responseSchema` is set, validates the JSON response against it. On failure, retries up to
 * two more tiers: (1) if a smaller `model` override was used (quiz/recommendation calls),
 * retry once against the default larger Groq model — same account/key, most real recoveries
 * happen here; (2) fall back to the OpenAI-compatible provider, if `OPENAI_API_KEY` is
 * actually configured (a missing key fails fast with a clear message instead of attempting
 * a call guaranteed to 401). Every attempt — success or failure, at every tier — is logged to
 * AIUsageLog so usage/cost/error-rate observability is automatic for every feature that goes
 * through here.
 *
 * Security note (see SECURITY.md for the full argument): this schema-validated boundary is
 * also why there is no path from untrusted document/message text to a privileged action.
 * The model can only ever return a value matching `responseSchema` — never executed code,
 * never a tool call with side effects, never a raw DB write. Callers that persist the
 * result (e.g. quiz generation setting `conceptId` itself rather than trusting the model to
 * supply it) are what actually decide what gets written, always from values the app already
 * controls. A successful prompt injection is therefore bounded to producing a
 * wrong-but-still-schema-shaped answer, not a security breach.
 */
export async function callAI<T = string>(params: CallAIParams<T>): Promise<CallAIResult<T>> {
  const env = getEnv();
  const primaryProvider = params.provider ?? "groq";
  const primaryModel =
    params.model ?? (primaryProvider === "groq" ? env.GROQ_MODEL : env.OPENAI_MODEL);

  const primaryAttempt = await attempt(primaryProvider, primaryModel, params);
  if (primaryAttempt.ok) return primaryAttempt.result;

  // A smaller/faster model (GROQ_FAST_MODEL, used by quiz/recommendation calls) is more
  // prone to malformed structured output than the default model. Before ever leaving Groq,
  // retry once against the default (larger) Groq model — same account, same already-working
  // API key, and far more likely to succeed than jumping providers. This is what actually
  // recovers most real failures in practice, since the cross-provider fallback below depends
  // on OPENAI_API_KEY being configured at all, which it may not be.
  if (primaryProvider === "groq" && primaryModel !== env.GROQ_MODEL) {
    const largerModelAttempt = await attempt("groq", env.GROQ_MODEL, params);
    if (largerModelAttempt.ok) return largerModelAttempt.result;
  }

  // Only Groq has a further fallback path (the OpenAI-compatible provider is itself the
  // fallback, so there's nowhere further to go if that was already the primary).
  if (primaryProvider !== "groq") {
    throw new AIError(`AI call failed for feature "${params.feature}"`, primaryAttempt.error);
  }

  if (!env.OPENAI_API_KEY) {
    throw new AIError(
      `AI call failed for feature "${params.feature}": Groq failed and no OPENAI_API_KEY is ` +
        "configured for fallback (set OPENAI_API_KEY, or this feature has no recovery path left)",
      primaryAttempt.error,
    );
  }

  const fallbackModel = env.OPENAI_MODEL;
  const fallbackAttempt = await attempt("openai", fallbackModel, params);
  if (fallbackAttempt.ok) return fallbackAttempt.result;

  throw new AIError(
    `AI call failed for feature "${params.feature}" on both primary and fallback providers`,
    fallbackAttempt.error,
  );
}

type AttemptOutcome<T> =
  | { ok: true; result: CallAIResult<T> }
  | { ok: false; error: unknown };

async function attempt<T>(
  provider: "groq" | "openai",
  model: string,
  params: CallAIParams<T>,
): Promise<AttemptOutcome<T>> {
  const start = Date.now();
  // Hoisted so a post-response failure (JSON parse / schema validation) can still log the
  // real token counts the provider returned — the API call itself succeeded in that case,
  // only our content check failed afterward, so there's no reason those numbers should be
  // lost (previously every failure logged null tokens regardless of cause).
  let raw: RawCallOutcome | undefined;
  try {
    raw = await rawProviderCall(provider, model, params);
    const latencyMs = Date.now() - start;

    let data: T;
    if (params.responseSchema) {
      let parsedJson: unknown;
      try {
        parsedJson = JSON.parse(raw.content);
      } catch (parseError) {
        throw new AIError(`${provider} response was not valid JSON`, parseError);
      }
      const validation = params.responseSchema.safeParse(parsedJson);
      if (!validation.success) {
        // Include the actual Zod issues in the message — this is what lands in
        // AIUsageLog.errorMessage, and a bare "failed schema validation" with no detail
        // isn't diagnosable from the admin dashboard without reproducing the call.
        const issues = validation.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ");
        throw new AIError(`${provider} response failed schema validation: ${issues}`, validation.error);
      }
      data = validation.data;
    } else {
      data = raw.content as unknown as T;
    }

    await logUsage({
      feature: params.feature,
      provider,
      model,
      latencyMs,
      inputTokens: raw.inputTokens,
      outputTokens: raw.outputTokens,
      status: "SUCCESS",
      userId: params.userId,
      projectId: params.projectId,
    });

    return {
      ok: true,
      result: { data, provider, model, latencyMs, toolCalls: raw.toolCalls },
    };
  } catch (error) {
    const latencyMs = Date.now() - start;
    await logUsage({
      feature: params.feature,
      provider,
      model,
      latencyMs,
      inputTokens: raw?.inputTokens,
      outputTokens: raw?.outputTokens,
      status: "FAILURE",
      errorMessage: error instanceof Error ? error.message : String(error),
      userId: params.userId,
      projectId: params.projectId,
    });
    return { ok: false, error };
  }
}

import { randomUUID } from "node:crypto";
import type { z } from "zod";

/**
 * Central model abstraction.
 *
 * - Default / no key  -> deterministic mock outputs (no network, fully runnable)
 * - GOOGLE_API_KEY set AND USE_MOCK_MODEL=false -> Google ADK + Gemini
 *
 * Every agent calls generateStructured() and supplies a deterministic mock, so
 * the app behaves identically (shape-wise) with or without a real model. The
 * Gemini path is wrapped in try/catch and always falls back to the mock, so an
 * ADK/network/parse failure can never break a flow.
 */

export type ModelSource = "mock" | "gemini";

export function isMockMode(): boolean {
  const useMock = (process.env.USE_MOCK_MODEL ?? "true").toLowerCase() !== "false";
  const hasKey = Boolean(process.env.GOOGLE_API_KEY);
  return useMock || !hasKey;
}

export type GenerateParams<TInput, TOutput> = {
  agentName: string;
  instruction: string;
  input: TInput;
  schema: z.ZodType<TOutput>;
  mock: (input: TInput) => TOutput;
};

export async function generateStructured<TInput, TOutput>(
  params: GenerateParams<TInput, TOutput>,
): Promise<{ output: TOutput; source: ModelSource }> {
  if (isMockMode()) {
    return { output: params.mock(params.input), source: "mock" };
  }
  try {
    const raw = await runGeminiAgent(
      params.agentName,
      params.instruction,
      params.input,
    );
    const json = JSON.parse(stripFences(raw));
    const output = params.schema.parse(json);
    return { output, source: "gemini" };
  } catch (err) {
    console.warn(
      `[modelProvider] ${params.agentName} fell back to mock: ${(err as Error).message}`,
    );
    return { output: params.mock(params.input), source: "mock" };
  }
}

function stripFences(text: string): string {
  const trimmed = text.trim();
  const fence = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return (fence ? fence[1] : trimmed).trim();
}

async function runGeminiAgent(
  name: string,
  instruction: string,
  input: unknown,
): Promise<string> {
  // Lazy import so the heavy ADK dependency tree only loads when a real model
  // is actually configured.
  const adk = await import("@google/adk");
  const model = new adk.Gemini({
    model: process.env.GEMINI_MODEL ?? "gemini-2.0-flash",
    apiKey: process.env.GOOGLE_API_KEY,
  });
  const agent = new adk.LlmAgent({
    name,
    model,
    instruction:
      instruction +
      "\n\nReturn ONLY a single valid JSON object. No markdown, no code fences, no commentary.",
  });

  const appName = "reviewops";
  const userId = "system";
  const sessionId = randomUUID();
  const runner = new adk.InMemoryRunner({ agent, appName });
  await runner.sessionService.createSession({ appName, userId, sessionId });

  let finalText = "";
  for await (const event of runner.runAsync({
    userId,
    sessionId,
    newMessage: { role: "user", parts: [{ text: JSON.stringify(input) }] },
  })) {
    const parts = event?.content?.parts;
    if (!parts) continue;
    const text = parts
      .map((p: { text?: string }) => p.text ?? "")
      .join("");
    if (text) finalText = text;
  }
  return finalText;
}

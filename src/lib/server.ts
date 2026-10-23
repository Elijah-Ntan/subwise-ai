import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { savedStateSchema, workspaceSchema, planSchema } from "./contracts";
import { demoWorkspace } from "./demo";

export async function readBody(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) throw new Error("Missing request body.");
  let size = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 400_000) {
      await reader.cancel();
      throw new Error("Request exceeds 400 KB.");
    }
    chunks.push(value);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
export async function authorized(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const token = request.headers.get("authorization")?.match(/^Bearer (.+)$/)?.[1];
  if (!url || !key || !token) return null;
  const db = createClient(url, key, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) return null;
  return { db, userId: data.user.id };
}
const requests = new Map<string, { count: number; reset: number }>();
export function rateLimit(key: string) {
  const now = Date.now();
  for (const [k, v] of requests) if (v.reset <= now) requests.delete(k);
  const current = requests.get(key) ?? { count: 0, reset: now + 60_000 };
  if (current.count >= 6) throw new Error("Too many AI requests. Wait a minute.");
  current.count++;
  requests.set(key, current);
}
export async function agentContext(request: Request, raw: unknown, rawPlans: unknown = []) {
  const workspace = workspaceSchema.parse(raw);
  const auth = await authorized(request);
  if (auth) {
    rateLimit(auth.userId);
    const { data, error } = await auth.db
      .from("financial_workspaces")
      .select("state")
      .eq("user_id", auth.userId)
      .maybeSingle();
    if (error) throw new Error("Could not retrieve approved cloud memory.");
    const saved = data ? savedStateSchema.parse(data.state) : null;
    return { workspace, plans: saved?.plans ?? [] };
  }
  if (process.env.ALLOW_DEMO_AI !== "true")
    throw new Error("Sign in to use live AI. Local analysis is available without an account.");
  if (!workspace.source.startsWith("synthetic-"))
    throw new Error("Public AI accepts only the synthetic demo datasets.");
  // A shared demo budget prevents arbitrary client IDs from bypassing the limiter.
  rateLimit("public-demo");
  const canonical = demoWorkspace(
    workspace.source === "synthetic-student" ? "student" : "freelancer",
  );
  return {
    workspace: workspaceSchema.parse({ ...workspace, transactions: canonical.transactions }),
    plans: z.array(planSchema).max(30).parse(rawPlans),
  };
}
export const messageSchema = z.string().trim().min(1).max(3000);
export function failure(error: unknown) {
  const message =
    error instanceof z.ZodError
      ? "Invalid request data. Check required fields and limits."
      : error instanceof Error
        ? error.message
        : "Request failed.";
  // Never echo SDK diagnostics, tokens, or provider response bodies.
  const safe = /api key|incorrect_api|401|429|connection|fetch failed/i.test(message)
    ? "The AI or storage provider is unavailable. Check server configuration and try again."
    : message.slice(0, 220);
  return Response.json({ error: safe }, { status: 400 });
}

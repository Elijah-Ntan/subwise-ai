import { z } from "zod";
import { runAgent } from "@/lib/agent";
import { agentContext, failure, messageSchema, readBody } from "@/lib/server";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function POST(request: Request) {
  try {
    const body = z
      .object({
        message: messageSchema,
        workspace: z.unknown(),
        plans: z.unknown().optional(),
        history: z
          .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(6000) }))
          .max(10)
          .default([]),
      })
      .parse(await readBody(request));
    const context = await agentContext(request, body.workspace, body.plans);
    return Response.json(
      await runAgent(body.message, context.workspace, context.plans, body.history),
    );
  } catch (error) {
    return failure(error);
  }
}

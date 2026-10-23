import { z } from "zod";
import { extractGoal } from "@/lib/agent";
import { agentContext, failure, messageSchema, readBody } from "@/lib/server";
export async function POST(request: Request) {
  try {
    const body = z
      .object({ message: messageSchema, workspace: z.unknown() })
      .parse(await readBody(request));
    await agentContext(request, body.workspace);
    return Response.json(await extractGoal(body.message));
  } catch (error) {
    return failure(error);
  }
}

import { savedStateSchema } from "@/lib/contracts";
import { authorized, failure, readBody } from "@/lib/server";
export async function GET(request: Request) {
  try {
    const auth = await authorized(request);
    if (!auth) return Response.json({ error: "Sign in to access cloud memory." }, { status: 401 });
    const { data, error } = await auth.db
      .from("financial_workspaces")
      .select("state")
      .eq("user_id", auth.userId)
      .maybeSingle();
    if (error) throw new Error("Could not load cloud memory. Check database migration.");
    return Response.json({ state: data ? savedStateSchema.parse(data.state) : null });
  } catch (error) {
    return failure(error);
  }
}
export async function PUT(request: Request) {
  try {
    const auth = await authorized(request);
    if (!auth) return Response.json({ error: "Sign in to save cloud memory." }, { status: 401 });
    const body = await readBody(request);
    if (body.approved !== true) throw new Error("Explicit user approval is required.");
    const state = savedStateSchema.parse(body.state);
    const { error } = await auth.db
      .from("financial_workspaces")
      .upsert({ user_id: auth.userId, state, updated_at: new Date().toISOString() });
    if (error) throw new Error("Cloud save failed. Check database migration.");
    return Response.json({ saved: true });
  } catch (error) {
    return failure(error);
  }
}
export async function DELETE(request: Request) {
  try {
    const auth = await authorized(request);
    if (!auth) return Response.json({ error: "Sign in to delete cloud memory." }, { status: 401 });
    const { error } = await auth.db
      .from("financial_workspaces")
      .delete()
      .eq("user_id", auth.userId);
    if (error) throw new Error("Cloud deletion failed.");
    return Response.json({ deleted: true });
  } catch (error) {
    return failure(error);
  }
}

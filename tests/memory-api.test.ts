import { beforeEach, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({
  auth: vi.fn(),
  upsert: vi.fn(),
  eq: vi.fn(),
  maybeSingle: vi.fn(),
  remove: vi.fn(),
  select: vi.fn(),
}));
vi.mock("../src/lib/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/lib/server")>();
  return { ...actual, authorized: mock.auth };
});
import { GET, PUT, DELETE } from "../src/app/api/memory/route";
import { emptyWorkspace } from "../src/lib/contracts";
beforeEach(() => {
  vi.clearAllMocks();
  mock.eq.mockReturnValue({ maybeSingle: mock.maybeSingle });
  mock.maybeSingle.mockResolvedValue({ data: null, error: null });
  mock.upsert.mockResolvedValue({ error: null });
  mock.select.mockReturnValue({ eq: mock.eq });
  mock.remove.mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) });
  mock.auth.mockResolvedValue({
    userId: "owner-from-session",
    db: { from: () => ({ select: mock.select, upsert: mock.upsert, delete: mock.remove }) },
  });
});
it("rejects unauthenticated reads and writes", async () => {
  mock.auth.mockResolvedValue(null);
  expect((await GET(new Request("http://localhost/api/memory"))).status).toBe(401);
  expect((await PUT(new Request("http://localhost/api/memory", { method: "PUT" }))).status).toBe(
    401,
  );
});
it("scopes reads to the verified user", async () => {
  await GET(new Request("http://localhost/api/memory?user_id=someone-else"));
  expect(mock.eq).toHaveBeenCalledWith("user_id", "owner-from-session");
});
it("requires approval before persistence", async () => {
  const r = await PUT(
    new Request("http://localhost/api/memory", {
      method: "PUT",
      body: JSON.stringify({ state: { workspace: emptyWorkspace, plans: [] } }),
    }),
  );
  expect(r.status).toBe(400);
  expect(mock.upsert).not.toHaveBeenCalled();
});
it("writes validated state under session identity, never caller identity", async () => {
  const state = { workspace: emptyWorkspace, plans: [] };
  const r = await PUT(
    new Request("http://localhost/api/memory", {
      method: "PUT",
      body: JSON.stringify({ approved: true, user_id: "attacker", state }),
    }),
  );
  expect(r.status).toBe(200);
  expect(mock.upsert).toHaveBeenCalledWith(
    expect.objectContaining({ user_id: "owner-from-session", state }),
  );
});
it("does not claim success when persistence fails", async () => {
  mock.upsert.mockResolvedValue({ error: { message: "Database down" } });
  const r = await PUT(
    new Request("http://localhost/api/memory", {
      method: "PUT",
      body: JSON.stringify({ approved: true, state: { workspace: emptyWorkspace, plans: [] } }),
    }),
  );
  expect(r.status).toBe(400);
});
it("requires authentication for deletion", async () => {
  mock.auth.mockResolvedValue(null);
  expect(
    (await DELETE(new Request("http://localhost/api/memory", { method: "DELETE" }))).status,
  ).toBe(401);
});

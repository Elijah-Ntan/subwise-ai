import { savedStateSchema, type Workspace, type Plan } from "./contracts";
const key = "subwise.approved.v1";
export function loadLocalMemory(storage: Pick<Storage, "getItem">) {
  const raw = storage.getItem(key);
  return raw ? savedStateSchema.parse(JSON.parse(raw)) : null;
}
export function saveLocalMemory(
  storage: Pick<Storage, "setItem">,
  workspace: Workspace,
  plans: Plan[],
) {
  const state = savedStateSchema.parse({ workspace, plans });
  storage.setItem(key, JSON.stringify(state));
}
export function deleteLocalMemory(storage: Pick<Storage, "removeItem">) {
  storage.removeItem(key);
}

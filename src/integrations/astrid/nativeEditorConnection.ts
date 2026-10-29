import { AstridRuntimeClient } from "@/integrations/runtime/client.ts";
import { astridBase } from "@/integrations/runtime/connection.ts";

/** Both editor transports must negotiate the same existing Runtime authority. */
export async function assertNativeEditorConnection(signal?: AbortSignal): Promise<void> {
  const persistence = new AstridRuntimeClient({ readOnly: true, signal });
  const discovery = new AstridRuntimeClient({ baseUrl: astridBase(), readOnly: true, signal });
  const [runtime, workspace] = await Promise.all([
    persistence.ensureSession(),
    discovery.ensureSession(),
  ]);
  const runtimeInstance = (runtime.health as { runtime_instance_id?: string })
    .runtime_instance_id;
  const workspaceInstance = (
    workspace.health as { runtime_instance_id?: string }
  ).runtime_instance_id;
  if (
    !runtimeInstance ||
    !workspaceInstance ||
    runtime.realm.realm_id !== workspace.realm.realm_id ||
    runtimeInstance !== workspaceInstance
  ) {
    throw new Error(
      "Workspace discovery and persistence belong to different Runtime instances.",
    );
  }
  await discovery.listProjects();
}

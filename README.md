# Astrid work-in-progress source handoff

These branches are point-in-time source snapshots, not merged or accepted releases. Each is an independent root commit with its original source commit ID in the commit message. Git ancestry is deliberately omitted, so these branches are not a rebase or PR base; obtain original histories separately and reconcile changes before integrating. Active, uncommitted manager/worker work is not included. No private test inputs or session logs are included.

- [H Agent](../../tree/snapshot/h-agent) and [G Agent](../../tree/snapshot/g-agent)
- [H Runtime](../../tree/snapshot/h-runtime) and [G Runtime](../../tree/snapshot/g-runtime)
- [H RunPod lifecycle](../../tree/snapshot/h-lifecycle) and [G RunPod lifecycle](../../tree/snapshot/g-lifecycle)
- [H VibeComfy](../../tree/snapshot/h-vibecomfy) and [G VibeComfy](../../tree/snapshot/g-vibecomfy)
- [RunPod Python](../../tree/snapshot/runpod-python), [App](../../tree/snapshot/app), [Pinokio](../../tree/snapshot/pinokio)

H and G snapshots are distinct and have not been synchronized. H3's live GPU probe is not yet complete. See [default models and Generate plan](https://gist.github.com/peteromallet/2d3c02589a51f3ac43a73179a3ad74fc) for intended direction; proposed APIs are not proof of shipped functionality.

# VibeComfy Windows NVIDIA provisioning (testers)

This is a tester and release-qualification procedure, not a user setup step.
Users who already run ComfyUI should follow "Run on your own ComfyUI" in the
[VibeComfy pack skill](../../astrid/packs/vibecomfy/docs/SKILL.md); that path
uses their own ComfyUI and its Python, and needs none of this.

ComfyUI on Windows with NVIDIA is untested, but runs by default. Please report
how it went, including the GPU model and driver from `nvidia-smi`. For
`vibecomfy.*`, Astrid's GPU detection is informational.

The candidate environment pins are in
`astrid/packs/vibecomfy/environment.windows-nvidia.json` and
`astrid/packs/vibecomfy/requirements.windows-nvidia.txt`. They select Python
3.12.10, PyTorch CUDA 13.0 wheels, the existing ComfyUI/VibeComfy source pins,
and the H3 and VideoHelperSuite custom-node source/dependency pins. Other
custom nodes need their own reviewed pins before being added to this candidate.

Supply clean, already admitted checkouts with those nodes under
`ComfyUI\custom_nodes`, and keep the selected VibeComfy `custom_nodes.lock`:

```powershell
python -m astrid.core.generation.gpu_environment vibecomfy --checkout C:\Astrid\ComfyUI --vibecomfy-checkout C:\Astrid\VibeComfy --plan
python -m astrid.core.generation.gpu_environment vibecomfy --checkout C:\Astrid\ComfyUI --vibecomfy-checkout C:\Astrid\VibeComfy
```

This uses user-local uv 0.11.32 and needs a network connection on the tester's
computer. It creates the environment under
`%LOCALAPPDATA%\Astrid GPU\vibecomfy\<identity>`, without administrator access or a
system CUDA toolkit. The shared provisioner verifies source/node pins,
combines the CUDA pins with ComfyUI's requirements, VibeComfy's declared
dependencies/build tools and each selected node's requirements, then resolves
with the recorded upload cutoff. It writes and syncs a fully versioned,
hash-bound `requirements.lock`, installs the selected VibeComfy source without
changing that closure, checks dependencies and probes CUDA. A resolver,
dependency or CUDA failure produces no success receipt.

Keep the lock and `astrid-gpu-environment.json` with test evidence. Replay the
lock with `uv pip sync --require-hashes` to reproduce the resolved environment,
including its exact PyTorch wheel URLs. Use the printed interpreter path as the existing
warm server's engine interpreter; source, model and readiness-profile
admission still apply. Provisioning does not start another server or download
models. A repair uses a new `--destination` so a warm interpreter is never
overwritten. macOS and Linux retain their existing path.

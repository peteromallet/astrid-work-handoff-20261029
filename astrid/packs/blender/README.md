# Astrid Blender pack

Render 3D scenes with Blender, **locally** or on a **remote cloud render host** —
either an SSH-reachable CPU host or an on-demand **RunPod GPU pod**. The
action works the same way in both modes; only the transport differs.

## Pieces

```
astrid/packs/blender/
  render_core.py                    # stdlib-only scene→Blender-script builder (shared)
  actions/render/
    run.py                          # blender.render action: --execution local|cloud
  server/
    blender_render_server.py        # stdlib HTTP render API (deployed to a host)
    blender-render-api.service      # systemd unit
  deploy.py                         # provision/deploy hosts: ssh | runpod | runpod-render
```

The render server and `render_core.py` are dependency-free (stdlib only) so they
run on a host **without an Astrid install** — `deploy.py` copies them over.

## Run a render (the Astrid action)

```python
import astrid.sdk as sdk

# LOCAL — runs blender on this machine
result = sdk.invoke("blender.render", out="./out", inputs={
    "execution": "local",
    "samples": "64",
    "resolution": "1280x720",
})

# CLOUD — POSTs to any host running the render API (an SSH host, a RunPod pod, …)
result = sdk.invoke("blender.render", out="./out", inputs={
    "execution": "cloud",
    "cloud_url": "http://<host>:8778",
    "cloud_token": "<token>",
})
```

Inputs: `scene` (declarative spec JSON; a pleasant default scene is used if
omitted) or `blend` (an existing `.blend` file). `frames=1` → still PNG;
`frames=N>1` → mp4 animation. See `pack.yaml` for the full action declaration.

## Provision a render host

```bash
# Any SSH host (CPU). Installed live — no reset. --host and --user are required.
python -m astrid.packs.blender.deploy ssh --host 1.2.3.4 --user root

# RunPod: persistent GPU pod (keep up, tear down manually)
python -m astrid.packs.blender.deploy runpod --gpu "NVIDIA GeForce RTX 4090"

# RunPod: one-shot ephemeral GPU render (launch → install → render → teardown)
python -m astrid.packs.blender.deploy runpod-render \
  --out ./render.png --device gpu --teardown auto

python -m astrid.packs.blender.deploy teardown-runpod --pod-id <id>
```

### Notes

- **Token and bind address:** the server binds `127.0.0.1` by default and refuses to
  start on any other address without `BLENDER_RENDER_TOKEN`. `deploy` always runs
  the server on all interfaces with a token: `--token` (or `BLENDER_RENDER_TOKEN`)
  if given, otherwise a random one that is written into the systemd unit and saved
  to `~/.astrid/blender-render-token-<host>` (mode 0600, never printed). Pass it to
  clients as `cloud_token`. Keep the host firewalled to the clients that need it,
  or bind loopback yourself and reach it over an SSH tunnel
  (`ssh -fN -L 18778:127.0.0.1:8778 <user>@<host>`, `cloud_url=http://127.0.0.1:18778`).
- **Requests:** `mesh_url` must be `https://` (local renders now refuse `http://`
  and `file://` mesh URLs too); archives are checked for paths that
  escape the work directory before extraction. `POST /render` still executes a
  client-supplied preset `script` inside Blender, so treat the token as full
  code-execution access to the host.
- **RunPod:** no official Blender image exists, so a CUDA image
  (`runpod/pytorch:…cuda…`) is launched and the **official** GPU-capable Blender
  tarball is installed (the distro `apt` Blender has no CUDA). API key uses
  Astrid's shared `~/.astrid/astrid.env` credential resolver; the
  `runpod-lifecycle` package drives the pod lifecycle. Pod SSH uses
  `~/.ssh/id_ed25519`.
- **Teardown:** `runpod-render --teardown auto` (default) tears the pod down the
  moment the render finishes; `--teardown never` keeps it up; `--keep-after-seconds N`
  lingers N seconds first.
- **GPU vs CPU:** an `ssh` host without a GPU renders on CPU/Cycles only. RunPod gives a
  10–50× Cycles speedup and enables EEVEE. First GPU render compiles CUDA/OptiX
  kernels (one-time overhead); complex scenes benefit most.

## Scene spec

A declarative JSON scene (see `render_core.DEFAULT_SCENE`): objects (cube, sphere,
monkey, plane, …), lights (sun/area/point/spot), camera, background, optional
spin animation. Example:

```json
{
  "background": "#161823",
  "objects": [
    {"type": "monkey", "location": [0, 0, 1], "color": "#5bc0de", "animate": "spin"}
  ],
  "lights": [{"type": "area", "location": [4, -4, 6], "energy": 1200}],
  "camera": {"location": [6, -6, 4.5], "rotation_deg": [66, 0, 45]}
}
```

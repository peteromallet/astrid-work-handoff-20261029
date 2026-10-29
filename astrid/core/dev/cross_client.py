"""Astrid's half of a cross-product test: who is connected, and a one-shot executor.

A browser test (the App) drives the real ``astrid`` CLI as a second client of the same Runtime. Two things
have no CLI verb, so this module supplies them over the existing SDK pieces and adds no connection logic:

``identity``
    Open ``AstridClient.open_from_launcher(start_pack_host=False)``. With the four
    ``ASTRID_TIMELINE_EVAL_{ENDPOINT,CREDENTIAL,REALM_ID,ACTOR_ID}`` variables set this returns an explicit
    client before ``ensure_runtime()``, so no launcher and no pack host start. Print what the handshake and
    health say: the realm, actor, Runtime instance and schema digest, and which Astrid source answered.

``host``
    Write the ``f2.marker`` CPU executor pack (it writes a solid-colour PNG and a 2 s solid-colour VP8 clip), register
    it, and run one claim through ``GenericPackHost`` with a worker credential. A fresh process per call; the endpoint
    is the ``ASTRID_TIMELINE_EVAL_ENDPOINT`` value, so the caller follows a restarted Runtime by re-reading discovery.
    ``--render`` adds the installed ``astrid/packs/rendering`` to the pack roots, so the same worker also registers
    (and claims) ``rendering.render``.

Every result is one JSON object on stdout. A failure is the exception's traceback on stderr and exit status 1.
"""
from __future__ import annotations

import argparse
import json
import os
import subprocess
from pathlib import Path
from typing import Any, Sequence

ENDPOINT_ENV = "ASTRID_TIMELINE_EVAL_ENDPOINT"
CAPABILITY_ID = "f2.marker"
OUTPUT_NAME = "marker"
CLIP_OUTPUT_NAME = "marker_clip"
PNG_SIZE = (64, 48)
CLIP_SIZE = (320, 180)
CLIP_SECONDS = 2
DEFAULT_COLOR = "e8452c"
DEFAULT_EXECUTOR_ID = "astrid-f2-marker"
# The marker is real work, not ``true``: the executor child draws the PNG with the standard library only, and ffmpeg
# (declared in ``isolation.binaries``) makes the clip, because ffmpeg cannot render a still image into a film but a render
# can only show a video. The clip is BT.601, which is what VP8 is (ffmpeg reads every VP8 frame as such), and the file
# says so completely: a decoder given an untagged clip guesses, a browser's <video> and its WebCodecs path guess
# differently, and then no two consumers agree on its colour.
# Media outputs are harvested through the ``{out}/manifest.json`` receipt the child writes.
_MARKER_CODE = r"""
import hashlib, json, struct, subprocess, zlib
from pathlib import Path
w, h = @W@, @H@
chunk = lambda t, d: struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d))
png = (b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0))
       + chunk(b'IDAT', zlib.compress((b'\x00' + bytes.fromhex('@COLOR@') * w) * h)) + chunk(b'IEND', b''))
out = Path('{out}')
(out / 'marker.png').write_bytes(png)
subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=0x@COLOR@:s=@CW@x@CH@:r=30:d=@SECONDS@',
                '-vf', 'format=rgb24,scale=out_color_matrix=bt601:out_range=tv,format=yuv420p',
                '-c:v', 'libvpx', '-pix_fmt', 'yuv420p', '-b:v', '1M', '-colorspace', 'smpte170m', '-color_primaries', 'smpte170m',
                '-color_trc', 'smpte170m', '-color_range', 'tv', '-an', str(out / 'marker.webm')], check=True)
clip = (out / 'marker.webm').read_bytes()
digest = lambda data: 'sha256:' + hashlib.sha256(data).hexdigest()
(out / 'manifest.json').write_text(json.dumps({'outputs': [
    {'name': 'marker', 'path': 'marker.png', 'artifact_type': 'image/png', 'ordinal': 0, 'role': 'result',
     'is_primary': True, 'bytes': len(png), 'content_hash': digest(png)},
    {'name': 'marker_clip', 'path': 'marker.webm', 'artifact_type': 'video/webm', 'ordinal': 1, 'role': 'result',
     'is_primary': False, 'bytes': len(clip), 'content_hash': digest(clip)}]}))
"""


def _astrid_head(source: Path) -> str | None:
    try:
        done = subprocess.run(["git", "-C", str(source), "rev-parse", "HEAD"], capture_output=True, text=True, timeout=10)
    except (OSError, subprocess.SubprocessError):
        return None
    return done.stdout.strip() or None if done.returncode == 0 else None


def identity() -> dict[str, Any]:
    import astrid
    from astrid.sdk.client import _REQUIRED_SCOPES, AstridClient

    with AstridClient.open_from_launcher(start_pack_host=False, client_name="astrid-cross-client") as client:
        health = client._remote.health()
        handshake = client._remote.handshake("astrid-cross-client", "f2", sorted(_REQUIRED_SCOPES))
    source = Path(astrid.__file__).resolve()
    return {
        "astrid_file": str(source),
        "astrid_head": _astrid_head(source.parent),
        "realm_id": handshake["realm_id"],
        "actor_id": handshake["actor_id"],
        "runtime_instance_id": health["runtime_instance_id"],
        "schema_digest": health["schema_digest"],
    }


def _marker_code(color: str) -> str:
    return (_MARKER_CODE.replace("@W@", str(PNG_SIZE[0])).replace("@H@", str(PNG_SIZE[1])).replace("@COLOR@", color)
            .replace("@CW@", str(CLIP_SIZE[0])).replace("@CH@", str(CLIP_SIZE[1])).replace("@SECONDS@", str(CLIP_SECONDS)))


def write_marker_pack(pack_root: Path, color: str) -> Path:
    """The ``f2.marker`` executor: ``marker`` (a 64x48 PNG of ``color``) and ``marker_clip`` (a 2 s 320x180 VP8 WebM of it)."""
    bytes.fromhex(color)
    if len(color) != 6:
        raise ValueError("--color must be six hex digits")
    pack = pack_root / "f2-marker"
    pack.mkdir(parents=True, exist_ok=True)
    (pack / "executor.yaml").write_text(json.dumps({
        "schema_version": 1,
        "id": CAPABILITY_ID,
        "name": "F2 Marker",
        "kind": "external",
        "version": "1.0",
        "command": {"argv": ["{python_exec}", "-c", _marker_code(color)]},
        "outputs": [
            {"name": OUTPUT_NAME, "type": "file", "path_template": "{out}/marker.png", "artifact_type": "image/png"},
            {"name": CLIP_OUTPUT_NAME, "type": "file", "path_template": "{out}/marker.webm", "artifact_type": "video/webm"},
        ],
        "isolation": {"binaries": ["ffmpeg"]},
        "metadata": {"adapter_family": "cpu", "resource_keys": ["cpu"]},
    }), encoding="utf-8")
    return pack


def host(args: argparse.Namespace) -> dict[str, Any]:
    import astrid
    from astrid.core.execution.generic_host import GenericPackHost, RuntimeProtocolClient
    from astrid.sdk.workspace_client import resolve_runtime_connection

    pack_root = Path(args.pack_root).resolve()
    write_marker_pack(pack_root, args.color)
    endpoint, token = resolve_runtime_connection(os.environ.get(ENDPOINT_ENV, ""), Path(args.worker_credential))
    # The installed rendering pack, so ``rendering.render`` is registered (and claimed) by this same worker.
    pack_roots: list[str | Path] = [pack_root]
    if args.render:
        pack_roots.append(Path(astrid.__file__).resolve().parent / "packs" / "rendering")
    runner = GenericPackHost(
        pack_roots=pack_roots,
        client=RuntimeProtocolClient(endpoint, token),
        executor_id=args.executor_id,
        attempt_root=pack_root.with_name(pack_root.name + "-attempts"),
    )
    runner.discover()
    # Admission needs the capability registered; a claim needs the claiming process to have registered it too.
    runner.register(deliberate=True)
    result: dict[str, Any] = {"capability_id": CAPABILITY_ID, "executor_id": args.executor_id}
    if args.run_once:
        settled = runner.run(once=True)
        task = settled[0] if settled else None
        result["task_id"] = task["task_id"] if task else None
        result["state"] = task["state"] if task else "idle"
        result["outputs"] = [
            {"name": item["name"], "ordinal": item.get("ordinal"), "object_id": item["digest"], "media_type": item["media_type"], "size": item["size"]}
            for item in (task or {}).get("result", {}).get("outputs", [])
        ]
    return result


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="python -m astrid.core.dev.cross_client", description=__doc__.split("\n\n")[0])
    commands = parser.add_subparsers(dest="command", required=True)
    commands.add_parser("identity", help="print the connected identity as JSON")
    hosting = commands.add_parser("host", help="register the f2.marker executor, optionally run one claim")
    hosting.add_argument("--pack-root", required=True, help="directory that receives the f2-marker pack")
    hosting.add_argument("--worker-credential", required=True, help="owner-only file holding the worker token")
    hosting.add_argument("--executor-id", default=DEFAULT_EXECUTOR_ID)
    hosting.add_argument("--color", default=DEFAULT_COLOR, help="PNG colour, six hex digits (fixed per run)")
    hosting.add_argument("--render", action="store_true", help="also host the installed rendering pack, so rendering.render is registered and claimed here")
    hosting.add_argument("--register", action="store_true", help="register the capability so tasks can be admitted, then exit")
    hosting.add_argument("--run-once", action="store_true", help="register, then claim and run at most one task")
    args = parser.parse_args(argv)
    if args.command == "host" and not (args.register or args.run_once):
        parser.error("host needs --register or --run-once")
    print(json.dumps(identity() if args.command == "identity" else host(args), sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

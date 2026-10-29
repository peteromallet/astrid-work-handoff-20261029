"""Shared fixtures for the browser door's conformance tests (runtime_protocol/door.py).

The door is exercised the way the hosted page uses it: raw HTTP to the loopback
port with an exact Host and Origin, against a real in-process daemon on a
throwaway realm.
"""

from __future__ import annotations

import http.client
import json
import os
import secrets
import subprocess
import sys
import urllib.request
from dataclasses import dataclass
from pathlib import Path

from runtime_protocol.daemon import RuntimeDaemon
from runtime_protocol.door import DoorConfig

HOSTED = "https://hosted.test"
PRODUCT_ACTOR = "astrid-door-product"


@dataclass
class Reply:
    status: int
    headers: dict[str, str]
    body: bytes

    def json(self):
        return json.loads(self.body.decode("utf-8"))


def door_call(port: int, path: str, method: str = "GET", *, headers: dict[str, str] | None = None, body: bytes | None = None,
              origin: str | None = HOSTED, host: str | None = None) -> Reply:
    """One request to the door on its own connection. ``origin=None`` sends no Origin; ``host`` overrides Host."""
    connection = http.client.HTTPConnection("127.0.0.1", port, timeout=30)
    try:
        sent = {"Host": host or f"127.0.0.1:{port}"}
        if origin is not None:
            sent["Origin"] = origin
        sent.update(headers or {})
        connection.putrequest(method, path, skip_host=True, skip_accept_encoding=True)
        for name, value in sent.items():
            connection.putheader(name, value)
        if body is not None and not any(name.lower() in ("content-length", "transfer-encoding") for name in sent):
            connection.putheader("Content-Length", str(len(body)))
        connection.endheaders(body)
        response = connection.getresponse()
        return Reply(response.status, {name.lower(): value for name, value in response.getheaders()}, response.read())
    finally:
        connection.close()


def write_owner_only(path: Path, value: dict, mode: int = 0o600) -> None:
    path.unlink(missing_ok=True)
    descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, mode)
    with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
        json.dump(value, handle)
    os.chmod(path, mode)


def create_realm(root: Path, display_name: str = "Door Realm") -> str:
    output = subprocess.run(
        [sys.executable, "-m", "runtime_protocol.cli", "create", "--root", str(root), "--display-name", display_name],
        check=True, capture_output=True, text=True,
    ).stdout
    return json.loads(output.strip().splitlines()[-1])["realm_id"]


@dataclass
class DoorWorld:
    """A daemon with a door on an ephemeral port; the product credential is provisioned by ``provision()``."""

    tmp: Path
    daemon: RuntimeDaemon
    credential_file: Path
    product_token: str | None = None

    @property
    def port(self) -> int:
        return self.daemon.door_httpd.server_port

    @property
    def support(self) -> Path:
        return self.daemon.support_root

    def call(self, path: str, method: str = "GET", **kwargs) -> Reply:
        return door_call(self.port, path, method, **kwargs)

    def owner(self, method: str, path: str, value=None, *, headers: dict[str, str] | None = None, raw: bytes | None = None):
        """A direct request to the Runtime's own listener with the owner credential: (status, body bytes)."""
        data = raw if raw is not None else (json.dumps(value).encode() if value is not None else None)
        request = urllib.request.Request(self.daemon.endpoint + path, data=data, method=method)
        request.add_header("Authorization", f"Bearer {self.daemon.token}")
        if value is not None:
            request.add_header("Content-Type", "application/json")
        for name, item in (headers or {}).items():
            request.add_header(name, item)
        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                return response.status, response.read()
        except urllib.error.HTTPError as exc:
            return exc.code, exc.read()

    def provision(self, actor: str = PRODUCT_ACTOR) -> str:
        """Provision the scoped product credential the way `astrid-runtime up` does, and hand it to the door."""
        token = secrets.token_urlsafe(24)
        status, body = self.owner("POST", "/v1/credentials", {"actor_id": actor, "credential": token, "scope": "astrid"})
        assert status == 201, body
        write_owner_only(self.credential_file, {"version": 1, "scope": "astrid", "actor_id": actor, "token": token})
        self.product_token = token
        return token

    def stop(self) -> None:
        self.daemon.stop()


def start_door_world(tmp: Path, *, provision: bool = True, **door_options) -> DoorWorld:
    realm = tmp / "realm"
    create_realm(realm)
    credential_file = tmp / "astrid.json"
    config = DoorConfig(origin=HOSTED, port=door_options.pop("port", 0), credential_file=credential_file, **door_options)
    daemon = RuntimeDaemon(realm, support_root=tmp / "support", door=config).start()
    world = DoorWorld(tmp, daemon, credential_file)
    if provision:
        world.provision()
    return world

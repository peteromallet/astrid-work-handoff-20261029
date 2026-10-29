"""Unwired, stdlib-only frame owner model.

No native adapter, process inspection, descriptor creation or renderer import is
provided here. Default admission is unsupported. Injected adapters in tests are
synthetic; this model establishes no installed renderer or C05 qualification.
"""
from __future__ import annotations

from dataclasses import dataclass, field
import hashlib
import json
import re
from pathlib import PurePosixPath
import threading

LIMIT = 64 * 1024
NODE_VERSION = "astrid.remotion-frame-node/v1"
LEASE_VERSION = "astrid.remotion-frame-lease/v1"
NAMESPACE_KEYS = frozenset({"workspace_uuid", "profile_binding_digest", "owner_epoch",
                           "custody_scope", "activation_host_pid", "activation_host_birth_id"})
ROOT_KEYS = frozenset({"realm_root", "support_root", "project_root", "owner_scope_identity"})
PIN_KEYS = frozenset({"boot_manifest", "node", "node_closure", "helper", "cli", "cli_import_closure",
                      "project_lock", "project_source_closure", "browser", "browser_closure", "wrapper_closure"})
POLICY_KEYS = frozenset({"browser_mode", "launch_cleanup_adapter", "backend_identity", "descriptor_policy",
                         "sandbox_tuple", "max_frames", "max_resolution"})


class FrameOwnerError(RuntimeError):
    pass


class UnsupportedContext(FrameOwnerError):
    pass


class CleanupUnresolved(FrameOwnerError):
    pass


class LeaseRevoked(FrameOwnerError):
    pass


def _json(value):
    try:
        return json.dumps(value, sort_keys=True, separators=(",", ":"), allow_nan=False).encode()
    except (ValueError, TypeError) as exc:
        raise FrameOwnerError("invalid frame JSON") from exc


def _freeze(value):
    if isinstance(value, dict):
        if any(not isinstance(key, str) for key in value):
            raise UnsupportedContext("context keys must be strings")
        return tuple(sorted((key, _freeze(item)) for key, item in value.items()))
    if isinstance(value, (list, tuple)):
        return tuple(_freeze(item) for item in value)
    if type(value) not in (str, int, bool, float, type(None)):
        raise UnsupportedContext("context is not immutable JSON data")
    _json(value)
    return value


def _path(value):
    if not isinstance(value, str) or not value or "\0" in value:
        raise UnsupportedContext("missing canonical path")
    path = PurePosixPath(value)
    if not path.is_absolute() or ".." in path.parts or str(path) != value:
        raise UnsupportedContext("path is not canonical absolute")
    return path


@dataclass(frozen=True)
class FrameContext:
    namespace: tuple
    roots: tuple
    artifact_pins: tuple
    policy: tuple
    qualification: tuple
    environment_digest: str
    owner_scope: str

    def __post_init__(self):
        values = (self.namespace, self.roots, self.artifact_pins, self.policy, self.qualification)
        if any(not isinstance(value, tuple) or _freeze(value) != value for value in values):
            raise UnsupportedContext("frame context must contain deeply immutable records")
        expected = "sha256:" + hashlib.sha256(_json(values[:4])).hexdigest()
        if self.environment_digest != expected:
            raise UnsupportedContext("frame context digest differs from retained values")
        namespace_digest = hashlib.sha256(_json(self.namespace)).hexdigest()
        expected_scope = str(_path(dict(self.roots)["support_root"]) / "frame-owners" / namespace_digest)
        if self.owner_scope != expected_scope:
            raise UnsupportedContext("frame owner scope differs from retained namespace")

    @classmethod
    def from_retained(cls, *, namespace, roots, artifact_pins, policy, qualification):
        """Copy trusted host facts; a record alone is not authentication.

        Production admission still requires a qualified backend. F1 checks
        lexical paths only, with no filesystem/sandbox/descriptor assertions.
        """
        if (not isinstance(namespace, dict) or set(namespace) != NAMESPACE_KEYS
                or not isinstance(roots, dict) or set(roots) != ROOT_KEYS
                or not isinstance(artifact_pins, dict) or set(artifact_pins) != PIN_KEYS
                or not isinstance(policy, dict) or set(policy) != POLICY_KEYS
                or not isinstance(qualification, dict) or not qualification
                or "qualified" in qualification):
            raise UnsupportedContext("incomplete retained frame context")
        if (type(namespace["activation_host_pid"]) is not int or namespace["activation_host_pid"] <= 0
                or any(not isinstance(v, str) or not v for k, v in namespace.items() if k != "activation_host_pid")
                or any(not v for v in artifact_pins.values())
                or any(not policy[k] for k in POLICY_KEYS - {"max_frames", "max_resolution"})
                or type(policy["max_frames"]) is not int or policy["max_frames"] <= 0
                or type(policy["max_resolution"]) is not int or policy["max_resolution"] <= 0):
            raise UnsupportedContext("invalid retained frame context")
        for pin in artifact_pins.values():
            if (not isinstance(pin, dict) or set(pin) != {"path", "sha256"}
                    or not isinstance(pin["sha256"], str)
                    or re.fullmatch(r"[0-9a-f]{64}", pin["sha256"]) is None):
                raise UnsupportedContext("artifact closure lacks an exact path/hash pin")
            _path(pin["path"])
        custody = _path(namespace["custody_scope"])
        for key in ("realm_root", "support_root", "project_root"):
            _path(roots[key])
        if not isinstance(roots["owner_scope_identity"], str) or not roots["owner_scope_identity"]:
            raise UnsupportedContext("missing owner scope identity")
        frozen = tuple(_freeze(item) for item in (namespace, roots, artifact_pins, policy))
        digest = "sha256:" + hashlib.sha256(_json(frozen)).hexdigest()
        namespace_digest = hashlib.sha256(_json(_freeze(namespace))).hexdigest()
        scope = _path(roots["support_root"]) / "frame-owners" / namespace_digest
        if scope == custody or scope.is_relative_to(custody) or custody.is_relative_to(scope):
            raise UnsupportedContext("frame owner scope overlaps Runtime custody")
        return cls(*frozen, _freeze(qualification), digest, str(scope))


@dataclass(frozen=True, eq=False)
class BackendHandle:
    backend: object
    token: object
    incarnation: str

    def __reduce__(self):
        raise TypeError("backend handles cannot be serialized")


@dataclass(frozen=True, eq=False)
class Obligation:
    kind: str
    handle: BackendHandle


@dataclass(eq=False)
class PendingGeneration:
    generation: int
    environment_digest: str
    token: object = field(default_factory=object)
    obligations: list = field(default_factory=list)
    _declared: tuple = field(default_factory=tuple, init=False, repr=False)

    def coverage_intact(self, original=None):
        declared = self._declared if original is None else original
        return (isinstance(self.obligations, list)
                and len(self._declared) == len(declared)
                and len(self.obligations) == len(declared)
                and all(row is original for row, original in zip(self._declared, declared))
                and all(row is original for row, original in zip(self.obligations, declared)))

    def declare(self, kind, handle):
        if kind not in {"node", "browser", "helper"} or not isinstance(handle, BackendHandle):
            raise FrameOwnerError("invalid declared frame obligation")
        obligation = Obligation(kind, handle)
        # Retain declarations independently of the producer compatibility list.
        self._declared += (obligation,)
        self.obligations.append(obligation)
        return obligation


@dataclass(frozen=True)
class WaitEvidence:
    obligation: Obligation
    kind: str
    reaper: BackendHandle | None
    exit_code: int


@dataclass(frozen=True)
class DrainProof:
    backend: object
    ticket_token: object
    generation: int
    environment_digest: str
    waits: tuple
    coverage_identity: str
    never_spawned: bool = False


@dataclass(frozen=True, eq=False)
class FrameLease:
    token: object
    generation: int
    environment_digest: str
    task_id: str
    attempt_id: str
    fence: str
    child_pid: int
    child_birth_id: str
    attempt_root: str


class UnsupportedBackend:
    """Default has no native capability and performs no discovery."""
    identity = "unsupported"

    def validate_context(self, context):
        raise UnsupportedContext("unsupported_context: no qualified frame backend")


class RemotionFrameOwner:
    def __init__(self, context=None, *, backend=None):
        self._context = context
        self.backend = backend if backend is not None else UnsupportedBackend()
        self.state = "idle"
        self.generation = 1
        self.pending = None
        self.handle = None
        self.first_failure = None
        self._coverage_error = None
        self.cleanup_evidence = []
        self._leases = {}
        self._lock = threading.RLock()
        self._startup = threading.Lock()
        self._exchange = threading.Lock()
        self._queued = self._inflight = self._seq = 0
        self._drained = self._invalidated = self._admitted = False

    @property
    def context(self):
        return self._context

    @property
    def environment_digest(self):
        return self.context.environment_digest if self.context is not None else None

    def _fence(self, error):
        with self._lock:
            if self.first_failure is None:
                self.first_failure = error
            self.state = "fenced"

    def _handle(self, value):
        if (not isinstance(value, BackendHandle) or value.backend is not self.backend
                or not isinstance(value.incarnation, str) or not value.incarnation):
            raise FrameOwnerError("foreign backend/incarnation handle")
        return value

    def _ensure_ready(self):
        with self._startup:
            with self._lock:
                if self._invalidated or self.state in {"fenced", "draining", "gone"}:
                    raise FrameOwnerError("frame_worker_unavailable")
                if self.state == "ready":
                    handle = self.handle
                else:
                    handle = None
            if handle is not None:
                try:
                    self.backend.verify(handle)
                except BaseException as exc:
                    self._fence(exc)
                    raise
                return
            if not isinstance(self.context, FrameContext):
                raise UnsupportedContext("unsupported_context: missing retained context")
            if dict(self.context.policy)["backend_identity"] != self.backend.identity:
                raise UnsupportedContext("unsupported_context: backend identity mismatch")
            self.backend.validate_context(self.context)  # before any reservation
            with self._lock:
                if self._invalidated or self.state != "idle":
                    raise FrameOwnerError("frame_worker_unavailable")
                if self._drained:
                    self.generation += 1
                    self._drained = False
                pending = PendingGeneration(self.generation, self.environment_digest)
                self.pending = pending  # published BEFORE a possibly failing reserve
                self.state = "starting"
            try:
                self.backend.reserve(pending)
                handle = self._handle(self.backend.start_suspended(pending))
                if (not pending.coverage_intact()
                        or [o.handle for o in pending._declared if o.kind == "node"] != [handle]
                        or len({id(o.handle) for o in pending.obligations}) != len(pending.obligations)):
                    raise FrameOwnerError("suspended Node lacks exact published obligations")
                for obligation in pending.obligations:
                    self._handle(obligation.handle)
                with self._lock:
                    self.handle = handle
                self.backend.publish_and_resume(handle)
                self.backend.verify(handle)
                with self._lock:
                    if self._invalidated or self.state != "starting":
                        raise FrameOwnerError("startup was invalidated")
                    self.state = "ready"
                    self._admitted = True
            except BaseException as exc:
                self._fence(exc)
                raise

    def acquire(self, *, task_id, attempt_id, fence, child_pid, child_birth_id, attempt_root, context=None):
        """Trusted host admission only; this API is not exposed to task frames."""
        if context is not None and context != self.context:
            raise FrameOwnerError("frame_context_mismatch")
        if (any(not isinstance(v, str) or not v for v in (task_id, attempt_id, fence, child_birth_id))
                or type(child_pid) is not int or child_pid <= 0):
            raise FrameOwnerError("invalid admitted task child")
        _path(attempt_root)
        self._ensure_ready()
        with self._lock:
            if self.state != "ready" or self._invalidated:
                raise FrameOwnerError("frame_worker_unavailable")
            lease = FrameLease(object(), self.generation, self.environment_digest,
                               task_id, attempt_id, fence, child_pid, child_birth_id, attempt_root)
            self._leases[lease.token] = lease
            return lease

    def hello(self, lease):
        with self._lock:
            self._valid_lease(lease)
            return {"version": LEASE_VERSION, "kind": "hello", "lease_id": str(id(lease.token)),
                    "task_id": lease.task_id, "attempt_id": lease.attempt_id, "fence": lease.fence,
                    "generation": lease.generation, "environment_digest": lease.environment_digest}

    def _valid_lease(self, lease):
        if (not isinstance(lease, FrameLease) or self._leases.get(lease.token) is not lease
                or lease.generation != self.generation or lease.environment_digest != self.environment_digest):
            raise LeaseRevoked("frame lease revoked")
        if self.state != "ready":
            raise FrameOwnerError("frame_worker_unavailable")

    def revoke_child(self, *, child_pid, child_birth_id):
        with self._lock:
            for token, lease in list(self._leases.items()):
                if lease.child_pid == child_pid and lease.child_birth_id == child_birth_id:
                    del self._leases[token]

    def _request(self, lease, request):
        if (not isinstance(request, dict) or set(request) != {"version", "request_id", "command", "payload"}
                or request["version"] != LEASE_VERSION or request["command"] != "render"
                or not isinstance(request["request_id"], str) or not request["request_id"]
                or len(_json(request)) > LIMIT):
            raise FrameOwnerError("invalid bounded task render envelope")
        payload = request["payload"]
        if (not isinstance(payload, dict) or set(payload) != {"composition_id", "props_path", "output_dir", "frames", "resolution"}
                or not isinstance(payload["composition_id"], str) or not payload["composition_id"]
                or type(payload["frames"]) is not int or not 0 < payload["frames"] <= dict(self.context.policy)["max_frames"]
                or type(payload["resolution"]) is not int or not 0 < payload["resolution"] <= dict(self.context.policy)["max_resolution"]):
            raise FrameOwnerError("invalid bounded render inputs")
        root = _path(lease.attempt_root)
        for key in ("props_path", "output_dir"):
            if not _path(payload[key]).is_relative_to(root):
                raise FrameOwnerError("render path is outside retained attempt root")
        return json.loads(_json(payload))

    def render(self, lease, request):
        payload = self._request(lease, request)
        with self._lock:
            self._valid_lease(lease)
            self._queued += 1
        queued = True
        inflight = False
        try:
            # Authentication calls do not run under the serialized exchange
            # lock; backend exchange must never hold its own custody guard.
            self.backend.verify(self.handle)
            with self._exchange:
                with self._lock:
                    self._queued -= 1; queued = False
                    self._valid_lease(lease)
                    self._inflight += 1; inflight = True
                    self._seq += 1
                    seq = self._seq; handle = self.handle
                frame = {"version": NODE_VERSION, "generation": lease.generation,
                         "environment_digest": lease.environment_digest, "seq": seq,
                         "command": "render", "payload": payload}
                reply = self.backend.exchange(handle, frame)
            self.backend.verify(handle)
            if (not isinstance(reply, dict) or len(_json(reply)) > LIMIT
                    or reply.get("status") not in {"ok", "error"}
                    or set(reply) != {"version", "generation", "environment_digest", "seq", "status",
                                       "result" if reply.get("status") == "ok" else "error_code"}
                    or type(reply.get("generation")) is not int or type(reply.get("seq")) is not int
                    or any(reply[k] != frame[k] for k in ("version", "generation", "environment_digest", "seq"))
                    or (reply["status"] == "error" and not isinstance(reply["error_code"], str))):
                raise FrameOwnerError("unresolved Node reply/delivery")
            with self._lock:
                self._valid_lease(lease)  # child exit discards delivered result
                # Node may start before lazy Chrome allocation. A successful
                # capture cannot omit that allocation's original obligation.
                if (reply["status"] == "ok" and (self.pending is None
                        or not self.pending.coverage_intact()
                        or len([o for o in self.pending._declared if o.kind == "browser"]) != 1)):
                    raise FrameOwnerError("frame result lacks the original browser obligation")
            return json.loads(_json(reply))
        except LeaseRevoked:
            raise
        except BaseException as exc:
            self._fence(exc)
            raise
        finally:
            with self._lock:
                if queued: self._queued -= 1
                if inflight: self._inflight -= 1

    def _drain_proof(self, proof, pending, observed_waits, obligations):
        if self._coverage_error is not None:
            raise CleanupUnresolved("original frame obligation coverage changed") from self._coverage_error
        if not pending.coverage_intact(obligations):
            raise CleanupUnresolved("original frame obligation coverage changed")
        if (not isinstance(proof, DrainProof) or proof.backend is not self.backend
                or proof.ticket_token is not pending.token or type(proof.generation) is not int
                or proof.generation != pending.generation
                or proof.environment_digest != pending.environment_digest
                or proof.coverage_identity != dict(self.context.roots)["owner_scope_identity"]
                or type(proof.never_spawned) is not bool):
            raise CleanupUnresolved("drain proof has a foreign subject")
        if proof.never_spawned:
            if pending.obligations or proof.waits:
                raise CleanupUnresolved("never-spawned proof conflicts with retained obligations")
            return
        if not obligations or len(proof.waits) != len(obligations):
            raise CleanupUnresolved("drain lacks declared obligation coverage")
        nodes = [o.handle for o in obligations if o.kind == "node"]
        if len(nodes) != 1:
            raise CleanupUnresolved("drain lacks exact retained Node")
        for obligation in obligations:
            waits = [w for w in proof.waits if isinstance(w, WaitEvidence) and w.obligation is obligation]
            if (len(waits) != 1 or type(waits[0].exit_code) is not int
                    or not any(waits[0] is observed for observed in observed_waits)):
                raise CleanupUnresolved("drain lacks positive exact child wait")
            wait = waits[0]
            if obligation.kind == "node" and (wait.kind != "host-reaped-node" or wait.reaper is not None):
                raise CleanupUnresolved("Node lacks host reap evidence")
            if obligation.kind == "browser" and (wait.kind != "authenticated-node-reaped-browser" or wait.reaper is not nodes[0]):
                raise CleanupUnresolved("browser lacks authenticated retained Node wait")
            if obligation.kind == "helper" and (wait.kind != "authenticated-helper-wait" or wait.reaper is not nodes[0]):
                raise CleanupUnresolved("helper coverage remains unresolved")

    def drain(self, *, idle_only=False, invalidate=False):
        with self._lock:
            if idle_only and (self._leases or self._queued or self._inflight or self.state != "ready"):
                return False
            if self._queued or self._inflight or self.state == "starting":
                raise CleanupUnresolved("frame work/startup still in flight")
            if invalidate:
                self._invalidated = True
            self._leases.clear()
            pending = self.pending
            if pending is None:
                self.state = "gone" if self._invalidated else "idle"
                return True
            if self.state == "draining":
                raise CleanupUnresolved("frame drain already in progress")
            self.state = "draining"
            # Hold the original obligations across every backend callback.
            # Removing a row during cleanup cannot manufacture complete drain.
            obligations = pending._declared
        try:
            # Browser waits precede Node termination. Transport close, group
            # observations and PID absence can never substitute for this proof.
            if self._admitted and self.handle is not None:
                try:
                    self.backend.verify(self.handle)
                    with self._exchange:
                        self._seq += 1
                        close = {"version": NODE_VERSION, "generation": pending.generation,
                                 "environment_digest": pending.environment_digest,
                                 "seq": self._seq, "command": "close", "payload": {}}
                        self.cleanup_evidence.append(self.backend.exchange(self.handle, close))
                    self.backend.verify(self.handle)
                except BaseException as exc:
                    # Ambiguous close still allows retained-authority cleanup;
                    # only exact positive waits can resolve the obligation.
                    if self.first_failure is None: self.first_failure = exc
                    self.cleanup_evidence.append(exc)
            observed_waits = []
            for kind in ("browser", "helper", "node"):
                for obligation in obligations:
                    if obligation.kind != kind: continue
                    self._handle(obligation.handle)
                    self.backend.signal(obligation, "TERM")
                    evidence = self.backend.collect_exit_evidence(obligation)
                    self.cleanup_evidence.append(evidence)
                    if evidence is None:
                        self.backend.signal(obligation, "KILL")
                        evidence = self.backend.collect_exit_evidence(obligation)
                        self.cleanup_evidence.append(evidence)
                    if evidence is not None:
                        observed_waits.append(evidence)
            proof = self.backend.prove_drain(pending)
            self.cleanup_evidence.append(proof)
            self._drain_proof(proof, pending, observed_waits, obligations)
            with self._lock:
                self.pending = self.handle = None
                self._admitted = False
                self._drained = True
                self.state = "gone" if self._invalidated else "idle"
            return True
        except BaseException as exc:
            current = pending.obligations
            if not pending.coverage_intact(obligations):
                # Preserve originals plus any newly exposed obligation. Such
                # a mutation cannot be repaired into complete history later.
                self._coverage_error = self._coverage_error or exc
                extra = [*pending._declared, *(current if isinstance(current, list) else [])]
                retained = list(obligations)
                for row in extra:
                    if not any(row is original for original in retained):
                        retained.append(row)
                pending.obligations = retained
                self.cleanup_evidence.append({"original_coverage_changed": True})
            self._fence(exc)
            raise CleanupUnresolved("frame cleanup remains unresolved") from exc

    def invalidate(self):
        with self._lock:
            self._invalidated = True
            self._leases.clear()
        return self.drain(invalidate=True)

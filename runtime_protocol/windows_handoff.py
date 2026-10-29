"""Native Windows worker transport, reached only through platform.py.

The token is a single-use capability, not process identity. GetExtendedTcpTable
supplies the peer PID; process_identity supplies its user and creation time.
Socket transfer uses Winsock's process-specific WSADuplicateSocket data (Python
share/fromshare), since DuplicateHandle is not valid for Winsock sockets.
"""
from __future__ import annotations

import ctypes
import hmac
import json
import os
from pathlib import Path
import secrets
import socket
import struct
import sys
import threading
import time
import weakref

from . import platform
from .errors import ConflictError

_pins = weakref.WeakKeyDictionary()
_pins_lock = threading.Lock()
IDENTITY_FIELDS = ("pid", "uid", "birth_id")
_SINGLE_INTERPRETER_FLAGS = ("-I", "-S", "-u", "-B", "-s", "-E")


def _consume_interpreter_prefix(arguments):
    flags = []
    arguments = list(arguments)
    while arguments:
        if arguments[0] in _SINGLE_INTERPRETER_FLAGS:
            flags.append(arguments.pop(0))
        elif arguments[:2] == ["-X", "utf8"]:
            flags.extend((arguments.pop(0), arguments.pop(0)))
        else:
            break
    return flags, arguments


def identity(value):
    if (not isinstance(value, dict) or any(key not in value for key in IDENTITY_FIELDS)
            or type(value["pid"]) is not int or value["pid"] <= 0
            or type(value["uid"]) is not int or value["uid"] < 0
            or not isinstance(value["birth_id"], str) or not value["birth_id"]):
        raise ConflictError("handoff peer process identity is unavailable")
    return {key: value[key] for key in IDENTITY_FIELDS}


def tcp_peer_pid(channel):
    """Read the reverse established IPv4 tuple, never a client-supplied PID."""
    from ctypes import wintypes

    library = ctypes.WinDLL("iphlpapi", use_last_error=True)
    query = library.GetExtendedTcpTable
    query.argtypes = [ctypes.c_void_p, ctypes.POINTER(wintypes.DWORD), wintypes.BOOL,
                      wintypes.ULONG, ctypes.c_int, wintypes.ULONG]
    query.restype = wintypes.DWORD
    size = wintypes.DWORD()
    result = query(None, ctypes.byref(size), False, socket.AF_INET, 5, 0)
    # TCP_TABLE_OWNER_PID_ALL = 5; the table can grow between the two calls.
    for _ in range(4):
        if result != 122 or size.value > 16 * 1024 * 1024:
            raise ConflictError("cannot authenticate handoff transfer peer PID")
        buffer = ctypes.create_string_buffer(size.value)
        result = query(buffer, ctypes.byref(size), False, socket.AF_INET, 5, 0)
        if result == 0:
            break
    if result != 0:
        raise ConflictError("cannot authenticate handoff transfer peer PID")
    return tcp_peer_from_table(bytes(buffer), channel.getsockname(), channel.getpeername())


def tcp_peer_from_table(table, local, remote):
    if len(table) < 4:
        raise ConflictError("handoff TCP owner table is malformed")
    count, = struct.unpack_from("=I", table)
    if 4 + count * 24 > len(table):
        raise ConflictError("handoff TCP owner table is malformed")
    matches = []
    for index in range(count):
        state, address1, port1, address2, port2, pid = struct.unpack_from("=6I", table, 4 + index * 24)
        address = lambda value: socket.inet_ntoa(struct.pack("=I", value))
        endpoint = (address(address1), socket.ntohs(port1 & 0xffff))
        other = (address(address2), socket.ntohs(port2 & 0xffff))
        if state == 5 and endpoint == remote and other == local:
            matches.append(pid)
    if len(matches) != 1 or matches[0] <= 0:
        raise ConflictError("cannot authenticate handoff transfer peer PID")
    return matches[0]


def observe_peer(channel):
    if channel.family != socket.AF_INET:
        raise ConflictError("handoff transfer channel must be loopback TCP")
    if channel.getsockname()[0] != "127.0.0.1" or channel.getpeername()[0] != "127.0.0.1":
        raise ConflictError("handoff transfer channel must be loopback TCP")
    pid = tcp_peer_pid(channel)
    observed = identity(platform.process_identity(pid))
    if tcp_peer_pid(channel) != pid or observed != identity(platform.process_identity(pid)):
        raise ConflictError("handoff peer process incarnation changed")
    return observed


def verify_peer(channel, expected=None):
    observed = observe_peer(channel)
    with _pins_lock:
        pinned = _pins.get(getattr(channel, "_handoff_channel", channel))
    if expected is None:
        expected = pinned
    if expected is None or observed != identity(expected) or observed["uid"] != platform.current_user():
        raise ConflictError("handoff transfer peer incarnation is invalid")
    if pinned is not None and pinned != observed:
        raise ConflictError("handoff transfer peer incarnation changed")
    return observed


def pin_peer(channel, expected):
    observed = verify_peer(channel, expected)
    with _pins_lock:
        _pins[getattr(channel, "_handoff_channel", channel)] = observed
    return observed


def read_exact(channel, count, *, deadline=None):
    data = bytearray()
    while len(data) < count:
        if deadline is not None:
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise TimeoutError("handoff transport authentication timed out")
            channel.settimeout(remaining)
        part = channel.recv(count - len(data))
        if not part:
            raise ConflictError("handoff authority transfer channel closed")
        data.extend(part)
    return bytes(data)


class Listener:
    def __init__(self, expected=None, *, timeout=5.0):
        self.expected = identity(expected) if expected is not None else None
        self.token = secrets.token_hex(32)
        self.used = False
        self._token_lock = threading.Lock()
        self.socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        try:
            self.socket.setsockopt(socket.SOL_SOCKET, socket.SO_EXCLUSIVEADDRUSE, 1)
            self.socket.set_inheritable(False)
            self.socket.settimeout(timeout)
            self.socket.bind(("127.0.0.1", 0))
            self.socket.listen(4)
        except BaseException:
            self.socket.close()
            raise
        self.timeout = timeout
        self.owner = identity(platform.process_identity(os.getpid()))

    @property
    def endpoint(self):
        return json.dumps({"port": self.socket.getsockname()[1], "token": self.token,
                           "owner": self.owner}, separators=(",", ":"))

    def accept(self, expected=None, *, acceptor=None, frame_io=None, deadline=None):
        if deadline is None:
            deadline = time.monotonic() + self.timeout
        acceptor = self.socket if acceptor is None else acceptor
        while True:
            if self.used:
                raise ConflictError("handoff transport token was already consumed")
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise TimeoutError("handoff transport authentication timed out")
            acceptor.settimeout(remaining)
            channel, _ = acceptor.accept()
            try:
                channel.set_inheritable(False)
                selected = expected if expected is not None else self.expected
                if callable(selected):
                    selected = selected(observe_peer(channel))
                pin_peer(channel, selected)
                reader = channel if frame_io is None else frame_io(channel)
                supplied = read_exact(reader, 64, deadline=deadline)
                if not hmac.compare_digest(supplied, self.token.encode("ascii")):
                    raise ConflictError("handoff transport token is invalid")
                verify_peer(channel)
                with self._token_lock:
                    if self.used:
                        raise ConflictError("handoff transport token was already consumed")
                    remaining = deadline - time.monotonic()
                    if remaining <= 0:
                        raise TimeoutError("handoff transport authentication timed out")
                    channel.settimeout(remaining)
                    channel.sendall(b"\x01")
                    self.used = True
                channel.settimeout(self.timeout)
                return channel
            except (ConflictError, OSError):
                # A local connection is not admission. Keep the capability for
                # the selected child, with no new budget for rejected peers.
                channel.close()
            except BaseException:
                channel.close()
                raise

    def accept_child(self, parent, *, deadline=None):
        def select(observed):
            actual = platform.process_identity(observed["pid"])
            if actual is None or actual.get("parent_pid") != parent["pid"]:
                raise ConflictError("handoff child launch lineage is invalid")
            return observed
        return self.accept(select, deadline=deadline), None

    def close(self):
        self.socket.close()


def connect(endpoint, *, expected=None, timeout=5.0):
    try:
        value = json.loads(endpoint)
        if set(value) != {"port", "token", "owner"} or type(value["port"]) is not int or not 1 <= value["port"] <= 65535:
            raise ValueError()
        token = value["token"]
        if not isinstance(token, str) or len(token) != 64 or any(c not in "0123456789abcdef" for c in token):
            raise ValueError()
        owner = identity(value["owner"])
        if expected is not None and owner != identity(expected):
            raise ValueError()
    except (TypeError, ValueError, KeyError) as exc:
        raise ConflictError("handoff transport endpoint is invalid") from exc
    channel = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    deadline = time.monotonic() + timeout
    try:
        channel.settimeout(timeout)
        channel.connect(("127.0.0.1", value["port"]))
        pin_peer(channel, owner)
        channel.sendall(token.encode("ascii"))
        if read_exact(channel, 1, deadline=deadline) != b"\x01":
            raise ConflictError("handoff transport authentication failed")
        verify_peer(channel)
        channel.settimeout(timeout)
        return channel
    except BaseException:
        channel.close()
        raise


def send(channel, payload, descriptors=()):
    peer = verify_peer(channel)
    if not descriptors:
        channel.sendall(payload)
        return
    shares = []
    for descriptor in descriptors:
        borrowed = socket.socket(fileno=descriptor)
        try:
            shares.append(borrowed.share(peer["pid"]))
        finally:
            borrowed.detach()
    # Transport metadata encloses the unchanged protocol frame. Bound both the
    # count and native WSAPROTOCOL_INFO size before receiver allocation.
    if len(shares) not in (0, 2) or any(len(value) > 4096 for value in shares):
        raise ConflictError("handoff transfer must carry exactly two authority descriptors")
    header = struct.pack("!II", len(payload), len(shares))
    attachments = b"".join(struct.pack("!I", len(value)) + value for value in shares)
    verify_peer(channel)
    channel.sendall(b"\x00" + header + attachments + payload)


def receive(channel, limit):
    verify_peer(channel)
    first = read_exact(channel, 1)
    if first != b"\x00":
        return first, []
    length, count = struct.unpack("!II", read_exact(channel, 8))
    if length > limit or count != 2:
        raise ConflictError("handoff transfer carried an invalid frame boundary")
    sockets = []
    try:
        for _ in range(count):
            size, = struct.unpack("!I", read_exact(channel, 4))
            if size == 0 or size > 4096:
                raise ConflictError("handoff transfer descriptor record is invalid")
            value = socket.fromshare(read_exact(channel, size))
            sockets.append(value)
            value.set_inheritable(False)
        payload = read_exact(channel, length)
        verify_peer(channel)
        return payload, [value.detach() for value in sockets]
    except BaseException:
        for value in sockets:
            try:
                value.close()
            except OSError:
                pass
        raise


class InheritedHandles:
    """A bounded Python worker launch using STARTUPINFO.handle_list.

    Raw Winsock handles keep their numeric value in the child. CRT file
    descriptors are reconstructed by the bootstrap before the selected module
    sees them. An independent single-use connection authenticates the child
    before spawn_tree returns it to a protocol owner.
    """
    def __init__(self, argv, kwargs, descriptors):
        import msvcrt
        import subprocess
        self.listener = Listener(timeout=10.0)
        self.handles = []
        self.previous = []
        files, sockets = {}, []
        try:
            for descriptor in descriptors:
                try:
                    borrowed = socket.socket(fileno=descriptor)
                except OSError:
                    handle = msvcrt.get_osfhandle(descriptor)
                    files[str(descriptor)] = handle
                else:
                    borrowed.detach()
                    handle = descriptor
                    sockets.append(handle)
                self.handles.append(handle)
                self.previous.append(os.get_handle_inheritable(handle))
                os.set_handle_inheritable(handle, True)
            startup = kwargs.setdefault("startupinfo", subprocess.STARTUPINFO())
            attributes = dict(startup.lpAttributeList or {})
            attributes["handle_list"] = [*attributes.get("handle_list", []), *self.handles]
            startup.lpAttributeList = attributes
            environment = dict(kwargs.get("env") if kwargs.get("env") is not None else os.environ)
            executable = python_executable(argv[0])
            environment.pop("__PYVENV_LAUNCHER__", None)
            if executable != argv[0]:
                environment["__PYVENV_LAUNCHER__"] = str(argv[0])
            environment["ASTRID_RUNTIME_WORKER_BOOTSTRAP"] = json.dumps({
                "endpoint": self.listener.endpoint, "argv": list(argv), "files": files,
                "sockets": sockets,
            }, separators=(",", ":"))
            kwargs.update(env=environment, close_fds=True)
            # Strict workers install their network guard before site.main;
            # the authenticated bootstrap must also suppress automatic site.
            flags, _arguments = _consume_interpreter_prefix(argv[1:])
            self.argv = [executable, *flags, str(Path(__file__).with_name("windows_worker_bootstrap.py"))]
        except BaseException:
            self.close()
            raise

    def authenticate(self, process):
        deadline = time.monotonic() + self.listener.timeout
        expected = identity(platform.handoff_child_identity(process))
        channel = self.listener.accept(expected, deadline=deadline)
        try:
            if read_exact(channel, 1, deadline=deadline) != b"\x02":
                raise ConflictError("worker bootstrap authentication was incomplete")
        finally:
            channel.close()

    def restore(self):
        for handle, previous in zip(self.handles, self.previous):
            os.set_handle_inheritable(handle, previous)
        self.handles.clear()
        self.previous.clear()

    def close(self):
        self.listener.close()
        self.restore()


def run_worker():
    """Enter the selected Python module in this authenticated process/PID."""
    import msvcrt
    value = json.loads(os.environ.pop("ASTRID_RUNTIME_WORKER_BOOTSTRAP"))
    channel = connect(value["endpoint"], timeout=10.0)
    owner = verify_peer(channel)
    channel.sendall(b"\x02")
    channel.close()
    for number, handle in value["files"].items():
        os.set_handle_inheritable(handle, False)
        descriptor = msvcrt.open_osfhandle(handle, os.O_RDWR | os.O_BINARY)
        if descriptor != int(number):
            os.dup2(descriptor, int(number), inheritable=False)
            os.close(descriptor)
    # The inherited endpoint's TCP owner is its creator (the Runtime). It is
    # suitable only for original-owner control; successor authentication always
    # uses a newly accepted connection with its own kernel peer observation.
    for handle in value["sockets"]:
        os.set_handle_inheritable(handle, False)
    # Pin inherited original-owner sockets on demand without retaining wrapper
    # objects which could close a handle owned by the selected module.
    global _inherited_owner, _inherited_sockets
    _inherited_owner = owner
    _inherited_sockets = {}
    for handle in value["sockets"]:
        borrowed = socket.socket(fileno=handle)
        try:
            _inherited_sockets[handle] = (borrowed.getsockname(), borrowed.getpeername())
        finally:
            borrowed.detach()
    return enter_module(value["argv"])


def enter_module(argv):
    import runpy
    import sys
    # A same-process module transition cannot switch Python installations.
    if os.path.normcase(os.path.realpath(argv[0])) != os.path.normcase(os.path.realpath(sys.executable)):
        raise ConflictError("Windows custody target requires the selected Python interpreter")
    flags, arguments = _consume_interpreter_prefix(argv[1:])
    if "-X" in flags and sys.flags.utf8_mode != 1:
        raise ConflictError("Windows custody UTF-8 flag was not active in the selected interpreter")
    if len(arguments) < 2 or arguments[0] not in ("-m", "-c"):
        raise ConflictError("Windows worker launch requires a Python module or command")
    if "-I" not in flags:
        roots = [] if "-E" in flags else os.environ.get("PYTHONPATH", "").split(os.pathsep)
        sys.path[:0] = [os.getcwd(), *[root for root in roots if root and root not in sys.path]]
    if arguments[0] == "-c":
        sys.argv = ["-c", *arguments[2:]]
        exec(compile(arguments[1], "<string>", "exec"), {"__name__": "__main__"})
    else:
        sys.argv = arguments[1:]
        runpy.run_module(arguments[1], run_name="__main__", alter_sys=True)


_inherited_owner = None
_inherited_sockets = {}


def adopt_socket(descriptor):
    channel = socket.socket(fileno=descriptor)
    try:
        channel.set_inheritable(False)
        endpoints = _inherited_sockets.pop(descriptor, None)
        if endpoints != (channel.getsockname(), channel.getpeername()):
            raise ConflictError("inherited Worker control endpoint identity changed")
        pin_peer(channel, _inherited_owner)
        return channel
    except BaseException:
        channel.close()
        raise


def peer_token(channel):
    before = verify_peer(channel)
    token = platform.handoff_token(before["pid"])
    after = verify_peer(channel)
    if (before != after or token["uid"] != before["uid"]
            or f"windows-creation:{token['pidversion']}" != before["birth_id"]):
        raise ConflictError("handoff peer process incarnation changed")
    return token


def python_executable(requested):
    """Bypass CPython's venv redirector so Popen retains the interpreter PID.

    This is the same __PYVENV_LAUNCHER__ boundary used by the stdlib's Windows
    multiprocessing launcher. The lexical venv executable remains sys.executable.
    """
    requested = str(requested)
    if os.path.normcase(requested) == os.path.normcase(sys.executable):
        return getattr(sys, "_base_executable", None) or requested
    executable = Path(requested)
    config = executable.parent.parent / "pyvenv.cfg"
    if executable.parent.name.lower() != "scripts" or not config.is_file():
        return requested
    values = {}
    for line in config.read_text(encoding="utf-8").splitlines():
        key, separator, value = line.partition("=")
        if separator:
            values[key.strip().lower()] = value.strip()
    home = Path(values.get("home", ""))
    base = home / "python.exe"
    if not home.is_absolute() or not base.is_file():
        raise ConflictError("configured Worker venv has no observable base Python")
    return str(base)

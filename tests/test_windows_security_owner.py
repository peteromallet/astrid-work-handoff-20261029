import ctypes
from types import SimpleNamespace

import pytest

from runtime_protocol import windows_security as security


def _sid(value):
    return ctypes.create_string_buffer(bytes([1, 1, 0, 0, 0, 0, 0, 0, value, 0, 0, 0]))


def _sid_label(sid):
    return {
        1: "S-1-5-21-user",
        2: "S-1-5-32-544",
        3: "S-1-5-18",
        4: "S-1-1-0",
    }[ctypes.string_at(sid, 12)[8]]


def test_token_sid_query_copies_sid_before_closing_token(monkeypatch):
    closed = []
    info_classes = []
    buffers = []

    class Advapi:
        def OpenProcessToken(self, _process, _access, output):
            ctypes.cast(output, ctypes.POINTER(ctypes.c_void_p))[0] = ctypes.c_void_p(42)
            return 1

        def GetTokenInformation(self, _token, info_class, buffer, _size, needed):
            info_classes.append(info_class)
            ctypes.cast(needed, ctypes.POINTER(ctypes.c_uint32))[0] = ctypes.c_uint32(
                ctypes.sizeof(ctypes.c_void_p) + 12
            )
            if buffer is not None:
                assert info_class in (1, 4)
                buffers.append(buffer)
                sid = bytes([1, 1, 0, 0, 0, 0, 0, 0, info_class, 0, 0, 0])
                sid_address = ctypes.addressof(buffer) + ctypes.sizeof(ctypes.c_void_p)
                ctypes.memmove(sid_address, sid, len(sid))
                ctypes.cast(buffer, ctypes.POINTER(ctypes.c_void_p))[0] = ctypes.c_void_p(sid_address)
            return 1

        IsValidSid = staticmethod(lambda _sid: 1)
        GetLengthSid = staticmethod(lambda _sid: 12)

    adv = Advapi()
    def close_handle(handle):
        closed.append(handle.value)
        buffer = buffers[-1]
        sid_address = ctypes.addressof(buffer) + ctypes.sizeof(ctypes.c_void_p)
        ctypes.memset(sid_address, 0xAA, 12)
        return 1

    kernel = SimpleNamespace(GetCurrentProcess=lambda: 7, CloseHandle=close_handle)
    monkeypatch.setattr(security, "_api", lambda: (adv, kernel))

    assert ctypes.string_at(security._user_sid(), 12)[8] == 1
    assert ctypes.string_at(security._default_owner_sid(), 12)[8] == 4
    assert info_classes == [1, 1, 4, 4]
    assert closed == [42, 42]


def _validation_api(owner_sid, dacl_sid):
    owner = ctypes.c_void_p(ctypes.addressof(owner_sid))
    dacl = ctypes.create_string_buffer(ctypes.sizeof(security._Acl))
    acl = ctypes.cast(dacl, ctypes.POINTER(security._Acl)).contents
    acl.count = 1
    ace = ctypes.create_string_buffer(8 + 12)
    ace.raw = bytes([0, 0, 20, 0]) + (0x001F01FF).to_bytes(4, "little") + dacl_sid.raw[:12]
    descriptor = ctypes.create_string_buffer(1)

    def set_pointer(output, value):
        ctypes.cast(output, ctypes.POINTER(ctypes.c_void_p))[0] = value

    def get_security_info(_handle, _kind, _flags, owner_out, _group, dacl_out, _sacl, descriptor_out):
        set_pointer(owner_out, owner)
        set_pointer(dacl_out, ctypes.c_void_p(ctypes.addressof(dacl)))
        set_pointer(descriptor_out, ctypes.c_void_p(ctypes.addressof(descriptor)))
        return 0

    def get_ace(_dacl, _index, output):
        set_pointer(output, ctypes.c_void_p(ctypes.addressof(ace)))
        return 1

    def get_control(_descriptor, control, _revision):
        ctypes.cast(control, ctypes.POINTER(ctypes.c_uint16))[0] = 0x1000
        return 1

    adv = SimpleNamespace(
        GetSecurityInfo=get_security_info,
        IsValidSid=lambda _sid: 1,
        EqualSid=lambda left, right: ctypes.string_at(left, 12) == ctypes.string_at(right, 12),
        GetLengthSid=lambda _sid: 12,
        GetAce=get_ace,
        IsValidAcl=lambda _dacl: 1,
        GetSecurityDescriptorControl=get_control,
    )
    kernel = SimpleNamespace(LocalFree=lambda _descriptor: None)
    return adv, kernel


@pytest.mark.parametrize("owner_kind", ["user", "default_owner"])
def test_validate_accepts_token_user_or_token_owner_with_user_dacl(monkeypatch, owner_kind):
    user, default_owner = _sid(1), _sid(2)
    owner = user if owner_kind == "user" else default_owner
    adv, kernel = _validation_api(owner, user)
    monkeypatch.setattr(security, "_api", lambda: (adv, kernel))
    monkeypatch.setattr(security, "_user_sid", lambda: user)
    monkeypatch.setattr(security, "_default_owner_sid", lambda: default_owner)
    monkeypatch.setattr(security, "_sid_text", _sid_label)
    security._validate_handle(1)


def test_validate_rejects_foreign_owner(monkeypatch):
    user, default_owner, foreign = _sid(1), _sid(2), _sid(3)
    adv, kernel = _validation_api(foreign, foreign)
    monkeypatch.setattr(security, "_api", lambda: (adv, kernel))
    monkeypatch.setattr(security, "_user_sid", lambda: user)
    monkeypatch.setattr(security, "_default_owner_sid", lambda: default_owner)
    with pytest.raises(PermissionError, match="owner is not the current token user or default owner"):
        security._validate_handle(1)


def test_validate_rejects_everyone_write_even_when_default_owner(monkeypatch):
    user, default_owner, everyone = _sid(1), _sid(2), _sid(4)
    adv, kernel = _validation_api(default_owner, everyone)
    monkeypatch.setattr(security, "_api", lambda: (adv, kernel))
    monkeypatch.setattr(security, "_user_sid", lambda: user)
    monkeypatch.setattr(security, "_default_owner_sid", lambda: default_owner)
    monkeypatch.setattr(security, "_sid_text", _sid_label)
    with pytest.raises(PermissionError, match="DACL grants access outside current token user and SYSTEM"):
        security._validate_handle(1)


def test_validate_rejects_administrators_dacl_even_when_default_owner(monkeypatch):
    user, default_owner = _sid(1), _sid(2)
    adv, kernel = _validation_api(default_owner, default_owner)
    monkeypatch.setattr(security, "_api", lambda: (adv, kernel))
    monkeypatch.setattr(security, "_user_sid", lambda: user)
    monkeypatch.setattr(security, "_default_owner_sid", lambda: default_owner)
    monkeypatch.setattr(security, "_sid_text", _sid_label)
    with pytest.raises(PermissionError, match="DACL grants access outside current token user and SYSTEM"):
        security._validate_handle(1)

from __future__ import annotations

import json
from urllib.error import HTTPError
from urllib.request import Request, urlopen

import pytest

from runtime_protocol.daemon import RuntimeDaemon
from runtime_protocol.errors import ConflictError, ValidationError
from runtime_protocol.service import RuntimeService
from runtime_protocol.store import RealmStore

TOUR = {'version': 1, 'outcome': 'started', 'step': 'welcome', 'at': '2026-10-21T00:00:00Z'}


@pytest.fixture
def service(tmp_path):
    root = tmp_path / 'realm'
    RealmStore.initialize(root).close()
    value = RuntimeService(root)
    yield value
    value.close()


def write(service, actor='alice', content=TOUR, version=0, idem='k1', key='editor-tour'):
    return service.update_app_state(key, content, version, idem, identity={'actor': actor})


def read(service, actor='alice', key='editor-tour'):
    return service.get_app_state(key, identity={'actor': actor})


def test_absent_read_is_empty_and_writes_nothing(service):
    before = service.store.conn.execute('SELECT COUNT(*) FROM command_idempotency').fetchone()[0]
    assert read(service) == {'scope': 'user', 'actor_id': 'alice', 'key': 'editor-tour', 'content': None,
                             'version': 0, 'created_at': None, 'updated_at': None}
    assert service.store.conn.execute('SELECT COUNT(*) FROM user_app_state').fetchone()[0] == 0
    assert service.store.conn.execute('SELECT COUNT(*) FROM command_idempotency').fetchone()[0] == before


def test_create_read_update_with_version_check(service):
    created = write(service)
    assert created['receipt'] is None and created['data']['version'] == 1
    assert read(service)['content'] == TOUR
    done = {**TOUR, 'outcome': 'completed', 'step': 'finale'}
    with pytest.raises(ConflictError):
        write(service, content=done, version=0, idem='stale-create')
    with pytest.raises(ConflictError):
        write(service, content=done, version=5, idem='future')
    updated = write(service, content=done, version=1, idem='k2')
    assert updated['data']['version'] == 2 and updated['data']['content'] == done
    with pytest.raises(ConflictError):
        write(service, content=TOUR, version=1, idem='stale-update')
    assert read(service)['content'] == done


def test_same_idempotency_key_replays_after_version_moves(service):
    first = write(service)
    write(service, content={**TOUR, 'outcome': 'completed'}, version=1, idem='k2')
    assert write(service) == first
    with pytest.raises(Exception):
        write(service, content={'other': True}, idem='k1')


def test_keys_are_independent_and_actors_are_isolated(service):
    write(service)
    write(service, key='other-key', content={'x': 1}, idem='o')
    assert read(service, key='other-key')['content'] == {'x': 1}
    assert read(service, actor='bob')['version'] == 0 and read(service, actor='bob')['content'] is None
    write(service, actor='bob', content={'bob': True}, idem='b')
    assert read(service)['content'] == TOUR
    assert read(service, actor='bob')['content'] == {'bob': True}
    with pytest.raises(ConflictError):
        write(service, actor='bob', version=0, idem='b2')


@pytest.mark.parametrize('key', ['', 'Upper', '-lead', 'a/b', 'a b', 'x' * 65, '.hidden'])
def test_bad_keys_rejected(service, key):
    with pytest.raises(ValidationError):
        read(service, key=key)
    with pytest.raises(ValidationError):
        write(service, key=key)


@pytest.mark.parametrize('content', ['text', 3, None, ['a'], True])
def test_content_must_be_an_object(service, content):
    with pytest.raises(ValidationError):
        write(service, content=content)


def test_oversize_content_rejected_and_boundary_accepted(service):
    with pytest.raises(ValidationError):
        write(service, content={'blob': 'x' * RuntimeService.APP_STATE_MAX_BYTES})
    assert service.store.conn.execute('SELECT COUNT(*) FROM user_app_state').fetchone()[0] == 0
    write(service, content={'blob': 'x' * (RuntimeService.APP_STATE_MAX_BYTES - 20)})


@pytest.mark.parametrize('version', [-1, True, '0', 1.5, None])
def test_expected_version_validation(service, version):
    with pytest.raises(ValidationError):
        write(service, version=version)


def test_actor_is_required(service):
    with pytest.raises(Exception):
        service.get_app_state('editor-tour', identity={})
    with pytest.raises(Exception):
        service.update_app_state('editor-tour', TOUR, 0, 'k', identity=None)


def request(daemon, token, method, route, body=None, key=None):
    raw = None if body is None else json.dumps(body).encode()
    headers = {'Authorization': f'Bearer {token}', 'Content-Type': 'application/json'}
    if key:
        headers['Idempotency-Key'] = key
    req = Request(daemon.endpoint + route, data=raw, method=method, headers=headers)
    try:
        with urlopen(req) as response:
            return response.status, json.loads(response.read() or b'null')
    except HTTPError as error:
        return error.code, json.loads(error.read() or b'null')


def test_http_owner_comes_from_bearer_identity(tmp_path):
    root = tmp_path / 'realm'
    RealmStore.initialize(root).close()
    daemon = RuntimeDaemon(root, support_root=tmp_path / 'support').start()
    try:
        alice, _ = daemon.credentials.provision('alice', ['projects:read', 'projects:write'])
        bob, _ = daemon.credentials.provision('bob', ['projects:read', 'projects:write'])
        readonly, _ = daemon.credentials.provision('reader', ['projects:read'])
        route = '/v1/app-state/user/editor-tour'
        assert request(daemon, alice, 'GET', route)[1]['version'] == 0
        status, result = request(daemon, alice, 'PUT', route, {'content': TOUR, 'expected_version': 0}, 'a1')
        assert status == 200 and result['receipt'] is None and result['data']['actor_id'] == 'alice'
        assert request(daemon, alice, 'GET', route)[1]['content'] == TOUR
        assert request(daemon, bob, 'GET', route)[1]['content'] is None
        assert request(daemon, bob, 'PUT', route, {'content': {'b': 1}, 'expected_version': 1}, 'b1')[0] == 409
        assert request(daemon, bob, 'PUT', route, {'content': {'b': 1}, 'expected_version': 0}, 'b2')[0] == 200
        assert request(daemon, alice, 'GET', route)[1]['content'] == TOUR
        for field in ['actor_id', 'owner', 'scope']:
            assert request(daemon, alice, 'PUT', route, {'content': TOUR, 'expected_version': 1, field: 'bob'}, 'x')[0] == 400
        assert request(daemon, alice, 'PUT', route, {'content': TOUR, 'expected_version': 1})[0] == 400
        assert request(daemon, alice, 'GET', route + '?actor_id=bob')[0] in (400, 422)
        assert request(daemon, readonly, 'PUT', route, {'content': TOUR, 'expected_version': 1}, 'r')[0] == 401
        assert request(daemon, readonly, 'GET', route)[0] == 200
        assert request(daemon, alice, 'GET', '/v1/app-state/user/Bad_Key')[0] == 422
        big = {'content': {'blob': 'x' * 20000}, 'expected_version': 1}
        assert request(daemon, alice, 'PUT', route, big, 'big')[0] == 422
        assert request(daemon, alice, 'PUT', route, {'content': 'text', 'expected_version': 1}, 'txt')[0] == 422
    finally:
        daemon.stop()


def test_generated_python_client_round_trip(tmp_path):
    from astrid_runtime_client import WorkspaceClient
    root = tmp_path / 'realm'
    RealmStore.initialize(root).close()
    daemon = RuntimeDaemon(root, support_root=tmp_path / 'support').start()
    try:
        client = WorkspaceClient(daemon.endpoint, daemon.token)
        empty = client.get_user_app_state('editor-tour')
        assert empty.version == 0 and empty.content is None
        saved = client.update_user_app_state('editor-tour', TOUR, 0, 'one')
        assert saved.version == 1 and saved.content == TOUR
        assert client.update_user_app_state('editor-tour', TOUR, 0, 'one') == saved
        assert client.get_user_app_state('editor-tour').content == TOUR
    finally:
        daemon.stop()

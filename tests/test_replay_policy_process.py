"""Real loopback Runtime admission journey in an isolated child process.

The worker transitions below are fixtures; every admission goes through the
public HTTP API and the real persisted Runtime store. No renderer is launched.
"""
from __future__ import annotations

import json
import subprocess
import sys
import textwrap
from pathlib import Path

CLIENT_PACKAGE = Path(__file__).parents[1] / "packages" / "python"

CHILD = textwrap.dedent(r"""
import hashlib
import json
import sys
from datetime import datetime, timedelta, timezone

sys.path.insert(0, sys.argv[2])
from astrid_runtime_client import ApiError, WorkspaceClient
from runtime_protocol.daemon import RuntimeDaemon
from runtime_protocol.store import RealmStore
from runtime_protocol.util import now

root = sys.argv[1]
RealmStore.initialize(root).close()
daemon = RuntimeDaemon(root).start()
try:
    store = daemon.service.store
    render_digest = 'sha256:' + 'a' * 64
    gen_digest = 'sha256:' + 'b' * 64
    for name, digest in [('rendering.render', render_digest), ('generation.fixture', gen_digest)]:
        daemon.service.register_capability({'capability_id': name, 'definition_digest': digest})
    epoch = store._current_runtime_epoch()
    def register(source_epoch):
        store.upsert_executor('fixture-worker', ['rendering.render', 'generation.fixture'],
            runtime_epoch=epoch, source_digest='sha256:' + 'c' * 64,
            dependency_digest='sha256:' + 'd' * 64, source_epoch=source_epoch)
    register('toolchain-v1')
    client = WorkspaceClient(daemon.endpoint, daemon.token)
    def admit(capability, digest, key, spec):
        return client.admit_task(capability_id=capability, capability_digest=digest,
            input_object_ids=[], idempotency_key=key, spec=spec)
    render_spec = {'params': {'timeline_revision': 'revision-7', 'output_name': 'film.mp4', 'quality': 18},
        'authority_context': {'render_toolchain_digest': 'sha256:' + 'e' * 64}}
    first = admit('rendering.render', render_digest, 'render-first', render_spec)
    joined = admit('rendering.render', render_digest, 'render-joined', render_spec)
    assert joined['task_id'] == first['task_id']
    assert joined['run_id'] == first['run_id']
    assert admit('rendering.render', render_digest, 'render-joined', render_spec)['task_id'] == first['task_id']
    assert admit('rendering.render', render_digest, 'different-output',
        {'params': {**render_spec['params'], 'output_name': 'other.mp4'}})['task_id'] != first['task_id']
    old = (datetime.now(timezone.utc) - timedelta(days=2)).isoformat()
    store.conn.execute("UPDATE command_idempotency SET created_at=? WHERE idempotency_key IN ('render-first','render-joined')", (old,))
    store._last_idempotency_prune = 0
    admit('rendering.render', render_digest, 'prune-trigger',
        {'params': {**render_spec['params'], 'output_name': 'prune.mp4'}})
    assert admit('rendering.render', render_digest, 'render-joined', render_spec)['task_id'] == first['task_id']

    # A fixture worker finishes one render and publishes a real CAS entry plus
    # a Runtime managed-output association. Admission itself is never faked.
    payload = b'fixture-mp4-bytes'
    digest = hashlib.sha256(payload).hexdigest()
    path = store.cas_root / digest[:2] / digest[2:]
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(payload)
    task_id = first['task_id']
    attempt_id = 'fixture-render-attempt'
    deadline = (datetime.now(timezone.utc) + timedelta(minutes=5)).isoformat()
    register('toolchain-v2')  # The claim, not the earlier admission, owns the rendered toolchain.
    store._claim_task(task_id, 'fixture-worker', 'fixture-lease', runtime_epoch=epoch)
    with store._transaction():
        store.conn.execute('INSERT INTO attempts(id,task_id,lease_id,fence,executor_id,lease_expires_at,runtime_epoch) VALUES (?,?,?,?,?,?,?)',
            (attempt_id, task_id, 'fixture-lease', 1, 'fixture-worker', deadline, epoch))
        store.conn.execute('INSERT INTO objects(digest,size,media_type,original_name,created_at) VALUES (?,?,?,?,?)',
            (digest, len(payload), 'video/mp4', 'film.mp4', now()))
    store._settle_attempt(task_id, 'fixture-lease', {'outputs': [{'kind': 'object', 'name': 'video',
        'output_port': 'video', 'digest': 'sha256:' + digest, 'size': len(payload),
        'filename': 'film.mp4', 'media_type': 'video/mp4'}]},
        attempt_id=attempt_id, fence=1)
    same = admit('rendering.render', render_digest, 'render-success-reuse', render_spec)
    assert same['task_id'] == task_id
    no_toolchain = admit('rendering.render', render_digest, 'render-no-toolchain',
        {'params': render_spec['params']})
    assert no_toolchain['task_id'] != task_id
    source_changed = admit('rendering.render', render_digest, 'render-source-changed',
        {**render_spec, 'authority_context': {'render_toolchain_digest': 'sha256:' + 'f' * 64}})
    assert source_changed['task_id'] != task_id
    register('toolchain-v3')
    changed = admit('rendering.render', render_digest, 'render-changed-toolchain', render_spec)
    assert changed['task_id'] != task_id
    store._claim_task(changed['task_id'], 'fixture-worker', 'changed-lease', runtime_epoch=epoch)
    store.fail_task(changed['task_id'], 'changed-lease', 'fixture renderer failed', fence=1)
    after_render_failure = admit('rendering.render', render_digest, 'render-after-failure', render_spec)
    assert after_render_failure['task_id'] != changed['task_id']
    store._claim_task(after_render_failure['task_id'], 'fixture-worker', 'retry-lease', runtime_epoch=epoch)
    store.fail_task(after_render_failure['task_id'], 'retry-lease', 'fixture renderer failed', fence=1)
    register('toolchain-v2')
    path.write_bytes(b'x' * len(payload))
    corrupt = admit('rendering.render', render_digest, 'render-corrupt-output', render_spec)
    assert corrupt['task_id'] != task_id
    store._claim_task(corrupt['task_id'], 'fixture-worker', 'corrupt-lease', runtime_epoch=epoch)
    store.fail_task(corrupt['task_id'], 'corrupt-lease', 'fixture renderer failed', fence=1)
    path.unlink()
    missing = admit('rendering.render', render_digest, 'render-missing-output', render_spec)
    assert missing['task_id'] != task_id

    generation_spec = {'prompt': 'same creative request'}
    failed = admit('generation.fixture', gen_digest, 'generation-explicit', generation_spec)
    store._claim_task(failed['task_id'], 'fixture-worker', 'failed-lease', runtime_epoch=epoch)
    store.fail_task(failed['task_id'], 'failed-lease', 'provider rejected request', fence=1)
    assert admit('generation.fixture', gen_digest, 'generation-explicit', generation_spec)['task_id'] == failed['task_id']
    fresh = admit('generation.fixture', gen_digest, 'generation-new', generation_spec)
    assert fresh['task_id'] != failed['task_id']
    store._claim_task(fresh['task_id'], 'fixture-worker', 'unknown-lease', runtime_epoch=epoch)
    with store._transaction():
        store.conn.execute("UPDATE tasks SET status='cancel_requested',waiting_reason='provider_state_unknown' WHERE id=?", (fresh['task_id'],))
        store.conn.execute("UPDATE runs SET status='cancel_requested' WHERE id=?", (fresh['run_id'],))
    try:
        admit('generation.fixture', gen_digest, 'generation-unknown-new', generation_spec)
        raise AssertionError('unknown provider outcome was re-executed')
    except ApiError as error:
        assert error.code == 'conflict'
        assert 'authorized checkpoint resume' in error.message
    assert store.conn.execute("SELECT COUNT(*) FROM tasks WHERE capability='generation.fixture'").fetchone()[0] == 2
    print(json.dumps({'inflight_task': task_id, 'reuse_task': same['task_id'],
        'new_toolchain_task': changed['task_id'], 'new_after_failure': fresh['task_id'],
        'unknown_guard': True}), flush=True)
finally:
    daemon.stop()
""")


def test_real_process_replay_policy(tmp_path, owned_process_groups):
    process = owned_process_groups.popen(
        [sys.executable, "-u", "-c", CHILD, str(tmp_path / "realm"), str(CLIENT_PACKAGE)],
        stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
        start_new_session=True,
    )
    try:
        stdout, stderr = process.communicate(timeout=45)
        assert process.returncode == 0, stderr
        result = json.loads(stdout.strip().splitlines()[-1])
        assert result["inflight_task"] == result["reuse_task"]
        assert result["unknown_guard"] is True
    finally:
        if process.poll() is None:
            owned_process_groups.terminate_all()
            process.communicate(timeout=10)

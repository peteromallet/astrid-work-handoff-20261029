from pathlib import Path
from contextlib import nullcontext
import pytest
from astrid.core.gateway import dev_operator as dev


def test_dev_promote_never_checks_out_before_owned_cleanup(tmp_path, monkeypatch):
    serve = tmp_path / 'served'; serve.mkdir()
    runtime = tmp_path / 'runtime'; runtime.mkdir()
    state = {'process_birth_id': 'retained', 'runtime_instance_id': 'instance'}
    monkeypatch.setattr(dev, 'served_profile', lambda _: {'source_checkout': str(serve)})
    monkeypatch.setattr(dev, '_require_linked_serve_worktree', lambda *_: None)
    monkeypatch.setattr(dev, '_read_json', lambda _: dict(state))
    monkeypatch.setattr(dev, 'in_flight_tasks', lambda _: [])
    calls = []
    def git(_root, *args):
        calls.append(args)
        if args[0] == 'status': return ''
        if 'HEAD' in args: return 'old'
        return 'new'
    monkeypatch.setattr(dev, '_git', git)
    def unresolved(_state):
        raise RuntimeError('custody absent')
    with pytest.raises(dev.DevOperatorError, match='remains unchanged'):
        dev.run_promote(data_root=tmp_path, client=tmp_path / 'source',
                        open_client=lambda **_: nullcontext(None), terminate_host=unresolved,
                        digest_fn=lambda _: 'digest', closure_fn=lambda _: 'closure')
    assert not any(args[0] == 'checkout' for args in calls)


def test_dev_promote_rejects_force_and_dirty_work_before_cleanup(tmp_path, monkeypatch):
    with pytest.raises(dev.DevOperatorError, match='force abandonment'):
        dev.run_promote(data_root=tmp_path, force=True)
    monkeypatch.setattr(dev, 'served_profile', lambda _: {'source_checkout': str(tmp_path / 'served')})
    monkeypatch.setattr(dev, '_require_linked_serve_worktree', lambda *_: None)
    monkeypatch.setattr(dev, '_git', lambda *_: '?? user-file')
    with pytest.raises(dev.DevOperatorError, match='dirty work'):
        dev.run_promote(data_root=tmp_path, client=tmp_path / 'source',
                        terminate_host=lambda _: pytest.fail('dirty tree must never be stopped'))


def test_dev_promote_preserves_edits_arriving_during_owned_stop(tmp_path, monkeypatch):
    serve = tmp_path / 'served'; serve.mkdir()
    (tmp_path / 'runtime').mkdir()
    state = {'process_birth_id': 'retained', 'runtime_instance_id': 'instance'}
    monkeypatch.setattr(dev, 'served_profile', lambda _: {'source_checkout': str(serve)})
    monkeypatch.setattr(dev, '_require_linked_serve_worktree', lambda *_: None)
    monkeypatch.setattr(dev, '_read_json', lambda _: dict(state))
    monkeypatch.setattr(dev, 'in_flight_tasks', lambda _: [])
    stopped = []
    calls = []
    def git(root, *args):
        calls.append(args)
        if args[0] == 'status': return '?? authored-after-stop' if stopped and root == serve else ''
        return 'old' if 'HEAD' in args else 'new'
    monkeypatch.setattr(dev, '_git', git)
    with pytest.raises(dev.DevOperatorError, match='changed during owned cleanup'):
        dev.run_promote(data_root=tmp_path, client=tmp_path / 'source', open_client=lambda **_: nullcontext(None),
                        terminate_host=lambda _: stopped.append(True), digest_fn=lambda _: 'd', closure_fn=lambda _: 'c')
    assert not any(args[0] == 'checkout' for args in calls)

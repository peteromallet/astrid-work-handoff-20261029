from types import SimpleNamespace

import pytest

from astrid.core.execution.generic_host import GenericPackHost
from astrid.sdk import invocation, _child_bridge


def test_fresh_and_resumed_reference_links_use_frozen_authority(monkeypatch):
    task = {"task_id": "task", "run_id": "run", "state": "succeeded", "result": {}}
    rows = [{"association_id": "output", "name": "audio"}]
    client = SimpleNamespace(tasks=SimpleNamespace(show=lambda _: SimpleNamespace(ok=True, data=task),
        list_managed_outputs=lambda _: SimpleNamespace(ok=True, data=rows)))
    context = {"reference_links": [{"reference_id": "ref", "port": "audio"}]}
    calls = []

    def link(client_, project, links, **kwargs):
        calls.append((project, links, kwargs))
        return [{"reference_id": "ref", "association_id": "output"}]

    monkeypatch.setattr("astrid.sdk.media_handles.link_outputs_to_references", link)
    metadata = dict(capability_id="fixture", capability_type="executor", native_kind="executor",
                    read_managed_outputs=False, authority_context=context, project="project")
    fresh = invocation._observe_task_invocation(client, task_id="task", run_id="run", wait=True,
        poll_seconds=0.001, initial_task=task, **metadata)
    receipt = SimpleNamespace(data={"metadata": metadata, "locator": {"task_id": "task", "run_id": "run"}},
                              recover_task=lambda: SimpleNamespace(ok=True, data=task))
    resumed = invocation._resume_receipt_invocation(receipt, client=client, wait=True,
                                                   timeout_seconds=1, poll_seconds=0.001)
    assert fresh.ok and resumed.ok
    assert fresh.raw_result == resumed.raw_result
    assert len(calls) == 2 and calls[0] == calls[1]
    assert calls[0][1] == context["reference_links"]
    assert fresh.raw_result["managed_outputs"] == rows


def test_parallel_slot_claim_is_visible_to_coordinator_handoff(tmp_path):
    client = SimpleNamespace(fork_for_host_slot=lambda: SimpleNamespace())
    host = GenericPackHost(pack_roots=[tmp_path], client=client, executor_id="host")
    slot = host._new_claim_slot()
    assert slot._handoff_enter_claim_rpc()
    status, counters = host.pause_claim_admission()
    assert status == "active_work" and counters["claim_rpc_in_flight"] == 1
    slot._handoff_leave_claim_rpc(123, claimed=True)
    status, counters = host.pause_claim_admission()
    assert status == "active_work" and counters["active_attempts"] == 1
    slot._handoff_leave_attempt(123)
    status, counters = host.pause_claim_admission()
    assert status == "paused" and counters["active_attempts"] == counters["claim_rpc_in_flight"] == 0
    assert slot._handoff_enter_claim_rpc() is False


@pytest.mark.parametrize("audio_request", [{"mode": "tts", "text": "a", "prompt": "b"},
                                    {"mode": "tts", "text": "  "},
                                    {"mode": "tts", "text": "hello", "instrumental": True}])
def test_audio_tts_rejects_ambiguous_or_music_inputs(audio_request):
    with pytest.raises(invocation.CapabilityValidationError):
        invocation._speech_inputs_from_audio_request(audio_request)


def test_child_output_metadata_accepts_runtime_cas_size_over_inline_budget():
    row = {"association_id": "output", "run_id": "run", "task_id": "task", "attempt_id": "attempt",
           "object_id": "sha256:" + "a" * 64, "digest": "sha256:" + "a" * 64,
           "size": 65 * 1024**2, "filename": "audio.wav", "media_type": "audio/wav",
           "output_port": "audio", "ordinal": 0}
    assert _child_bridge._validate_output_page([row], task_id="task", run_id="run", attempt_id="attempt") == [row]

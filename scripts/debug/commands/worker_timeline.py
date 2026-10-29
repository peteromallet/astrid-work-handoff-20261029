"""Worker timeline command — show a worker's full lifecycle as a chronological timeline."""

from debug.client import DebugClient


def run(client: DebugClient, worker_id: str, options: dict):
    """Handle 'debug.py worker_timeline <worker_id>' command."""
    try:
        # 1. Fetch the worker record
        worker_result = client.supabase.table('workers').select(
            'id, status, current_model, last_heartbeat, metadata, created_at'
        ).eq('id', worker_id).limit(1).execute()

        worker = (worker_result.data or [None])[0]
        if not worker:
            print(f"No worker found with id: {worker_id}")
            return

        # 2. Orchestrator logs mentioning this worker_id in message
        orch_result = client.supabase.table('system_logs').select(
            'id, timestamp, source_type, source_id, log_level, message, task_id, worker_id, metadata'
        ).eq(
            'source_type', 'orchestrator_gpu'
        ).ilike(
            'message', f'%{worker_id}%'
        ).order('timestamp').limit(500).execute()

        orch_logs = orch_result.data or []

        # 3. Worker's own logs (source_id matches worker_id prefix)
        worker_logs_result = client.supabase.table('system_logs').select(
            'id, timestamp, source_type, source_id, log_level, message, task_id, worker_id, metadata'
        ).ilike(
            'source_id', f'%{worker_id[:15]}%'
        ).order('timestamp').limit(500).execute()

        worker_logs = worker_logs_result.data or []

        # 4. Tasks this worker touched
        tasks_result = client.supabase.table('tasks').select(
            'id, task_type, status, worker_id, created_at, updated_at, params, result_data'
        ).eq('worker_id', worker_id).order('created_at').execute()

        tasks = tasks_result.data or []

        # 5. Merge into chronological timeline and print
        _print_timeline(worker, orch_logs, worker_logs, tasks)

    except Exception as e:
        print(f"Error fetching worker timeline: {e}")
        if options.get('debug'):
            import traceback
            traceback.print_exc()


def _print_timeline(worker, orch_logs, worker_logs, tasks):
    """Merge all data sources into a single chronological timeline and print."""
    from datetime import datetime, timezone

    worker_id = worker['id']
    status = worker.get('status', '?')
    model = worker.get('current_model') or 'none'
    metadata = worker.get('metadata') or {}
    pod_id = metadata.get('runpod_id', metadata.get('pod_id', ''))
    gpu = metadata.get('gpu_type', '')
    created_at = worker.get('created_at', '')

    # Header
    print("=" * 80)
    print(f"WORKER TIMELINE: {worker_id}")
    print("=" * 80)
    print()
    if created_at:
        print(f"  Worker created: {created_at[:19].replace('T', ' ')}")
    print(f"  Status: {status} | Model: {model}")
    if pod_id or gpu:
        print(f"  Pod: {pod_id} | GPU: {gpu}")
    print()

    # Build timeline events: list of (timestamp_str, emoji, label, detail)
    events = []

    # Events from orchestrator logs
    for log in orch_logs:
        ts = log.get('timestamp', '')
        msg = log.get('message', '')
        emoji, label, detail = _classify_orch_log(msg)
        if emoji:
            events.append((ts, emoji, label, detail))

    # Events from worker logs
    for log in worker_logs:
        ts = log.get('timestamp', '')
        msg = log.get('message', '')
        emoji, label, detail = _classify_worker_log(msg)
        if emoji:
            events.append((ts, emoji, label, detail))

    # Events from tasks
    for task in tasks:
        task_id = task.get('id', '?')[:8]
        task_type = task.get('task_type', '?')
        task_status = task.get('status', '?')
        created = task.get('created_at', '')
        updated = task.get('updated_at', '')

        # Task claimed event (approximated by created_at or updated_at when assigned)
        if created:
            events.append((created, "\U0001f4cb", "CLAIMED", f"task {task_id} ({task_type})"))

        # Task completion/failure event
        if updated and task_status in ('Complete', 'Completed', 'complete', 'completed'):
            events.append((updated, "\u2705", "COMPLETED", f"task {task_id}"))
        elif updated and task_status in ('Failed', 'failed', 'Error', 'error'):
            events.append((updated, "\u274c", "FAILED", f"task {task_id}"))

    # Sort by timestamp
    events.sort(key=lambda e: e[0])

    # Print timeline (collapse repeated events like INITIALIZING)
    print("  \u2500\u2500\u2500 Timeline \u2500\u2500\u2500")
    print()

    prev_label = None
    repeat_count = 0
    for ts, emoji, label, detail in events:
        if label == prev_label and label in ("INITIALIZING", "SSH available", "SPAWNED"):
            repeat_count += 1
            continue
        if repeat_count > 0:
            print(f"           ... repeated {repeat_count} more times")
            repeat_count = 0
        prev_label = label
        time_part = _format_time(ts)
        if detail:
            print(f"  [{time_part}] {emoji} {label} \u2014 {detail}")
        else:
            print(f"  [{time_part}] {emoji} {label}")
    if repeat_count > 0:
        print(f"           ... repeated {repeat_count} more times")

    if not events:
        print("  (no events found)")

    # Task summary
    print()
    print("  \u2500\u2500\u2500 Task Summary \u2500\u2500\u2500")
    print()

    if not tasks:
        print("  No tasks found for this worker.")
    else:
        total = len(tasks)
        completed = sum(1 for t in tasks if t.get('status', '').lower() in ('complete', 'completed'))
        failed = sum(1 for t in tasks if t.get('status', '').lower() in ('failed', 'error'))

        print(f"  Tasks claimed: {total} | Completed: {completed} | Failed: {failed}")

        # Calculate active time and idle before kill
        if events:
            try:
                first_ts = _parse_ts(events[0][0])
                last_ts = _parse_ts(events[-1][0])
                if first_ts and last_ts:
                    active_seconds = (last_ts - first_ts).total_seconds()
                    active_min = int(active_seconds // 60)
                    print(f"  Active time: {active_min}m")

                    # Idle before kill: time between last task completion and final event
                    last_task_end = None
                    for ts, emoji, label, detail in reversed(events):
                        if label in ("COMPLETED", "FAILED"):
                            last_task_end = _parse_ts(ts)
                            break

                    if last_task_end and last_ts > last_task_end:
                        idle_seconds = (last_ts - last_task_end).total_seconds()
                        idle_min = int(idle_seconds // 60)
                        print(f"  Idle before kill: {idle_min}m")
            except (ValueError, TypeError):
                pass

    print()


def _classify_orch_log(msg):
    """Classify an orchestrator log message into (emoji, label, detail) or (None, None, None).

    Only surface significant lifecycle transitions — skip repeated SSH checks,
    heartbeat noise, and routine cycle summaries.
    """
    msg_lower = msg.lower()

    # Significant lifecycle events
    if 'creating worker' in msg_lower:
        return ("\U0001f680", "SPAWNED", _truncate(msg, 60))
    if 'success:' in msg_lower and '->' in msg:
        return ("\U0001f680", "POD CREATED", _truncate(msg, 70))
    if 'startup script launched' in msg_lower:
        return ("\U0001f4e1", "STARTUP SCRIPT", "launched")
    if 'marking as error' in msg_lower:
        return ("\U0001f480", "KILLED", _truncate(msg, 80))
    if 'worker_lifecycle' in msg_lower and 'terminat' in msg_lower:
        return ("\U0001f480", "TERMINATED", _truncate(msg, 80))
    if 'promoted' in msg_lower or 'marking as active' in msg_lower:
        return ("\u2705", "PROMOTED", "to active")
    if 'worker_health' in msg_lower:
        return ("\u26a0\ufe0f", "HEALTH CHECK", _truncate(msg, 70))
    if 'diagnostics' in msg_lower:
        return ("\U0001f50d", "DIAGNOSTICS", _truncate(msg, 60))
    # First "initializing" is significant, but they repeat every 30s — handled by dedup in caller
    if 'initializing' in msg_lower and 'waiting for ready' in msg_lower:
        return ("\u23f3", "INITIALIZING", _truncate(msg, 60))

    # Everything else is noise (SSH checks, cycle summaries, etc.)
    return (None, None, None)


def _classify_worker_log(msg):
    """Classify a worker log message into (emoji, label, detail) or (None, None, None).

    Only surface significant lifecycle events — skip routine noise like
    heartbeats, queue polling, parameter logging, and debug output.
    """
    msg_lower = msg.lower()

    # Significant: task claimed
    if '[claim] claimed task' in msg_lower:
        return ("\U0001f4cb", "CLAIMED", _truncate(msg, 80))
    # Significant: task status updates to Complete/Failed
    if 'update_task_status' in msg_lower and 'status=complete' in msg_lower:
        return ("\u2705", "COMPLETED", _truncate(msg, 80))
    if 'update_task_status' in msg_lower and 'status=failed' in msg_lower:
        return ("\u274c", "FAILED", _truncate(msg, 80))
    # Significant: generation errors
    if '[task_error]' in msg_lower:
        return ("\u274c", "ERROR", _truncate(msg, 80))
    # Significant: model switching
    if 'switching to model' in msg_lower:
        return ("\U0001f504", "MODEL SWITCH", _truncate(msg, 60))
    # Significant: worker ready
    if 'headlesstaskqueue initialized' in msg_lower:
        return ("\u2705", "WORKER READY", "Task queue started")

    # Everything else is noise (heartbeats, queue polls, debug params, etc.)
    return (None, None, None)


def _extract_phase(msg):
    """Try to extract a phase name from a log message."""
    import re
    match = re.search(r'phase[:\s_]+(\w+)', msg, re.IGNORECASE)
    if match:
        return f"Phase: {match.group(1)}"
    return _truncate(msg, 50)


def _format_time(ts):
    """Extract HH:MM:SS from an ISO timestamp."""
    if not ts:
        return "??:??:??"
    # Handle both 'T' separator and space separator
    try:
        if 'T' in ts:
            return ts.split('T')[1][:8]
        elif ' ' in ts:
            return ts.split(' ')[1][:8]
    except (IndexError, AttributeError):
        pass
    return ts[:8]


def _parse_ts(ts_str):
    """Parse an ISO timestamp string into a datetime."""
    from datetime import datetime, timezone
    if not ts_str:
        return None
    try:
        cleaned = ts_str.replace('Z', '+00:00')
        return datetime.fromisoformat(cleaned)
    except (ValueError, TypeError):
        return None


def _truncate(s, max_len):
    """Truncate a string to max_len, adding ellipsis if needed."""
    if not s:
        return ""
    if len(s) <= max_len:
        return s
    return s[:max_len - 1] + "\u2026"


def _hours_ago(hours: int) -> str:
    from datetime import datetime, timezone, timedelta
    return (datetime.now(timezone.utc) - timedelta(hours=hours)).isoformat()

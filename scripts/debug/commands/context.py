"""Task/generation context — show the full relational graph around any entity.

Usage:
    debug.py context <task_id_or_generation_id>

Accepts either a task ID or a generation ID. Resolves the full context:
- Task details (type, status, key params)
- Generation (the one this task created/targeted, with variants)
- Generation tree (parent → children with timeline positions)
- Shot timeline (all images, which slots have segments, which are empty)
- Event log (system_logs for this task)
- Flags issues: position mismatches, orphaned children, missing links
"""

import json as _json
from debug.client import DebugClient


def _short(uuid: str | None, n: int = 8) -> str:
    return (uuid or "—")[:n]


def _get_nested(d: dict, *keys, default=None):
    for key in keys:
        if not isinstance(d, dict):
            return default
        d = d.get(key, default)
    return d


def _format_time(ts: str) -> str:
    if not ts:
        return "??:??:??"
    try:
        time_part = ts.split("T")[1] if "T" in ts else ts.split(" ")[1]
        return time_part[:8]
    except (IndexError, ValueError):
        return ts[:8]


_LOG_ICONS = {
    "ERROR": "\u274c",
    "WARNING": "\u26a0\ufe0f",
    "INFO": "\u2139\ufe0f",
    "DEBUG": "\U0001f50d",
}


def run(client: DebugClient, entity_id: str, options: dict):
    """Handle 'debug.py context <id>' command."""
    try:
        _run_inner(client, entity_id, options)
    except Exception as e:
        print(f"Error: {e}")
        if options.get("debug"):
            import traceback
            traceback.print_exc()


def _resolve_from_task(client: DebugClient, task_id: str):
    """Try to interpret the ID as a task and extract context."""
    result = (
        client.supabase.table("tasks")
        .select("id, task_type, status, params, created_at, generation_started_at, generation_processed_at, worker_id, error_message, output_location")
        .eq("id", task_id)
        .limit(1)
        .execute()
    )
    task = (result.data or [None])[0]
    if not task:
        return None

    params = task.get("params") or {}
    parent_gen_id = (
        params.get("parent_generation_id")
        or _get_nested(params, "orchestration_contract", "parent_generation_id")
        or _get_nested(params, "orchestrator_details", "parent_generation_id")
    )
    child_gen_id = (
        params.get("child_generation_id")
        or _get_nested(params, "orchestration_contract", "child_generation_id")
    )
    shot_id = (
        params.get("shot_id")
        or _get_nested(params, "orchestration_contract", "shot_id")
    )
    task_pair_shot_gen_id = (
        params.get("pair_shot_generation_id")
        or _get_nested(params, "individual_segment_params", "pair_shot_generation_id")
    )
    based_on = (
        params.get("based_on")
        or _get_nested(params, "orchestration_contract", "based_on")
    )

    return {
        "task": task,
        "parent_gen_id": parent_gen_id,
        "child_gen_id": child_gen_id,
        "shot_id": shot_id,
        "task_pair_shot_gen_id": task_pair_shot_gen_id,
        "based_on": based_on,
        "segment_index": params.get("segment_index"),
        "child_order_contract": _get_nested(params, "orchestration_contract", "child_order"),
    }


def _resolve_from_generation(client: DebugClient, gen_id: str):
    """Try to interpret the ID as a generation and extract context."""
    result = (
        client.supabase.table("generations")
        .select("id, parent_generation_id, is_child, child_order, pair_shot_generation_id, params, project_id, tasks, location, type")
        .eq("id", gen_id)
        .limit(1)
        .execute()
    )
    gen = (result.data or [None])[0]
    if not gen:
        return None

    parent_gen_id = gen.get("parent_generation_id") if gen.get("is_child") else gen_id

    params = gen.get("params") or {}
    shot_id = params.get("shot_id") or _get_nested(params, "orchestrator_details", "shot_id")

    if not shot_id:
        sg_result = (
            client.supabase.table("shot_generations")
            .select("shot_id")
            .eq("generation_id", gen_id)
            .limit(1)
            .execute()
        )
        if sg_result.data:
            shot_id = sg_result.data[0].get("shot_id")

    if not shot_id and parent_gen_id and parent_gen_id != gen_id:
        sg_result = (
            client.supabase.table("shot_generations")
            .select("shot_id")
            .eq("generation_id", parent_gen_id)
            .limit(1)
            .execute()
        )
        if sg_result.data:
            shot_id = sg_result.data[0].get("shot_id")

    return {
        "generation": gen,
        "parent_gen_id": parent_gen_id,
        "child_gen_id": gen_id if gen.get("is_child") else None,
        "shot_id": shot_id,
    }


def _fetch_logs(client: DebugClient, task_id: str, limit: int = 200) -> list[dict]:
    """Fetch system_logs for a task (by task_id field)."""
    try:
        result = (
            client.supabase.table("system_logs")
            .select("timestamp, source_type, source_id, log_level, message")
            .eq("task_id", task_id)
            .order("timestamp")
            .limit(limit)
            .execute()
        )
        return result.data or []
    except Exception:
        return []


def _fetch_worker_logs_around(
    client: DebugClient, worker_id: str, timestamp: str, window_seconds: int = 30, limit: int = 30,
) -> list[dict]:
    """Fetch worker/orchestrator logs in a time window around a timestamp.

    Useful when the worker-side logs don't carry the task_id (e.g. failed
    claims where the orchestrator never learned the task ID).
    """
    from datetime import datetime, timedelta, timezone

    try:
        ts = datetime.fromisoformat(timestamp.replace("Z", "+00:00"))
    except (ValueError, TypeError):
        return []

    start = (ts - timedelta(seconds=window_seconds)).isoformat()
    end = (ts + timedelta(seconds=window_seconds)).isoformat()

    try:
        result = (
            client.supabase.table("system_logs")
            .select("timestamp, source_type, source_id, log_level, message")
            .eq("source_id", worker_id)
            .gte("timestamp", start)
            .lte("timestamp", end)
            .order("timestamp")
            .limit(limit)
            .execute()
        )
        return result.data or []
    except Exception:
        return []


def _fetch_generation_for_task(client: DebugClient, task_id: str) -> dict | None:
    """Find the generation that references this task in its tasks array."""
    try:
        result = (
            client.supabase.table("generations")
            .select("id, location, type, parent_generation_id, is_child, child_order, pair_shot_generation_id, params, based_on, primary_variant_id")
            .contains("tasks", _json.dumps([task_id]))
            .limit(1)
            .execute()
        )
        return (result.data or [None])[0]
    except Exception:
        return None


def _fetch_variants(client: DebugClient, generation_id: str) -> list[dict]:
    """Fetch variants for a generation."""
    try:
        result = (
            client.supabase.table("generation_variants")
            .select("id, is_primary, variant_type, location, created_at, params")
            .eq("generation_id", generation_id)
            .order("created_at")
            .execute()
        )
        return result.data or []
    except Exception:
        return []


def _run_inner(client: DebugClient, entity_id: str, options: dict):
    fmt = options.get("format", "text")

    # Try as task first, then as generation
    task_ctx = _resolve_from_task(client, entity_id)
    gen_ctx = None
    if not task_ctx:
        gen_ctx = _resolve_from_generation(client, entity_id)
        if not gen_ctx:
            print(f"ID {entity_id} not found as a task or generation.")
            return

    # Unify context
    task = task_ctx["task"] if task_ctx else None
    task_id = task["id"] if task else None
    parent_gen_id = (task_ctx or gen_ctx).get("parent_gen_id")
    child_gen_id = (task_ctx or gen_ctx).get("child_gen_id")
    shot_id = (task_ctx or gen_ctx).get("shot_id")
    task_pair_shot_gen_id = task_ctx.get("task_pair_shot_gen_id") if task_ctx else None
    based_on = task_ctx.get("based_on") if task_ctx else None

    # ── Fetch the generation this task created ──
    task_generation = None
    task_gen_variants = []
    if task_id:
        task_generation = _fetch_generation_for_task(client, task_id)
        if task_generation:
            task_gen_variants = _fetch_variants(client, task_generation["id"])

    # ── Fetch the child generation (from task params) ──
    child_gen = None
    if child_gen_id:
        result = (
            client.supabase.table("generations")
            .select("id, child_order, pair_shot_generation_id, parent_generation_id, location, type, params, tasks")
            .eq("id", child_gen_id)
            .limit(1)
            .execute()
        )
        child_gen = (result.data or [None])[0]

    # ── Fetch parent generation ──
    parent_gen = None
    if parent_gen_id:
        result = (
            client.supabase.table("generations")
            .select("id, location, type, params, project_id, primary_variant_id")
            .eq("id", parent_gen_id)
            .limit(1)
            .execute()
        )
        parent_gen = (result.data or [None])[0]

    # ── Fetch based_on generation ──
    based_on_gen = None
    if based_on:
        result = (
            client.supabase.table("generations")
            .select("id, location, type, parent_generation_id, is_child")
            .eq("id", based_on)
            .limit(1)
            .execute()
        )
        based_on_gen = (result.data or [None])[0]

    # ── Fetch all children (siblings) ──
    siblings = []
    if parent_gen_id:
        result = (
            client.supabase.table("generations")
            .select("id, child_order, pair_shot_generation_id, location, type")
            .eq("parent_generation_id", parent_gen_id)
            .eq("is_child", True)
            .order("child_order")
            .execute()
        )
        siblings = result.data or []

    # ── Fetch the shot timeline ──
    timeline = []
    if shot_id:
        result = (
            client.supabase.table("shot_generations")
            .select("id, generation_id, timeline_frame")
            .eq("shot_id", shot_id)
            .gte("timeline_frame", 0)
            .order("timeline_frame", desc=False)
            .execute()
        )
        timeline = result.data or []

    # ── Fetch shot_generation linkage for the parent generation ──
    parent_shot_gen = None
    if parent_gen_id and shot_id:
        result = (
            client.supabase.table("shot_generations")
            .select("id, generation_id, timeline_frame")
            .eq("shot_id", shot_id)
            .eq("generation_id", parent_gen_id)
            .limit(1)
            .execute()
        )
        parent_shot_gen = (result.data or [None])[0]

    # ── Fetch logs ──
    logs = []
    worker_context_logs = []
    if task_id:
        logs = _fetch_logs(client, task_id)

        # If task is stuck (In Progress with few logs), fetch worker-side logs
        # around the claim time — these may not carry task_id
        worker_id = task.get("worker_id") if task else None
        started_at = task.get("generation_started_at") if task else None
        if worker_id and started_at and len(logs) <= 3:
            worker_context_logs = _fetch_worker_logs_around(
                client, worker_id, started_at, window_seconds=30,
            )
            # Also try the source_type-based worker ID pattern (orchestrator_api logs
            # use source_type, not source_id matching worker_id)
            if not worker_context_logs:
                for source_type in ("orchestrator_api", "orchestrator_gpu"):
                    try:
                        from datetime import datetime, timedelta
                        ts = datetime.fromisoformat(started_at.replace("Z", "+00:00"))
                        start = (ts - timedelta(seconds=30)).isoformat()
                        end = (ts + timedelta(seconds=30)).isoformat()
                        result = (
                            client.supabase.table("system_logs")
                            .select("timestamp, source_type, source_id, log_level, message")
                            .eq("source_type", source_type)
                            .gte("timestamp", start)
                            .lte("timestamp", end)
                            .order("timestamp")
                            .limit(30)
                            .execute()
                        )
                        if result.data:
                            worker_context_logs = result.data
                            break
                    except Exception:
                        pass

    # ── Build position map ──
    position_map: dict[str, int] = {}
    for idx, item in enumerate(timeline):
        position_map[item["id"]] = idx

    slot_count = max(0, len(timeline) - 1)

    # ── Resolve positions ──
    task_pair_position = position_map.get(task_pair_shot_gen_id) if task_pair_shot_gen_id else None
    child_pair_shot_gen_id = child_gen.get("pair_shot_generation_id") if child_gen else None
    child_pair_position = position_map.get(child_pair_shot_gen_id) if child_pair_shot_gen_id else None

    # ── Detect issues ──
    issues = []

    # Task stalled: In Progress but no recent activity
    if task and task.get("status") == "In Progress" and task.get("generation_started_at"):
        from datetime import datetime, timezone
        try:
            started = datetime.fromisoformat(task["generation_started_at"].replace("Z", "+00:00"))
            elapsed = (datetime.now(timezone.utc) - started).total_seconds()
            last_log_ts = logs[-1].get("timestamp") if logs else None
            since_last_log = None
            if last_log_ts:
                last_log = datetime.fromisoformat(last_log_ts.replace("Z", "+00:00"))
                since_last_log = (datetime.now(timezone.utc) - last_log).total_seconds()

            if elapsed > 600:  # 10 min
                stall_msg = f"Task stalled: In Progress for {elapsed/60:.0f}m"
                if since_last_log and since_last_log > 300:
                    stall_msg += f", last log {since_last_log/60:.0f}m ago"
                elif not logs:
                    stall_msg += ", no processing logs at all"
                if len(logs) <= 1:
                    stall_msg += " — likely a phantom claim (claim succeeded server-side but response lost)"
                issues.append(stall_msg)
        except (ValueError, TypeError):
            pass

    # Task failed
    if task and task.get("status") == "Failed":
        err = task.get("error_message") or "(no error message)"
        issues.append(f"Task failed: {err[:120]}")

    # Mismatch: task targets one slot, child lives at another
    if (
        task_pair_position is not None
        and child_pair_position is not None
        and task_pair_position != child_pair_position
    ):
        delta = child_pair_position - task_pair_position
        direction = "later" if delta > 0 else "earlier"
        issues.append(
            f"Position mismatch: task targets slot {task_pair_position}, "
            f"child displays at slot {child_pair_position} "
            f"(off by {abs(delta)}, {direction})"
        )

    # Pair ID mismatch: task and child disagree on pair_shot_generation_id
    if (
        task_pair_shot_gen_id
        and child_pair_shot_gen_id
        and task_pair_shot_gen_id != child_pair_shot_gen_id
    ):
        issues.append(
            f"pair_shot_generation_id mismatch: "
            f"task={_short(task_pair_shot_gen_id)}, "
            f"child={_short(child_pair_shot_gen_id)}"
        )

    # Task complete but no generation created
    if task and task.get("status") == "Complete" and not task_generation:
        issues.append("Task is Complete but no generation found referencing it")

    # based_on target missing
    if based_on and not based_on_gen:
        issues.append(f"based_on generation {_short(based_on)} not found")

    # Orphaned children: pair_shot_generation_id not in timeline
    for s in siblings:
        s_pair = s.get("pair_shot_generation_id")
        if s_pair and s_pair not in position_map:
            issues.append(
                f"Orphaned child {_short(s['id'])} (order={s.get('child_order')}): "
                f"pair_shot_gen {_short(s_pair)} not in current timeline"
            )

    # Empty slots (only flag if there are siblings — otherwise this parent isn't a segment parent)
    if siblings:
        sibling_pair_ids = {s.get("pair_shot_generation_id") for s in siblings if s.get("pair_shot_generation_id")}
        empty_slots = []
        for idx in range(slot_count):
            sg_id = timeline[idx]["id"]
            if sg_id not in sibling_pair_ids:
                empty_slots.append(idx)
        if empty_slots:
            issues.append(f"Empty slots (no child generation): {empty_slots}")

    # Parent not linked to shot
    if parent_gen_id and shot_id and not parent_shot_gen:
        issues.append(f"Parent generation {_short(parent_gen_id)} not linked to shot {_short(shot_id)}")

    # ── JSON output ──
    if fmt == "json":
        print(_json.dumps({
            "entity_id": entity_id,
            "resolved_from": "task" if task_ctx else "generation",
            "task": task,
            "task_generation": task_generation,
            "task_generation_variants": task_gen_variants,
            "based_on_generation": based_on_gen,
            "parent_generation": parent_gen,
            "child_generation": child_gen,
            "siblings": siblings,
            "timeline": timeline,
            "position_map": position_map,
            "issues": issues,
            "logs": logs,
            "shot_id": shot_id,
            "parent_shot_generation": parent_shot_gen,
        }, indent=2, default=str))
        return

    # ── Text output ──
    print("=" * 80)
    title = "CONTEXT"
    if task:
        title += f": {task.get('task_type', '?')} {_short(entity_id, 12)}"
    else:
        title += f": generation {_short(entity_id, 12)}"
    print(title)
    print("=" * 80)
    print()

    # ── Issues (up top so they're the first thing you see) ──
    if issues:
        print("  ─── ⚠️  Issues ───")
        for issue in issues:
            print(f"  • {issue}")
        print()

    # ── Task section ──
    if task:
        print("  ─── Task ───")
        print(f"  ID:              {entity_id}")
        print(f"  Type:            {task.get('task_type')}")
        print(f"  Status:          {task.get('status')}")
        if task.get("worker_id"):
            print(f"  Worker:          {task['worker_id'][:40]}")
        if task.get("error_message"):
            print(f"  Error:           {task['error_message'][:120]}")

        # Timing
        created = task.get("created_at")
        started = task.get("generation_started_at")
        processed = task.get("generation_processed_at")
        if created:
            print(f"  Created:         {_format_time(created)}")
        if started:
            print(f"  Started:         {_format_time(started)}")
        if processed:
            print(f"  Completed:       {_format_time(processed)}")

        # Key routing params
        if task_ctx:
            seg_idx = task_ctx.get("segment_index")
            if seg_idx is not None:
                print(f"  segment_index:   {seg_idx}")
            if task_pair_shot_gen_id:
                pos_str = f"slot {task_pair_position}" if task_pair_position is not None else "(not in timeline)"
                print(f"  pair_shot_gen:   {_short(task_pair_shot_gen_id)} → {pos_str}")
            if child_gen_id:
                print(f"  child_gen_id:    {_short(child_gen_id)}")
            if based_on:
                print(f"  based_on:        {_short(based_on)}")
        if task.get("output_location"):
            print(f"  Output:          {task['output_location'][:80]}")
        print()

    # ── Generation this task created ──
    if task_generation:
        tg = task_generation
        print("  ─── Generation ───")
        print(f"  ID:              {_short(tg['id'])}")
        print(f"  Type:            {tg.get('type')}")
        print(f"  Has output:      {bool(tg.get('location'))}")
        if tg.get("is_child"):
            print(f"  Is child:        True (order={tg.get('child_order')})")
            tg_pair = tg.get("pair_shot_generation_id")
            if tg_pair:
                tg_pos = position_map.get(tg_pair)
                pos_str = f"slot {tg_pos}" if tg_pos is not None else "(not in timeline)"
                print(f"  pair_shot_gen:   {_short(tg_pair)} → {pos_str}")
        if tg.get("parent_generation_id"):
            print(f"  Parent:          {_short(tg['parent_generation_id'])}")
        if tg.get("based_on"):
            print(f"  Based on:        {_short(tg['based_on'])}")
        if task_gen_variants:
            primary = [v for v in task_gen_variants if v.get("is_primary")]
            print(f"  Variants:        {len(task_gen_variants)} total, {len(primary)} primary")
            for v in task_gen_variants[-3:]:  # Show last 3
                vtype = v.get("variant_type") or "?"
                vprimary = " [PRIMARY]" if v.get("is_primary") else ""
                created_from = _get_nested(v, "params", "created_from") or ""
                if created_from:
                    created_from = f" ({created_from})"
                print(f"    {_short(v['id'])}  {vtype}{vprimary}{created_from}  {_format_time(v.get('created_at', ''))}")
        print()

    # ── Based-on generation ──
    if based_on_gen:
        print("  ─── Based On ───")
        print(f"  ID:              {_short(based_on_gen['id'])}")
        print(f"  Type:            {based_on_gen.get('type')}")
        print(f"  Has output:      {bool(based_on_gen.get('location'))}")
        print()

    # ── Child generation targeted by task (if different from task_generation) ──
    if child_gen and (not task_generation or child_gen["id"] != task_generation["id"]):
        print("  ─── Target Child ───")
        print(f"  ID:              {_short(child_gen['id'])}")
        print(f"  child_order:     {child_gen.get('child_order')}")
        if child_pair_shot_gen_id:
            pos_str = f"slot {child_pair_position}" if child_pair_position is not None else "(not in timeline)"
            print(f"  pair_shot_gen:   {_short(child_pair_shot_gen_id)} → {pos_str}")
        print(f"  Has output:      {bool(child_gen.get('location'))}")
        print()

    # ── Parent generation ──
    if parent_gen:
        print("  ─── Parent Generation ───")
        print(f"  ID:              {_short(parent_gen_id)}")
        print(f"  Has output:      {bool(parent_gen.get('location'))}")
        if parent_shot_gen:
            print(f"  Shot link:       shot_gen {_short(parent_shot_gen['id'])}, frame={parent_shot_gen.get('timeline_frame')}")
        elif shot_id:
            print(f"  Shot link:       ⚠️ NOT linked to shot {_short(shot_id)}")
        if siblings:
            print(f"  Children:        {len(siblings)}")
        print()

    # ── Timeline ──
    if timeline:
        print(f"  ─── Shot Timeline ({len(timeline)} images, {slot_count} slots) ───")
        if shot_id:
            print(f"  Shot: {shot_id}")
        print()

        for idx, item in enumerate(timeline):
            sg_id = item["id"]
            frame = item.get("timeline_frame", "?")

            markers = []
            if sg_id == task_pair_shot_gen_id:
                markers.append("◀ task targets")
            if sg_id == child_pair_shot_gen_id and child_pair_shot_gen_id != task_pair_shot_gen_id:
                markers.append("◀ child maps here")
            marker_str = "  " + " ".join(markers) if markers else ""

            children_here = [s for s in siblings if s.get("pair_shot_generation_id") == sg_id]
            child_info = ""
            if children_here:
                labels = [f"child {s.get('child_order')} ({_short(s['id'])})" for s in children_here]
                child_info = f"  [{', '.join(labels)}]"

            print(f"  [{idx}] {_short(sg_id)}  frame={frame:<4}{child_info}{marker_str}")

            if idx < len(timeline) - 1:
                if children_here:
                    for sc in children_here:
                        loc = "✓" if sc.get("location") else "○"
                        print(f"       ├─ slot {idx}: child {sc.get('child_order')} ({_short(sc['id'])}) {loc}")
                else:
                    print(f"       ├─ slot {idx}: (empty)")

        print()

    # ── Siblings ──
    if siblings:
        print(f"  ─── Children ({len(siblings)} of parent {_short(parent_gen_id)}) ───")
        for s in siblings:
            s_pair = s.get("pair_shot_generation_id")
            s_pos = position_map.get(s_pair) if s_pair else None
            s_pos_str = f"slot {s_pos}" if s_pos is not None else "—"
            in_timeline = s_pair in position_map if s_pair else False
            flags = []
            if s_pair and not in_timeline:
                flags.append("⚠️ ORPHANED")
            if child_gen and s["id"] == child_gen["id"]:
                flags.append("← target")
            loc = "✓" if s.get("location") else "○"
            flag_str = f"  {' '.join(flags)}" if flags else ""
            print(f"  order={s.get('child_order')}  {s_pos_str:<8}  {_short(s['id'])}  pair={_short(s_pair)}  {loc}{flag_str}")
        print()

    # ── Logs ──
    if logs:
        # Compact log view: skip DEBUG unless few logs, cap at 30 lines
        show_debug = len(logs) <= 30
        displayed = []
        for log in logs:
            level = log.get("log_level", "INFO")
            if not show_debug and level == "DEBUG":
                continue
            displayed.append(log)

        total = len(logs)
        shown = min(len(displayed), 50)
        skipped_debug = total - len(displayed)

        print(f"  ─── Logs ({total} entries) ───")
        if skipped_debug > 0:
            print(f"  ({skipped_debug} DEBUG entries hidden)")
        print()

        for log in displayed[:50]:
            ts = _format_time(log.get("timestamp", ""))
            level = log.get("log_level", "?")
            icon = _LOG_ICONS.get(level, " ")
            source = (log.get("source_id") or log.get("source_type") or "")[:20]
            msg = (log.get("message") or "")[:100]
            print(f"  [{ts}] {icon} [{source:<20s}] {msg}")

        if shown < len(displayed):
            print(f"  ... and {len(displayed) - shown} more")
        print()
    elif task_id:
        print("  ─── Logs ───")
        print("  (no task logs found)")
        print()

    # ── Worker context logs (when task has few logs — shows what the worker was doing) ──
    if worker_context_logs:
        print(f"  ─── Worker Logs Around Claim ({len(worker_context_logs)} entries) ───")
        print()
        for log in worker_context_logs:
            ts = _format_time(log.get("timestamp", ""))
            level = log.get("log_level", "?")
            icon = _LOG_ICONS.get(level, " ")
            source = (log.get("source_id") or log.get("source_type") or "")[:20]
            msg = (log.get("message") or "")[:120]
            print(f"  [{ts}] {icon} [{source:<20s}] {msg}")
        print()

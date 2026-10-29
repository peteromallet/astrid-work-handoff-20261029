"""Product runs family CLI.

This module is the product parser for the plural ``runs`` family: every verb
is **argument parsing plus exactly one SDK call** on the composed
:class:`~astrid.sdk.client.AstridClient` (stamped onto every subparser by
:func:`astrid.core.cli.registration.register_product_commands`), and every
handler renders through the shared product output layer
(:mod:`astrid.core.cli.domain_output`) so the exact five-key JSON envelope,
concise human output, and stable exit codes stay aligned with the frozen SDK
contract.

Verbs (exactly these six, one SDK call each):

- ``list`` — ``client.runs.list`` across every page (project-scoped read, no key);
- ``show <run_id>`` — one ``client.runs.show`` call returning the run read
  model plus the **derived child progress** (total/succeeded/failed/
  cancelled counts and the ordered children); ``--evidence`` appends the
  run's ordered evidence items (read, no key);
- ``cancel <run_id>`` — one ``client.runs.cancel`` call driving every
  eligible child to the terminal ``cancelled`` state through the shared
  task-cancel predicate, with the same idempotency-key contract as other
  mutations;
- ``retry <run_id>`` — one ``client.runs.retry`` call;
  repeatable ``--task <id>`` restricts the retry to an explicit ordinal
  subset, and when omitted every eligible failed/expired child is retried;
- ``events <run_id>`` — one ``client.runs.events`` call returning the run's
  ordered run-level ``core.run`` lifecycle events (read, no key). Child task
  transitions are separate; use ``tasks events <task_id>`` for those details.
- ``open [run_id]`` — one ``client.runs.open`` call verifying, materializing,
  and opening either an exact successful render run or, by default, the latest
  successful render in the runtime-selected current project.

The singular ``run`` alias is **not** a product family (frozen census,
plan step 24) and is not registered here: the parser exposes exactly the
plural family above, so no product parsing path can reach a singular alias.
This module contains **no SQL**, **no repository logic**, and **no domain
rules**: it parses argv, makes one SDK call, and renders the returned
envelope.
"""

from __future__ import annotations

import argparse
import sys
from typing import Any

from astrid.core.cli.domain_output import print_result
from astrid.core.cli.list_narrow import primary_output_name, resolve_cli_id
from astrid.core.cli.registration import CommandSpec, register_product_commands

__all__ = ["COMMANDS", "build_parser"]

_FAMILY = "runs"


def _add_json_flag(subparser: argparse.ArgumentParser, *, default: bool = False, help_text: str | None = None) -> None:
    subparser.add_argument(
        "--json",
        action="store_true",
        default=default,
        help=help_text or "Print the exact SDK envelope (ok/data/error/receipt/idempotency_key).",
    )


def _add_idempotency_key(subparser: argparse.ArgumentParser) -> None:
    subparser.add_argument(
        "--idempotency-key",
        dest="idempotency_key",
        default=None,
        help="Caller idempotency key (a fresh key is generated when absent).",
    )


def _add_project_arg(subparser: argparse.ArgumentParser) -> None:
    subparser.add_argument(
        "--project",
        required=True,
        default=None,
        help="Owning project id or immutable slug.",
    )


# -- handlers (one SDK call each, no domain rules) -------------------------


def _run_output(client: Any, row: Any) -> str | None:
    """A completed run's output name: its render task's primary output (one read per shown run)."""
    task_ids = row.get("task_ids") if isinstance(row, dict) else None
    if not task_ids:
        return None
    task = client.tasks.show(str(task_ids[-1]))
    if not getattr(task, "ok", False) or not isinstance(task.data, dict):
        return None
    return primary_output_name(task.data)


def _cmd_list(parsed: argparse.Namespace) -> int:
    from astrid.core.cli.list_narrow import all_pages, list_rows, narrow, render_list_table

    # The Runtime pages oldest first, so the newest rows are on the last page: read them all
    # (the first page alone showed a project's oldest work as its "newest").
    result = all_pages(parsed.client.runs.list, parsed.project)
    narrowed, total = narrow(result, capability=parsed.capability, limit=parsed.limit, as_json=parsed.json)
    if parsed.json:
        return print_result(narrowed, as_json=True)
    return print_result(
        narrowed,
        as_json=False,
        human_renderer=lambda shown: render_list_table(
            list_rows(shown),
            total=total,
            output_of=lambda row: _run_output(parsed.client, row),
            noun="runs",
        ),
    )


def _run_id(parsed: argparse.Namespace) -> tuple[str | None, int | None]:
    """The full run id for a per-id verb (a unique hex prefix is resolved against the project's list)."""
    return resolve_cli_id(parsed.client.runs.list, parsed.project, parsed.run_id, noun="run", as_json=parsed.json)


def _cmd_show(parsed: argparse.Namespace) -> int:
    run_id, code = _run_id(parsed)
    if run_id is None:
        return code
    result = parsed.client.runs.show(run_id)
    return print_result(result, as_json=parsed.json)


def _cmd_cancel(parsed: argparse.Namespace) -> int:
    run_id, code = _run_id(parsed)
    if run_id is None:
        return code
    result = parsed.client.runs.cancel(
        run_id,
        idempotency_key=parsed.idempotency_key,
    )
    return print_result(result, as_json=parsed.json)


def _cmd_retry(parsed: argparse.Namespace) -> int:
    run_id, code = _run_id(parsed)
    if run_id is None:
        return code
    result = parsed.client.runs.retry(
        run_id,
        selected_task_ids=parsed.task,
        idempotency_key=parsed.idempotency_key,
    )
    return print_result(result, as_json=parsed.json)


def _cmd_events(parsed: argparse.Namespace) -> int:
    run_id, code = _run_id(parsed)
    if run_id is None:
        return code
    result = parsed.client.runs.events(run_id)
    return print_result(result, as_json=parsed.json)


def _cmd_open(parsed: argparse.Namespace) -> int:
    kwargs = {"project": parsed.project}
    if parsed.timeline is not None:
        kwargs["timeline"] = parsed.timeline
    if parsed.default_timeline:
        kwargs["default_timeline"] = True
    if parsed.no_open:
        kwargs["no_open"] = True
    result = parsed.client.runs.open(parsed.run_id, **kwargs)
    code = print_result(result, as_json=parsed.json)
    data = result.data if result.ok and isinstance(result.data, dict) else None
    if data is not None and not data.get("opened"):
        # A run that was not opened must say why and where the file is.
        print(f"not opened: {data.get('open_error')}", file=sys.stderr)
        print(f"file: {data.get('local_path')}", file=sys.stderr)
    return code


# -- parser ----------------------------------------------------------------


def _configure_list(subparser: argparse.ArgumentParser) -> None:
    _add_project_arg(subparser)
    subparser.add_argument("--capability", default=None, metavar="ID",
                           help="Only runs of this capability (e.g. rendering.render; a prefix like pixel. works too).")
    subparser.add_argument("--limit", type=int, default=None,
                           help="The newest N (default 50 for the human view, everything with --json; 0 = everything).")
    _add_json_flag(
        subparser,
        default=False,
        help_text="Print the exact SDK envelope with every row and full spec. Default: a short table.",
    )
    subparser.set_defaults(handler=_cmd_list)


def _configure_show(subparser: argparse.ArgumentParser) -> None:
    _add_project_arg(subparser)
    subparser.add_argument("run_id", help="Run id, or a unique hex prefix of at least 8 characters.")
    subparser.add_argument(
        "--evidence",
        action="store_true",
        help="Append the run's ordered evidence items to the read model.",
    )
    _add_json_flag(subparser)
    subparser.set_defaults(handler=_cmd_show)


def _configure_cancel(subparser: argparse.ArgumentParser) -> None:
    _add_project_arg(subparser)
    subparser.add_argument("run_id", help="Run id, or a unique hex prefix of at least 8 characters.")
    _add_idempotency_key(subparser)
    _add_json_flag(subparser)
    subparser.set_defaults(handler=_cmd_cancel)


def _configure_retry(subparser: argparse.ArgumentParser) -> None:
    _add_project_arg(subparser)
    subparser.add_argument("run_id", help="Run id, or a unique hex prefix of at least 8 characters.")
    subparser.add_argument(
        "--task",
        dest="task",
        action="append",
        default=None,
        help="Retry only this task id (repeatable; omit to retry every "
        "eligible failed/expired child).",
    )
    _add_idempotency_key(subparser)
    _add_json_flag(subparser)
    subparser.set_defaults(handler=_cmd_retry)


def _configure_events(subparser: argparse.ArgumentParser) -> None:
    subparser.description = (
        "Show run-level core.run lifecycle events. Child task transitions "
        "are separate; use `tasks events <task_id>` for those details."
    )
    _add_project_arg(subparser)
    subparser.add_argument("run_id", help="Run id, or a unique hex prefix of at least 8 characters.")
    _add_json_flag(subparser)
    subparser.set_defaults(handler=_cmd_events)


def _configure_open(subparser: argparse.ArgumentParser) -> None:
    subparser.add_argument(
        "run_id",
        nargs="?",
        default=None,
        help="Exact successful rendering.render run (default: latest).",
    )
    subparser.add_argument(
        "--project",
        "--project-id",
        dest="project",
        default=None,
        help="Project id or immutable slug (default: selected current project).",
    )
    timeline_group = subparser.add_mutually_exclusive_group()
    timeline_group.add_argument(
        "--timeline",
        "--timeline-id",
        dest="timeline",
        default=None,
        help="Canonical timeline slug/id to select.",
    )
    timeline_group.add_argument(
        "--default-timeline",
        action="store_true",
        help="Select the project's configured default canonical timeline.",
    )
    subparser.add_argument(
        "--no-open",
        action="store_true",
        help="Materialize and verify the render, but do not open it; prints the path.",
    )
    _add_json_flag(subparser)
    subparser.set_defaults(handler=_cmd_open)


COMMANDS: tuple[CommandSpec, ...] = (
    CommandSpec(
        "list",
        help="List every run in a project (started_at then id).",
        configure=_configure_list,
    ),
    CommandSpec(
        "show",
        help="Show one run with derived child progress "
        "(optional --evidence).",
        configure=_configure_show,
    ),
    CommandSpec(
        "cancel",
        help="Cancel every eligible child of one run (one SDK call).",
        configure=_configure_cancel,
    ),
    CommandSpec(
        "retry",
        help="Retry a run's eligible failed/expired children "
        "(optional --task subset; one SDK call).",
        configure=_configure_retry,
    ),
    CommandSpec(
        "events",
        help=(
            "Show run-level core.run lifecycle events; use tasks events for "
            "child transitions."
        ),
        configure=_configure_events,
    ),
    CommandSpec(
        "open",
        help="Open an exact render, or the latest render in the current project.",
        configure=_configure_open,
    ),
)


def build_parser(client: Any) -> argparse.ArgumentParser:
    """Build the ``runs`` product-family parser stamped with *client*.

    Exactly the six plural verbs above are registered; the singular
    ``run`` alias is not a product family and is never registered here.
    """
    parser = argparse.ArgumentParser(
        prog="astrid runs",
        description=(
            "Run list/show/cancel/retry/events/open (product family); "
            "the singular 'run' alias is not a product family."
        ),
    )
    subparsers = parser.add_subparsers(dest="command", required=True)
    register_product_commands(
        subparsers, COMMANDS, family=_FAMILY, client=client
    )
    return parser

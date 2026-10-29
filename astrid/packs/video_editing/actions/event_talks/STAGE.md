# Event Talks

`video_editing.event_talks` writes an event-talk workflow plan and can run its local template, transcript-search, and holding-screen steps from optional Runtime-materialized `source` and `transcript` files. It returns the plan JSON. The separate `render` subcommand is still a stub that raises `NotImplementedError`; a full run that reaches that step is not a completed video render. `dry_run` emits the plan without executing steps.

The V3 action API uses `kind="action"`. Optional inputs are `source`, `transcript`, `project`, `python_exec`, `verbose`, and `dry_run`. The action does not claim provider or renderer functionality beyond the implemented local steps.

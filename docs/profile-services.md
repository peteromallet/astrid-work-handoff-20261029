# Profile services

The active source profile can set `service_declaration` to the absolute path of
one agent-owned JSON file matching [`services.json`](../contract/schemas/services.json).
No field (or `null`) means no services. An explicitly configured missing or invalid
file refuses startup; Runtime never scans for installations or imports agent code.
The installer already links the declaring installed environment with
`runtime_environment`; services use that same environment, without a second
interpreter setting. A profile without it uses the current installed interpreter.

For example, the agent installer may write these source-profile fields:

```json
{
  "profile": "astrid",
  "runtime_checkout": "/install/lib/python3.11/site-packages",
  "source_checkout": "/install/lib/python3.11/site-packages",
  "runtime_environment": "/install",
  "service_declaration": "/install/lib/python3.11/site-packages/agent/services.json"
}
```

The declaration is versioned independently of the HTTP protocol:

```json
{
  "version": 1,
  "services": [
    {
      "name": "example-service",
      "argv": ["{python}", "-m", "example.service", "--support-root", "{support_root}"],
      "env": {"PYTHONUNBUFFERED": "1"},
      "restart": "always",
      "ready": {"file": "example-ready.json", "timeout_seconds": 30}
    }
  ]
}
```

Names must be unique, including case, and readiness files must be unique.
Commands are argv arrays, passed directly to process creation with no shell.
Runtime substitutes only entire argv elements and entire env values equal to
`{python}`, `{source_checkout}`, `{support_root}`, `{realm_root}`, `{realm_id}`,
or `{runtime_endpoint}`. Other strings pass through literally; there is no shell
or environment-variable expansion. The Python path keeps its virtual-environment
spelling (`Scripts/python.exe` on Windows, `bin/python` elsewhere), even when it is
a symlink. The working directory is `source_checkout`. Children inherit the
Runtime's environment, with Python import overrides and Runtime custody/Job
handoff variables removed; the selected environment's scripts directory leads
`PATH`, and declaration `env` additions are applied last.

`ready` is optional. Without it, a service is `starting` until it has stayed
alive for two seconds, then becomes `running`. With it, the service owns the
named file directly inside Runtime support (no directories). Runtime removes
the old file before each launch and after stopping the tree. The service writes
it atomically when ready; Runtime changes the state to `running` when that
regular file appears. Endpoint consumers still validate the handshake
contents. Readiness timeout is a failure and restarts the tree.

Both `run` and `up` start services after Runtime admission, discovery publication,
and listener startup. Services can read discovery and wait for their scoped
credentials as needed. Runtime does not grant additional credentials or start
worker execution through this declaration. Services own their child protocols.
Chat continues to use the existing support-folder `chat.json` handshake, with no
registration API. An agent may declare `chat.json` as its readiness file.

`always` restarts any exit; `on-failure` restarts nonzero exits, launch errors and
readiness timeouts. A successful `on-failure` exit is terminal (`failed`, last
exit `0`). Three consecutive failures before completing two seconds of running
set the state to `failed` with reason `startup_failed`; retries and backoff
continue, and each new launch returns the state to `starting`. Retry delays are
1, 2, 4, 8, 16, then 30 seconds, resetting after a minute of stable running.
Runtime stops supervised descendants before a replacement starts. It
guarantees cleanup for descendants that remain in its supervised process group
on POSIX or its Job Object on Windows.
If a service creates descendants outside that group, the service owns their
full lifecycle: it must stop them before exiting after stdin EOF or SIGTERM,
and recover them on its next start after a crash. Runtime does not provide
stronger containment or recovery for escaped processes.

Runtime starts each service with stdin connected to a pipe. On shutdown it
closes that pipe, which is the cooperative “stop now” request all services
must handle, including on Windows where services have no console. Runtime also
sends SIGTERM on POSIX. It waits up to five seconds, then forcibly cleans up
the supervised process group or Job Object. The same cleanup runs after a
service exits, so remaining supervised descendants are stopped before a
replacement starts. Windows service children are launched without a console
window.
For profiles with services, the outer `up`/`down` owner stop allows twenty
seconds for the supervisor and listeners to finish before escalating against
the Runtime itself; profiles without a declaration keep the existing wait.

The existing health response includes `services`, an array of `{name, state,
last_exit}` records, with state `starting`, `running`, `restarting`, or `failed`
and a nullable integer exit code. Records also include `restart_count` and an
optional fixed `reason` code. `restarting` describes the retry delay; `failed`
can describe repeated startup failures while backoff continues. Health's
top-level status continues to describe Runtime admission;
a failing optional service does not make the Runtime disappear. `status --json`
preserves the same records under `health.services`. Command arguments and env
values are never included in status.

Each service writes stdout and stderr to `service-<name>.log` beside
`runtime.log`. Both use the same rotation policy: 5 MiB per file and three
backups (`.1` through `.3`), closing before renaming and retrying temporary
Windows sharing violations for a bounded interval. Restart Runtime
to apply profile or declaration edits.

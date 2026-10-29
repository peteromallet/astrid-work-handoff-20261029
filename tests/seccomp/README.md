# OpenShell-like seccomp profile

`openshell-like.json` reproduces the three process-control denials of NVIDIA OpenShell's sandbox
filter (`crates/openshell-sandbox/src/linux/child_seccomp.rs`):

- `pidfd_open` returns ENOSYS;
- `pidfd_send_signal` and `pidfd_getfd` return EPERM;
- `kill` with a negative pid (a process group) or pid 0 returns EPERM.

Everything else is allowed, so the profile tests exactly the primitives sandbox process control
relaxes, not Docker's general hardening.

Run the suite the way CI's `sandbox-process-control` job does (needs Docker):

    sh tests/seccomp/run-suite.sh            # extra arguments go to pytest

It copies the checkout into a `python:3.11` container started with this profile and runs the
suite as an unprivileged user with `--process-control=sandbox`. That makes every Runtime support
root without a setting behave like an install made with `--sandbox` (see `tests/conftest.py`).
Tests marked `needs_real_pidfd` exercise the strict pidfd path itself, which this profile
blocks by design, so this job alone deselects them.

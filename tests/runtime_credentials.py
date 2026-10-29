"""Helpers for tests that exercise scoped executor credentials."""


EXECUTOR_SCOPES = (
    "handshake",
    "worker:execute",
    "tasks:read",
    "objects:read",
    "objects:write",
)


def provision_executor_token(daemon, executor_id: str) -> str:
    """Provision an executor-bound token without owner or registration scope."""
    token, _path = daemon.credentials.provision(executor_id, list(EXECUTOR_SCOPES))
    return token

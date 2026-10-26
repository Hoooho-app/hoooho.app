# V3 historical interaction contract

The owner explicitly reverted this interaction in the selective rollback recorded
in `docs/selective-interaction-rollback-20261027.md`. This suite is retained as
historical evidence for commit `110a8a90`, rather than silently changing its V3
expectations to claim that V3 and the restored interaction are the same.

Current interaction acceptance uses the restored conversation-home, dialogue and
nurse-frontdesk-upgrade-mobile suites plus `tests/selective-rollback/`.
The V3 backend integrity, source-ID, idempotency and unknown-time tests remain
active; only the superseded microphone/card/navigation contract is retired.

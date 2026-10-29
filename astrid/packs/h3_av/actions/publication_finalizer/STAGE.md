# H3 verified publication finalizer action

This action accepts a composed candidate and its H3 verification report, checks
the existing request, candidate digest and prepared/composed/verified lifecycle,
then copies the verified bytes into the Runtime publication spool and emits the
existing result manifest.

It does not publish externally and does not weaken caller-authorized generation
publication. The sealed `generation_intent` remains an integration/runtime
input owned by the H3 transform handoff.

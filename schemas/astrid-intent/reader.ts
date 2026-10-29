// Stub reader for Astrid's intent (A1 shape). Mirrors astrid/core/timeline/astrid_ns.py: read_app and
// film_intent. Reads go to the app.astrid namespace and fall back to the legacy locations (flat clip.app
// intent keys, loose parent.config intent keys); the namespace wins per key. Read-only: nothing is written
// and no input is mutated. Schema: ./astrid-intent.schema.json. Type annotations only (no enums, no
// namespaces), so it runs under Node's type stripping as well as under tsc.

export type IntentObject = Record<string, unknown>;

const NS = "astrid";

// astrid_ns.CLIP_INTENT_KEYS: the legacy flat clip.app spellings that move under app.astrid.
export const CLIP_INTENT_KEYS: readonly string[] = [
  "on", "until", "for", "cut", "layer", "deliberate", "deliberate_hold", "why", "why_layers", "formulas",
  "segment", "words", "text", "gap_after_s", "beats", "slot", "replaces", "standin_for", "intended",
  "sequence", "sequence_index", "sequence_fit", "sequence_shape_from", "orphan",
  "role", "style", "group", "duck",
];

// astrid_ns.FILM_INTENT_KEYS: the legacy loose parent.config keys.
export const FILM_INTENT_KEYS: readonly string[] = ["chapters", "slots", "cut_notes", "formulas", "sequences"];

function asObject(value: unknown): IntentObject {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as IntentObject) : {};
}

function isObject(value: unknown): value is IntentObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

// astrid_ns.read_app: the clip's app as a reader sees it. Legacy flat keys overlaid by app.astrid.
// If there is no namespace, the clip's app is returned as it is (same object, like the Python).
export function readClipIntent(clip: unknown): IntentObject {
  const app = asObject(asObject(clip).app);
  const ns = app[NS];
  if (!isObject(ns)) {
    return app;
  }
  const merged: IntentObject = {};
  for (const key of Object.keys(app)) {
    if (key !== NS) {
      merged[key] = app[key];
    }
  }
  Object.assign(merged, ns);
  return merged;
}

// astrid_ns.film_intent: film-level intent from a parent.config. Legacy loose keys overlaid by app.astrid.
export function readFilmIntent(config: unknown): IntentObject {
  const cfg = asObject(config);
  const out: IntentObject = {};
  for (const key of FILM_INTENT_KEYS) {
    if (key in cfg) {
      out[key] = cfg[key];
    }
  }
  const ns = asObject(cfg.app)[NS];
  if (isObject(ns)) {
    Object.assign(out, ns);
  }
  return out;
}

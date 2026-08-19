// ===== config/characters.js (migrated + JSON-driven) =====
// The static tuning data now lives in characters.json (editable without
// touching code). The non-serializable buildSegments builders live in
// segmentBuilders.js and are re-attached here at load time.
//
// Both IMAGES and CHARACTERS are `let` so a Vite HMR update of the JSON file
// can hot-swap the data live (see import.meta.hot block at the bottom) and
// every importer sees the new values through ES module live bindings.

import charData from './characters.json';
import { SEGMENT_BUILDERS } from './segmentBuilders.js';

function composeCharacters(raw) {
  const out = {};
  for (const [key, cfg] of Object.entries(raw.CHARACTERS)) {
    // attach the builder back as a method → preserves `this` semantics used
    // by desert / perforator / thanatos builders.
    out[key] = { ...cfg, buildSegments: SEGMENT_BUILDERS[key] };
  }
  return out;
}

export let IMAGES = charData.IMAGES;
export let CHARACTERS = composeCharacters(charData);

// ── HMR hook ──────────────────────────────────────────────────────────────
// Game.js registers a callback so a live edit of characters.json can re-apply
// the new config to a running game (without a full page reload).

let _reloadCb = null;
export function onCharactersReload(cb) { _reloadCb = cb; }

if (import.meta.hot) {
  import.meta.hot.accept('./characters.json', (mod) => {
    if (!mod) return;
    IMAGES = mod.default.IMAGES;
    CHARACTERS = composeCharacters(mod.default);
    if (typeof _reloadCb === 'function') _reloadCb();
  });
}

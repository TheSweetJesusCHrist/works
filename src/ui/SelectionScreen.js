// ===== ui/SelectionScreen.js (migrated from scourge_selector.html) =====
export function showTitle() {
  document.getElementById('title').style.display = 'flex';
  document.getElementById('selection').style.display = 'none';
  document.getElementById('game').style.display = 'none';
  document.getElementById('controls').style.display = 'none';
}

export function showSelection() {
  document.getElementById('title').style.display = 'none';
  document.getElementById('selection').style.display = 'flex';
  document.getElementById('controls').style.display = 'none';
}
// ===== Keybinding System (data-driven, rebindable, all English) =====

export const keyBindings = {
  // Group: General
  mouse_move:     { label: 'Move / Aim',       defaultKey: 'Mouse',   currentKey: 'Mouse',    group: 'general' },
  day_cycle:      { label: 'Day / Dusk / Night',defaultKey: 'l',       currentKey: 'l',        group: 'general' },
  toggle_rain:    { label: 'Toggle Rain',       defaultKey: 't',       currentKey: 't',        group: 'general' },
  reset_pos:      { label: 'Reset Position',    defaultKey: 'r',       currentKey: 'r',        group: 'general' },
  back_key:       { label: 'Back',              defaultKey: 'Escape',  currentKey: 'Escape',   group: 'general' },

  // Group: Worm Body
  seg_up:         { label: 'Add Segments',      defaultKey: 'ArrowUp', currentKey: 'ArrowUp',  group: 'body' },
  seg_down:       { label: 'Remove Segments',   defaultKey: 'ArrowDown',currentKey:'ArrowDown',group: 'body' },
  form_large:     { label: 'Form - Large',      defaultKey: '1',       currentKey: '1',        group: 'body' },
  form_medium:    { label: 'Form - Medium',     defaultKey: '2',       currentKey: '2',        group: 'body' },
  form_small:     { label: 'Form - Small',      defaultKey: '3',       currentKey: '3',        group: 'body' },

  // Group: DoG Animations
  dog_bite:       { label: 'Bite Attack',       defaultKey: '5',       currentKey: '5',        group: 'dog' },
  dog_phase2:     { label: 'Armor-Off Form',     defaultKey: '6',       currentKey: '6',        group: 'dog' },
  dog_death:      { label: 'Death Demo',        defaultKey: '7',       currentKey: '7',        group: 'dog' },
  dog_laser:      { label: 'Laser Wall Recover',defaultKey: '8',       currentKey: '8',        group: 'dog' },
  dog_reset:      { label: 'Reset Animation',   defaultKey: ' ',       currentKey: ' ',        group: 'dog' },
  dog_toggleform: { label: 'Phase Transition (Portal)', defaultKey: 'p', currentKey: 'p', group: 'dog' }
};


export const GROUP_NAMES = { general: 'General', body: 'Worm Body', dog: 'DoG Animations' };


export let rebindingAction = null;  // currently rebinding action id, or null

/** Format a key code for display (e.g. ' ' → 'Space', 'ArrowUp' → '↑') */

export function formatKeyDisplay(k) {
  if (k === ' ') return 'Space';
  if (k === 'Escape') return 'ESC';
  if (k === 'ArrowUp') return '\u2191';      // ↑
  if (k === 'ArrowDown') return '\u2193';    // ↓
  if (k === 'ArrowLeft') return '\u2190';
  if (k === 'ArrowRight') return '\u2192';
  if (k.startsWith('Arrow')) return k.replace('Arrow', '');
  if (k.length > 1) return k.charAt(0).toUpperCase() + k.slice(1);
  return k.toUpperCase();
}

/** Render the full keybinding grid into #controls-panel */

export function renderKeyBindings() {
  const panel = document.getElementById('controls-panel');
  if (!panel) return;
  let html = '';
  for (const [gid, gname] of Object.entries(GROUP_NAMES)) {
    html += '<div class="ctrl-group' + (gid === 'dog' ? ' dog' : '') + '"><h3>' + gname + '</h3>';
    html += '<div class="kb-grid">';
    for (const [id, kb] of Object.entries(keyBindings)) {
      if (kb.group !== gid) continue;
      const display = formatKeyDisplay(kb.currentKey);
      const activeCls = (rebindingAction === id) ? ' rebinding' : '';
      html += '<div class="kb-row">';
      html += '<div class="kb-label">' + kb.label + '</div>';
      html += '<div class="kb-key' + activeCls + '" data-action="' + id + '" title="Click to rebind">' + display + '</div>';
      html += '</div>';
    }
    html += '</div></div>';
  }
  panel.innerHTML = html;
  attachRebindListeners();
}

/** Attach click listeners to all .kb-key cells */

export function attachRebindListeners() {
  document.querySelectorAll('.kb-key').forEach(el => {
    el.addEventListener('click', function () {
      const action = this.getAttribute('data-action');
      startRebind(action);
    });
  });
}

/** Enter rebind mode for given action */

export function startRebind(actionId) {
  rebindingAction = actionId;
  renderKeyBindings(); // highlight the cell
}

/** Handle incoming key during rebind mode; returns true if consumed */

export function handleRebind(e) {
  if (!rebindingAction) return false;
  e.preventDefault(); e.stopPropagation();

  // Escape cancels
  if (e.key === 'Escape') { rebindingAction = null; renderKeyBindings(); return true; }

  // Reject reserved keys that would trap user
  if (e.key === 'F5' || e.key === 'F12' || e.key === 'F11') {
    rebindingAction = null; renderKeyBindings(); return true;
  }

  // Apply new binding
  const kb = keyBindings[rebindingAction];
  if (kb) {
    kb.currentKey = e.key;
    saveKeyBindings();
  }
  rebindingAction = null;
  renderKeyBindings();
  return true;
}

/** Save bindings to localStorage */

export function saveKeyBindings() {
  try {
    const obj = {};
    for (const [id, kb] of Object.entries(keyBindings)) obj[id] = kb.currentKey;
    localStorage.setItem('scourge_keybindings', JSON.stringify(obj));
  } catch (_) {}
}

/** Load bindings from localStorage */

export function loadKeyBindings() {
  try {
    const raw = localStorage.getItem('scourge_keybindings');
    if (!raw) return;
    const obj = JSON.parse(raw);
    for (const [id, k] of Object.entries(obj)) {
      if (keyBindings[id]) keyBindings[id].currentKey = k;
    }
  } catch (_) {}
}

/** Check if a key event matches a given binding action (case-insensitive for letters) */

export function isBound(actionId, e) {
  const kb = keyBindings[actionId];
  if (!kb) return false;
  const ek = e.key, bk = kb.currentKey;
  // Exact match for special keys (Space, Escape, Arrow*, digits)
  if (ek === bk) return true;
  // Case-insensitive for single-letter keys
  if (ek.length === 1 && bk.length === 1 && ek.toLowerCase() === bk.toLowerCase()) return true;
  return false;
}

// Load saved bindings on startup
loadKeyBindings();


export function showControls() {
  document.getElementById('controls').style.display = 'flex';
  renderKeyBindings(); // fresh render each time opened
}

export function hideControls() { document.getElementById('controls').style.display = 'none'; }

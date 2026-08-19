// ===== main.js (entry) =====
import './style.css';
import { init, startGame, returnToSelection } from './core/Game.js';
import { showTitle, showSelection, showControls, hideControls, loadKeyBindings } from './ui/SelectionScreen.js';
import { initCelestial } from './core/Background.js';
import { initInput } from './core/Input.js';
import { initDebugPanel } from './ui/DebugPanel.js';

initInput();
loadKeyBindings();

document.getElementById('btn-play').addEventListener('click', showSelection);
document.getElementById('btn-controls').addEventListener('click', showControls);
document.getElementById('btn-controls-close').addEventListener('click', hideControls);

init();
showTitle();
initCelestial();
initDebugPanel();

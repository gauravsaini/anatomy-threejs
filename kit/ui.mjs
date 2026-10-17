// kit/ui.mjs — framed telemetry card: top control bar + bottom live readout.
//
// Model contract (model.js, the single source of truth):
//   model.tick(dt)        advance the simulation by dt seconds
//   model.telemetry()     return { label: value, ... } for the bottom bar
//
// Agent loop:
//   const ui = createControlBar(container, rig, model, { title, subtitle });
//   const dt = Math.min(clock.getDelta(), 0.05) * ui.getTimeScale();
//   model.tick(dt);
//   rig.render(dt);
//   ui.update();

const STYLE_ID = 'anatomy-ui-style';

function ensureStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .ta-topbar { display: flex; align-items: center; justify-content: space-between;
      gap: 12px; padding: 10px 14px; background: #14171c; color: #e5e7eb;
      border-bottom: 1px solid #262b33; font-family: ui-sans-serif, system-ui, sans-serif; }
    .ta-title { font-size: 15px; font-weight: 650; letter-spacing: 0.02em; }
    .ta-subtitle { font-size: 12px; color: #9ca3af; margin-top: 2px; }
    .ta-controls { display: flex; gap: 8px; }
    .ta-controls button { font-family: inherit; font-size: 12px; font-weight: 600;
      padding: 7px 12px; border-radius: 8px; border: 1px solid #374151;
      background: #1f242c; color: #e5e7eb; cursor: pointer; white-space: nowrap; }
    .ta-controls button:hover:not(:disabled) { background: #2a313b; }
    .ta-controls button:disabled { opacity: 0.55; cursor: wait; }
    .ta-controls button.ta-active { background: #1d4ed8; border-color: #3b82f6; }
    .ta-bottombar { padding: 8px 14px; background: #14171c; color: #a7f3d0;
      border-top: 1px solid #262b33; font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      font-size: 12px; white-space: nowrap; overflow-x: auto; }
    .ta-bottombar .ta-kv { margin-right: 18px; }
    .ta-bottombar .ta-k { color: #6b7280; }
  `;
  document.head.appendChild(style);
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

export function createControlBar(container, rig, model, { title = 'Machine', subtitle = '', slowMoFactor = 0.1 } = {}) {
  ensureStyle();

  const topbar = document.createElement('div');
  topbar.className = 'ta-topbar';
  topbar.innerHTML =
    '<div><div class="ta-title">' + escapeHtml(title) + '</div>' +
    (subtitle ? '<div class="ta-subtitle">' + escapeHtml(subtitle) + '</div>' : '') + '</div>' +
    '<div class="ta-controls"></div>';
  const controlsEl = topbar.querySelector('.ta-controls');

  const bottombar = document.createElement('div');
  bottombar.className = 'ta-bottombar';
  bottombar.textContent = 'telemetry …';

  // Wrap the rig canvas: topbar, canvas, bottombar.
  container.prepend(topbar);
  container.appendChild(bottombar);

  let timeScale = 1;
  let assembled = true;

  const explodeBtn = document.createElement('button');
  explodeBtn.textContent = 'Explode';
  explodeBtn.title = 'Take apart layer by layer, then put back (E)';
  explodeBtn.onclick = () => {
    if (rig.stagedRunning()) return;
    explodeBtn.disabled = true;
    if (assembled) {
      rig.explodeStaged({
        onProgress: ({ layerIndex, layerName, layersTotal }) => {
          explodeBtn.textContent = 'Exploding ' + (layerIndex + 1) + '/' + layersTotal + ' · ' + layerName;
        },
        onComplete: () => {
          assembled = false;
          explodeBtn.disabled = false;
          explodeBtn.textContent = 'Reassemble';
        },
      });
    } else {
      rig.reassembleStaged({
        onProgress: ({ layerIndex, layerName, layersTotal }) => {
          explodeBtn.textContent = 'Reassembling ' + (layerIndex + 1) + '/' + layersTotal + ' · ' + layerName;
        },
        onComplete: () => {
          assembled = true;
          explodeBtn.disabled = false;
          explodeBtn.textContent = 'Explode';
        },
      });
    }
  };

  const cameraBtn = document.createElement('button');
  cameraBtn.textContent = 'Ortho/Persp';
  cameraBtn.title = 'Toggle isometric / perspective camera (C)';
  cameraBtn.onclick = () => rig.toggleCamera();

  const slowmoBtn = document.createElement('button');
  slowmoBtn.textContent = 'Slow-Mo';
  slowmoBtn.title = 'Toggle slow motion (S)';
  slowmoBtn.onclick = () => {
    timeScale = timeScale === 1 ? slowMoFactor : 1;
    slowmoBtn.classList.toggle('ta-active', timeScale !== 1);
  };

  controlsEl.append(explodeBtn, cameraBtn, slowmoBtn);

  document.addEventListener('keydown', (e) => {
    if (e.target && e.target.matches && e.target.matches('input, textarea, [contenteditable]')) return;
    const k = e.key.toLowerCase();
    if (k === 'e') explodeBtn.click();
    else if (k === 'c') cameraBtn.click();
    else if (k === 's') slowmoBtn.click();
  });

  function update() {
    const t = model.telemetry ? model.telemetry() : {};
    bottombar.innerHTML = Object.entries(t)
      .map(([k, v]) => '<span class="ta-kv"><span class="ta-k">' + escapeHtml(k) + '</span> ' + escapeHtml(v) + '</span>')
      .join('');
  }

  return {
    element: topbar,
    telemetryElement: bottombar,
    update,
    getTimeScale: () => timeScale,
  };
}

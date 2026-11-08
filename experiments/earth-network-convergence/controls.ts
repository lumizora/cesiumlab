import type { NetworkScene, NetworkState } from './network';

export interface ControlsCallbacks {
  onGlowChange: () => void;
  onReset: () => void;
  onTriggerPulse: () => void;
}

export interface ControlsHandle {
  destroy: () => void;
  sync: () => void;
}

const PANEL_HTML = `
  <div class="earth-controls__header">
    <span class="earth-controls__eyebrow">S2-001</span>
    <strong>Earth Network</strong>
    <span class="earth-controls__state">Awaiting Review</span>
  </div>
  <label class="earth-controls__row">
    <span>金色飞线</span>
    <input type="color" data-control="routeColor" aria-label="金色飞线颜色" />
  </label>
  <label class="earth-controls__row">
    <span>飞线速度</span>
    <input type="range" min="0" max="2.5" step="0.05" data-control="routeSpeed" aria-label="飞线速度" />
  </label>
  <label class="earth-controls__row">
    <span>节点颜色</span>
    <input type="color" data-control="nodeColor" aria-label="节点颜色" />
  </label>
  <label class="earth-controls__row">
    <span>辉光强度</span>
    <input type="range" min="0" max="2" step="0.05" data-control="glowIntensity" aria-label="辉光强度" />
  </label>
  <label class="earth-controls__row">
    <span>节点脉冲</span>
    <input type="range" min="0" max="2.5" step="0.05" data-control="pulseSpeed" aria-label="节点脉冲速度" />
  </label>
  <label class="earth-controls__row earth-controls__row--check">
    <span>显示地理边界</span>
    <input type="checkbox" data-control="showBorders" aria-label="显示地理边界" />
  </label>
  <button type="button" class="earth-controls__pulse" data-action="pulse">触发中心脉冲</button>
  <button type="button" class="earth-controls__reset" data-action="reset">重置 Showcase</button>
`;

export function createControls(
  host: HTMLElement,
  state: NetworkState,
  scene: NetworkScene,
  callbacks: ControlsCallbacks,
): ControlsHandle {
  const panel = document.createElement('div');
  panel.className = 'earth-controls';
  panel.dataset.testid = 'earth-controls';
  panel.innerHTML = PANEL_HTML;
  host.append(panel);

  const input = <T extends HTMLInputElement>(name: string): T => {
    const element = panel.querySelector<T>(`[data-control="${name}"]`);
    if (!element) {
      throw new Error(`Missing control: ${name}`);
    }
    return element;
  };

  const routeColorInput = input<HTMLInputElement>('routeColor');
  const routeSpeedInput = input<HTMLInputElement>('routeSpeed');
  const nodeColorInput = input<HTMLInputElement>('nodeColor');
  const glowInput = input<HTMLInputElement>('glowIntensity');
  const pulseInput = input<HTMLInputElement>('pulseSpeed');
  const bordersInput = input<HTMLInputElement>('showBorders');
  const resetButton = panel.querySelector<HTMLButtonElement>('[data-action="reset"]');
  const pulseButton = panel.querySelector<HTMLButtonElement>('[data-action="pulse"]');

  const updateDataset = () => {
    host.dataset.routeColor = state.routeColor;
    host.dataset.routeSpeed = state.routeSpeed.toFixed(2);
    host.dataset.nodeColor = state.nodeColor;
    host.dataset.glowIntensity = state.glowIntensity.toFixed(2);
    host.dataset.pulseSpeed = state.pulseSpeed.toFixed(2);
    host.dataset.showBorders = String(state.showBorders);
  };

  const sync = () => {
    routeColorInput.value = state.routeColor;
    routeSpeedInput.value = String(state.routeSpeed);
    nodeColorInput.value = state.nodeColor;
    glowInput.value = String(state.glowIntensity);
    pulseInput.value = String(state.pulseSpeed);
    bordersInput.checked = state.showBorders;
    updateDataset();
  };

  routeColorInput.addEventListener('input', () => {
    state.routeColor = routeColorInput.value;
    updateDataset();
  });

  routeSpeedInput.addEventListener('input', () => {
    state.routeSpeed = Number(routeSpeedInput.value);
    updateDataset();
  });

  nodeColorInput.addEventListener('input', () => {
    state.nodeColor = nodeColorInput.value;
    updateDataset();
  });

  glowInput.addEventListener('input', () => {
    state.glowIntensity = Number(glowInput.value);
    updateDataset();
    callbacks.onGlowChange();
  });

  pulseInput.addEventListener('input', () => {
    state.pulseSpeed = Number(pulseInput.value);
    updateDataset();
  });

  bordersInput.addEventListener('change', () => {
    state.showBorders = bordersInput.checked;
    scene.setShowBorders(state.showBorders);
    updateDataset();
  });

  resetButton?.addEventListener('click', () => {
    callbacks.onReset();
  });

  pulseButton?.addEventListener('click', () => {
    callbacks.onTriggerPulse();
  });

  sync();

  return {
    destroy: () => {
      panel.remove();
    },
    sync,
  };
}

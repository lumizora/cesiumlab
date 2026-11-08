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
    <span>弧线透明度</span>
    <input type="range" min="0" max="1" step="0.01" data-control="baseArcOpacity" aria-label="基础弧线透明度" />
  </label>
  <label class="earth-controls__row">
    <span>光点亮度</span>
    <input type="range" min="0.3" max="2" step="0.05" data-control="pointBrightness" aria-label="光点亮度" />
  </label>
  <label class="earth-controls__row">
    <span>拖尾长度</span>
    <input type="range" min="0.05" max="0.35" step="0.01" data-control="trailLength" aria-label="拖尾长度" />
  </label>
  <label class="earth-controls__row">
    <span>弧线高度</span>
    <input type="range" min="0.6" max="1.6" step="0.05" data-control="arcHeightScale" aria-label="弧线高度倍率" />
  </label>
  <details class="earth-controls__group">
    <summary>Energy Beam</summary>
    <label class="earth-controls__row">
      <span>光束高度</span>
      <input type="range" min="0.6" max="1.5" step="0.05" data-control="beamHeight" aria-label="光束高度" />
    </label>
    <label class="earth-controls__row">
      <span>核心宽度</span>
      <input type="range" min="0.5" max="2" step="0.05" data-control="beamCoreWidth" aria-label="光束核心宽度" />
    </label>
    <label class="earth-controls__row">
      <span>光晕宽度</span>
      <input type="range" min="0.5" max="2" step="0.05" data-control="beamGlowWidth" aria-label="光束光晕宽度" />
    </label>
    <label class="earth-controls__row">
      <span>底部亮度</span>
      <input type="range" min="0.3" max="1.5" step="0.05" data-control="beamIntensity" aria-label="光束底部亮度" />
    </label>
    <label class="earth-controls__row">
      <span>呼吸速度</span>
      <input type="range" min="0.2" max="2" step="0.05" data-control="beamBreathingSpeed" aria-label="光束呼吸速度" />
    </label>
  </details>
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
  <button type="button" class="earth-controls__pause" data-action="pause">暂停动画</button>
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
  const baseArcOpacityInput = input<HTMLInputElement>('baseArcOpacity');
  const pointBrightnessInput = input<HTMLInputElement>('pointBrightness');
  const trailLengthInput = input<HTMLInputElement>('trailLength');
  const arcHeightInput = input<HTMLInputElement>('arcHeightScale');
  const beamHeightInput = input<HTMLInputElement>('beamHeight');
  const beamCoreWidthInput = input<HTMLInputElement>('beamCoreWidth');
  const beamGlowWidthInput = input<HTMLInputElement>('beamGlowWidth');
  const beamIntensityInput = input<HTMLInputElement>('beamIntensity');
  const beamBreathingInput = input<HTMLInputElement>('beamBreathingSpeed');
  const nodeColorInput = input<HTMLInputElement>('nodeColor');
  const glowInput = input<HTMLInputElement>('glowIntensity');
  const pulseInput = input<HTMLInputElement>('pulseSpeed');
  const bordersInput = input<HTMLInputElement>('showBorders');
  const resetButton = panel.querySelector<HTMLButtonElement>('[data-action="reset"]');
  const pulseButton = panel.querySelector<HTMLButtonElement>('[data-action="pulse"]');
  const pauseButton = panel.querySelector<HTMLButtonElement>('[data-action="pause"]');

  const updateDataset = () => {
    host.dataset.routeColor = state.routeColor;
    host.dataset.routeSpeed = state.routeSpeed.toFixed(2);
    host.dataset.baseArcOpacity = state.baseArcOpacity.toFixed(2);
    host.dataset.pointBrightness = state.pointBrightness.toFixed(2);
    host.dataset.trailLength = state.trailLength.toFixed(2);
    host.dataset.arcHeightScale = state.arcHeightScale.toFixed(2);
    host.dataset.beamHeight = state.beamHeight.toFixed(2);
    host.dataset.beamCoreWidth = state.beamCoreWidth.toFixed(2);
    host.dataset.beamGlowWidth = state.beamGlowWidth.toFixed(2);
    host.dataset.beamIntensity = state.beamIntensity.toFixed(2);
    host.dataset.beamBreathingSpeed = state.beamBreathingSpeed.toFixed(2);
    host.dataset.nodeColor = state.nodeColor;
    host.dataset.glowIntensity = state.glowIntensity.toFixed(2);
    host.dataset.pulseSpeed = state.pulseSpeed.toFixed(2);
    host.dataset.showBorders = String(state.showBorders);
    host.dataset.paused = String(scene.isPaused());
  };

  const sync = () => {
    routeColorInput.value = state.routeColor;
    routeSpeedInput.value = String(state.routeSpeed);
    baseArcOpacityInput.value = String(state.baseArcOpacity);
    pointBrightnessInput.value = String(state.pointBrightness);
    trailLengthInput.value = String(state.trailLength);
    arcHeightInput.value = String(state.arcHeightScale);
    beamHeightInput.value = String(state.beamHeight);
    beamCoreWidthInput.value = String(state.beamCoreWidth);
    beamGlowWidthInput.value = String(state.beamGlowWidth);
    beamIntensityInput.value = String(state.beamIntensity);
    beamBreathingInput.value = String(state.beamBreathingSpeed);
    nodeColorInput.value = state.nodeColor;
    glowInput.value = String(state.glowIntensity);
    pulseInput.value = String(state.pulseSpeed);
    bordersInput.checked = state.showBorders;
    if (pauseButton) {
      pauseButton.textContent = scene.isPaused() ? '继续动画' : '暂停动画';
      pauseButton.setAttribute('aria-pressed', String(scene.isPaused()));
    }
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

  baseArcOpacityInput.addEventListener('input', () => {
    state.baseArcOpacity = Number(baseArcOpacityInput.value);
    updateDataset();
  });

  pointBrightnessInput.addEventListener('input', () => {
    state.pointBrightness = Number(pointBrightnessInput.value);
    updateDataset();
  });

  trailLengthInput.addEventListener('input', () => {
    state.trailLength = Number(trailLengthInput.value);
    updateDataset();
  });

  arcHeightInput.addEventListener('input', () => {
    state.arcHeightScale = Number(arcHeightInput.value);
    updateDataset();
  });

  beamHeightInput.addEventListener('input', () => {
    state.beamHeight = Number(beamHeightInput.value);
    updateDataset();
  });

  beamCoreWidthInput.addEventListener('input', () => {
    state.beamCoreWidth = Number(beamCoreWidthInput.value);
    updateDataset();
  });

  beamGlowWidthInput.addEventListener('input', () => {
    state.beamGlowWidth = Number(beamGlowWidthInput.value);
    updateDataset();
  });

  beamIntensityInput.addEventListener('input', () => {
    state.beamIntensity = Number(beamIntensityInput.value);
    updateDataset();
  });

  beamBreathingInput.addEventListener('input', () => {
    state.beamBreathingSpeed = Number(beamBreathingInput.value);
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

  pauseButton?.addEventListener('click', () => {
    scene.setPaused(!scene.isPaused());
    sync();
  });

  sync();

  return {
    destroy: () => {
      panel.remove();
    },
    sync,
  };
}

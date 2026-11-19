import 'cesium/Build/Cesium/Widgets/widgets.css';

import { mountFlowingArc } from './demos/flowing-arc';

const globe = document.querySelector<HTMLElement>('#globe')!;
const status = document.querySelector<HTMLElement>('#scene-status')!;
const play = document.querySelector<HTMLButtonElement>('#play')!;
const reset = document.querySelector<HTMLButtonElement>('#reset')!;

async function start() {
  status.hidden = false;
  try {
    let playing = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const demo = await mountFlowingArc(globe, playing);
    function updatePlayButton() {
      demo.setPlaying(playing);
      play.textContent = playing ? '暂停动画' : '播放动画';
    }

    updatePlayButton();
    status.hidden = true;
    play.disabled = false;
    reset.disabled = false;
    play.onclick = () => {
      playing = !playing;
      updatePlayButton();
    };
    reset.onclick = demo.resetCamera;
    window.addEventListener('pagehide', (event) => {
      if (!event.persisted) demo.destroy();
    });
  } catch (error) {
    globe.replaceChildren();
    status.textContent = '地球加载失败。请启用 WebGL 后刷新页面。';
    console.error(error);
  }
}

void start();

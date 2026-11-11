import { useEffect, useRef, useState } from 'react';
import { Button } from '@astryxdesign/core/Button';

import { detectWebGLSupport } from '../../cesium/webgl-support';
import { loadExperimentModule } from '../../experiments/loader';
import type { ExperimentCleanup } from '../../experiments/types';
import StatusBadge from '../../components/StatusBadge';

type ViewerState = 'idle' | 'loading' | 'ready' | 'error' | 'unsupported';
const STATE_LABELS: Record<ViewerState, string> = {
  idle: '准备中',
  loading: '加载中',
  ready: 'Live',
  error: '运行错误',
  unsupported: 'WebGL 不可用',
};

function formatError(error: unknown): string {
  if (error instanceof Error) return error.stack ?? error.message;
  if (typeof error === 'string') return error;
  try { return JSON.stringify(error); } catch { return String(error); }
}

export default function ViewerHost({experimentId}: {experimentId: string}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<ViewerState>('idle');
  const [message, setMessage] = useState('');
  const [detail, setDetail] = useState('');
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const host = containerRef.current;
    if (!host) return;

    let disposed = false;
    let failure = false;
    let cleanup: ExperimentCleanup | null = null;

    function disposeScene() {
      const current = cleanup;
      cleanup = null;
      if (current) {
        try {
          current();
        } catch (error) {
          console.error('[cesiumlab] Failed to release experiment scene.', error);
        }
      }
      if (host) {
        delete host.dataset.sceneReady;
        host.replaceChildren();
      }
    }

    function reportRuntimeError(error: unknown) {
      if (disposed) return;
      failure = true;
      setState('error');
      setMessage('场景运行时报告错误，已停止渲染并尝试释放资源。');
      setDetail(formatError(error));
      // Never destroy a Cesium Viewer from inside a render/context-loss callback.
      window.setTimeout(() => { if (!disposed && failure) disposeScene(); }, 0);
    }

    async function mount() {
      setState('loading');
      setMessage('');
      setDetail('');
      const support = detectWebGLSupport();
      if (disposed) return;
      if (!support.supported) {
        setState('unsupported');
        setMessage(support.reason ?? '当前浏览器无法创建 WebGL 上下文。');
        return;
      }

      try {
        const module = await loadExperimentModule(experimentId);
        if (disposed) return;
        const result = await module.mount({
          container: host!,
          onError: reportRuntimeError,
        });
        if (disposed) {
          if (typeof result === 'function') result();
          return;
        }
        cleanup = typeof result === 'function' ? result : null;
        if (failure) {
          disposeScene();
          return;
        }
        setState('ready');
      } catch (error) {
        if (disposed) return;
        failure = true;
        setState('error');
        setMessage('场景加载失败。实验入口可能缺失、抛出异常或未能完成初始化。');
        setDetail(formatError(error));
        disposeScene();
      }
    }

    const handlePageHide = () => {
      if (!disposed) {
        setState('idle');
        disposeScene();
      }
    };
    const handlePageShow = (event: PageTransitionEvent) => {
      if (event.persisted && !disposed) setRevision((current) => current + 1);
    };

    window.addEventListener('pagehide', handlePageHide);
    window.addEventListener('pageshow', handlePageShow);
    void mount();

    return () => {
      disposed = true;
      window.removeEventListener('pagehide', handlePageHide);
      window.removeEventListener('pageshow', handlePageShow);
      disposeScene();
    };
  }, [experimentId, revision]);

  const stateTone = state === 'ready' ? 'ok' : state === 'loading' || state === 'idle' ? 'muted' : 'danger';

  return (
    <div className="viewer-host" data-testid="viewer-host" data-state={state} aria-busy={state === 'loading' || state === 'idle'}>
      <div ref={containerRef} className="viewer-canvas" role="region" aria-label={experimentId + ' 的 CesiumJS 场景画布'} />
      <div className="viewer-toolbar">
        <StatusBadge label={STATE_LABELS[state]} tone={stateTone}/>
        {state === 'ready' && <Button size="sm" label="重新加载场景" onClick={() => setRevision(v => v + 1)}/>}
      </div>
      {(state === 'idle' || state === 'loading') && (
        <div className="viewer-overlay" role="status" aria-live="polite">
          <span className="spinner" aria-hidden="true"/><p>正在加载 CesiumJS 场景…</p>
          <p className="hint">首次加载会获取本地 Workers、Assets 与 Widgets 资源。</p>
        </div>
      )}
      {(state === 'error' || state === 'unsupported') && (
        <div className="viewer-overlay viewer-overlay--error" role="alert">
          <h3>{state === 'unsupported' ? '当前环境不支持 WebGL 渲染' : '场景加载失败'}</h3>
          <p>{message}</p>
          {detail && <pre className="error-detail">{detail}</pre>}
          <Button label="重试" onClick={() => setRevision(v=>v+1)}/>
          <p className="hint">如果问题持续，请检查浏览器的硬件加速 / WebGL 设置，并查看开发者控制台日志。</p>
        </div>
      )}
      {state === 'ready' && <div className="viewer-hint" aria-hidden="true">拖动旋转 · 滚轮缩放 · 右键倾斜</div>}
    </div>
  );
}

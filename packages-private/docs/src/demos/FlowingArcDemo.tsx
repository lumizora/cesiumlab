import { Button } from '@astryxdesign/core/Button';
import { Card } from '@astryxdesign/core/Card';
import { useEffect, useRef, useState } from 'react';
import type { mountFlowingArc } from './flowing-arc';

type Scene = Awaited<ReturnType<typeof mountFlowingArc>>;

export function FlowingArcDemo() {
  const container = useRef<HTMLDivElement>(null);
  const scene = useRef<Scene | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const host = container.current!;
    const controller = new AbortController();
    const { signal } = controller;

    async function load() {
      try {
        const { mountFlowingArc } = await import('./flowing-arc');
        signal.throwIfAborted();
        const autoplay = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        const mounted = await mountFlowingArc(host, autoplay, signal);
        if (signal.aborted) {
          mounted.destroy();
          return;
        }
        scene.current = mounted;
        setPlaying(autoplay);
        setStatus('ready');
      } catch (error) {
        if (signal.aborted) return;
        host.replaceChildren();
        setStatus('error');
        console.error(error);
      }
    }

    function dispose() {
      controller.abort();
      scene.current?.destroy();
      scene.current = null;
    }

    function onPageHide(event: PageTransitionEvent) {
      if (!event.persisted) dispose();
    }

    window.addEventListener('pagehide', onPageHide);
    void load();
    return () => {
      window.removeEventListener('pagehide', onPageHide);
      dispose();
    };
  }, []);

  function togglePlaying() {
    if (!scene.current) return;
    scene.current.setPlaying(!playing);
    setPlaying(!playing);
  }

  return (
    <section id="demo" className="mb-9" aria-labelledby="demo-title">
      <h2 id="demo-title" className="section-heading">
        实时演示
      </h2>
      <Card padding={0} className="overflow-hidden">
        <figure>
          <div className="relative h-[clamp(18rem,45svh,30rem)] bg-scene">
            <div
              ref={container}
              id="globe"
              className="h-full"
              role="region"
              aria-label="新加坡至东京的 CesiumJS 飞线场景"
            />
            {status !== 'ready' && (
              <p
                id="scene-status"
                className="absolute inset-0 grid place-items-center px-4 text-center text-sm text-slate-300"
                role="status"
              >
                {status === 'loading' ? '正在加载地球…' : '地球加载失败。请启用 WebGL 后刷新页面。'}
              </p>
            )}
          </div>
          <figcaption className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold">新加坡至东京</p>
              <p className="mt-1 text-xs text-muted">拖动旋转，滚动缩放</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                id="play"
                variant="primary"
                label={playing ? '暂停动画' : '播放动画'}
                isDisabled={status !== 'ready'}
                onClick={togglePlaying}
              />
              <Button
                id="reset"
                label="复位视角"
                isDisabled={status !== 'ready'}
                onClick={() => scene.current?.resetCamera()}
              />
            </div>
          </figcaption>
        </figure>
      </Card>
    </section>
  );
}

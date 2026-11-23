import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Viewer } from 'cesium';
import { Theme } from '@astryxdesign/core/theme';
import { Card } from '@astryxdesign/core/Card';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Text } from '@astryxdesign/core/Text';
import { themes, defaultThemeSlug } from '../astryx-themes';
import { createDocsViewer, type CreateDocsViewerOptions } from '../lib/cesium';
import { useI18n } from '../lib/i18n';

export interface CesiumStageProps extends CreateDocsViewerOptions {
  /** Accessible label for the CesiumJS canvas region. */
  label: string;
  /** Called once the Viewer is mounted; may return a cleanup callback. */
  onMount: (
    viewer: Viewer,
    signal: AbortSignal,
  ) => void | (() => void) | Promise<void | (() => void)>;
  /** Optional toolbar rendered below or above the canvas inside the stage card. */
  toolbar?: ReactNode;
}

export function CesiumStage({
  label,
  onMount,
  toolbar,
  shouldAnimate = true,
  terrain = true,
}: CesiumStageProps) {
  const { isZh } = useI18n();
  const hostRef = useRef<HTMLDivElement>(null);
  const onMountRef = useRef(onMount);
  onMountRef.current = onMount;

  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const controller = new AbortController();
    const { signal } = controller;
    let viewer: Viewer | null = null;
    let cleanupEffect: (() => void) | void;

    async function init() {
      try {
        setStatus('loading');
        viewer = await createDocsViewer(host!, signal, { shouldAnimate, terrain });
        if (signal.aborted) {
          if (!viewer.isDestroyed()) viewer.destroy();
          viewer = null;
          return;
        }
        cleanupEffect = await onMountRef.current(viewer, signal);
        if (signal.aborted) {
          cleanupEffect?.();
          if (!viewer.isDestroyed()) viewer.destroy();
          viewer = null;
          return;
        }
        setStatus('ready');
      } catch (error) {
        if (signal.aborted) return;
        console.error(error);
        host?.replaceChildren();
        setStatus('error');
      }
    }

    function dispose() {
      controller.abort();
      cleanupEffect?.();
      cleanupEffect = undefined;
      if (viewer && !viewer.isDestroyed()) {
        viewer.destroy();
      }
      viewer = null;
    }

    function handlePageHide(event: PageTransitionEvent) {
      if (!event.persisted) dispose();
    }

    window.addEventListener('pagehide', handlePageHide);
    void init();

    return () => {
      window.removeEventListener('pagehide', handlePageHide);
      dispose();
    };
  }, [shouldAnimate, terrain]);

  return (
    <Theme theme={themes[defaultThemeSlug]} mode="dark">
      <Card width="100%" padding={0} elevation="med">
        <VStack gap={0}>
          <VStack
            width="100%"
            style={{
              position: 'relative',
              height: 'clamp(22rem, 52svh, 34rem)',
              overflow: 'hidden',
            }}
          >
            <div
              ref={hostRef}
              role="region"
              aria-label={label}
              style={{ width: '100%', height: '100%' }}
            />
            {status !== 'ready' && (
              <HStack
                hAlign="center"
                vAlign="center"
                style={{
                  position: 'absolute',
                  inset: 0,
                  pointerEvents: 'none',
                }}
              >
                <Text type="body" color="secondary" role={status === 'error' ? 'alert' : 'status'}>
                  {status === 'error'
                    ? isZh
                      ? '无法初始化 CesiumJS WebGL 场景。'
                      : 'Unable to initialize CesiumJS WebGL scene.'
                    : isZh
                      ? '正在加载 CesiumJS 影像与地形...'
                      : 'Loading CesiumJS imagery & terrain...'}
                </Text>
              </HStack>
            )}
          </VStack>

          {toolbar && (
            <VStack padding={3} gap={3} width="100%">
              {toolbar}
            </VStack>
          )}
        </VStack>
      </Card>
    </Theme>
  );
}

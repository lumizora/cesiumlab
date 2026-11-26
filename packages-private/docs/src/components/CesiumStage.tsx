import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import type { Viewer } from '@cesiumlab/cesium';
import { Theme } from '@astryxdesign/core/theme';
import { Button } from '@astryxdesign/core/Button';
import { Card } from '@astryxdesign/core/Card';
import { HStack } from '@astryxdesign/core/HStack';
import { Icon } from '@astryxdesign/core/Icon';
import { IconButton } from '@astryxdesign/core/IconButton';
import { Text } from '@astryxdesign/core/Text';
import { VStack } from '@astryxdesign/core/VStack';
import { Maximize2, Minimize2, RotateCcw, SlidersHorizontal, Sparkles, X } from 'lucide-react';
import { useMediaQuery } from '@astryxdesign/core/hooks';
import { themes, defaultThemeSlug } from '../astryx-themes';
import { createDocsViewer, type CreateDocsViewerOptions } from '../lib/cesium';
import { useI18n } from '../lib/i18n';
import { EffectParamPanel, type ParamGroup } from './EffectParamPanel';

export interface CesiumStageProps extends CreateDocsViewerOptions {
  /** Accessible label for the CesiumJS canvas region. */
  label: string;
  /** Called once the Viewer is mounted; may return a cleanup callback. */
  onMount: (
    viewer: Viewer,
    signal: AbortSignal,
  ) => void | (() => void) | Promise<void | (() => void)>;
  /** Always-visible primary action buttons rendered in the floating HUD toolbar. */
  actions?: ReactNode;
  /** Declarative full-property parameter groups shown in the floating inspector panel. */
  paramGroups?: readonly ParamGroup[];
  /** Callback to restore all parameters to their initial defaults. */
  onResetParams?: () => void;
  /** Whether any parameter currently differs from its default value. */
  hasModifiedParams?: boolean;
  /** Optional custom toolbar rendered below the canvas when not using actions + paramGroups. */
  toolbar?: ReactNode;
}

const HUD_SURFACE_STYLE: CSSProperties = {
  backgroundColor: 'rgba(8, 10, 14, 0.72)',
  backdropFilter: 'blur(20px) saturate(160%)',
  WebkitBackdropFilter: 'blur(20px) saturate(160%)',
  border: '1px solid rgba(255, 255, 255, 0.12)',
  boxShadow: '0 8px 28px rgba(0, 0, 0, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.08)',
  borderRadius: 'var(--radius-container)',
  pointerEvents: 'auto',
};

function applyHdQuality(viewer: Viewer, enabled: boolean) {
  viewer.useBrowserRecommendedResolution = true;
  if (enabled) {
    viewer.resolutionScale = 1.5;
    viewer.scene.globe.maximumScreenSpaceError = 1;
  } else {
    viewer.resolutionScale = 1;
    viewer.scene.globe.maximumScreenSpaceError = 2;
  }
  viewer.resize();
}

export function CesiumStage({
  label,
  onMount,
  actions,
  paramGroups,
  onResetParams,
  hasModifiedParams = false,
  toolbar,
  shouldAnimate = true,
  terrain = true,
}: CesiumStageProps) {
  const { isZh } = useI18n();
  const isWideStage = useMediaQuery('(min-width: 640px)');
  const stageRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<Viewer | null>(null);
  const onMountRef = useRef(onMount);
  onMountRef.current = onMount;

  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [paramsOpen, setParamsOpen] = useState(false);
  const [isHd, setIsHd] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [fps, setFps] = useState<number | null>(null);
  const isHdRef = useRef(isHd);
  isHdRef.current = isHd;

  const hasParams = Boolean(paramGroups && paramGroups.length > 0);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (viewer && !viewer.isDestroyed()) {
      applyHdQuality(viewer, isHd);
    }
  }, [isHd]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(document.fullscreenElement === stageRef.current);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, []);

  const handleToggleFullscreen = () => {
    const el = stageRef.current;
    if (!el) return;
    if (document.fullscreenElement === el) {
      void document.exitFullscreen?.();
    } else {
      void el.requestFullscreen?.();
    }
  };

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const controller = new AbortController();
    const { signal } = controller;
    let viewer: Viewer | null = null;
    let cleanupEffect: (() => void) | void;
    let removeFpsListener: (() => void) | undefined;
    let fpsFrames = 0;
    let fpsLastTime = performance.now();

    const resizeObserver =
      typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(() => {
            if (viewer && !viewer.isDestroyed()) {
              viewer.resize();
            }
          })
        : null;
    resizeObserver?.observe(host);

    async function init() {
      try {
        setStatus('loading');
        viewer = await createDocsViewer(host!, signal, { shouldAnimate, terrain });
        if (signal.aborted) {
          if (!viewer.isDestroyed()) viewer.destroy();
          viewer = null;
          return;
        }
        applyHdQuality(viewer, isHdRef.current);
        viewerRef.current = viewer;
        fpsFrames = 0;
        fpsLastTime = performance.now();
        removeFpsListener = viewer.scene.postRender.addEventListener(() => {
          fpsFrames += 1;
          const now = performance.now();
          const elapsed = now - fpsLastTime;
          if (elapsed >= 500) {
            const nextFps = Math.round((fpsFrames * 1000) / elapsed);
            fpsFrames = 0;
            fpsLastTime = now;
            setFps((prev) => (prev === nextFps ? prev : nextFps));
          }
        });
        cleanupEffect = await onMountRef.current(viewer, signal);
        if (signal.aborted) {
          cleanupEffect?.();
          if (!viewer.isDestroyed()) viewer.destroy();
          viewer = null;
          viewerRef.current = null;
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
      resizeObserver?.disconnect();
      removeFpsListener?.();
      removeFpsListener = undefined;
      setFps(null);
      cleanupEffect?.();
      cleanupEffect = undefined;
      if (viewer && !viewer.isDestroyed()) {
        viewer.destroy();
      }
      viewer = null;
      viewerRef.current = null;
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
    <Card width="100%" padding={0}>
      <VStack gap={0} width="100%">
        <VStack
          ref={stageRef}
          width="100%"
          style={{
            position: 'relative',
            height: isFullscreen ? '100vh' : 'clamp(22rem, 54svh, 36rem)',
            overflow: 'hidden',
            backgroundColor: '#050608',
          }}
        >
          <div
            ref={hostRef}
            role="region"
            aria-label={label}
            style={{ width: '100%', height: '100%' }}
          />

          <Theme theme={themes[defaultThemeSlug]} mode="dark">
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

            <HStack
              hAlign="between"
              vAlign="start"
              style={{
                position: 'absolute',
                top: 'var(--spacing-3)',
                left: 'var(--spacing-3)',
                right: 'var(--spacing-3)',
                pointerEvents: 'none',
                zIndex: 2,
              }}
            >
              <HStack
                paddingInline={2}
                paddingBlock={1}
                vAlign="center"
                style={{
                  ...HUD_SURFACE_STYLE,
                  visibility: fps !== null ? 'visible' : 'hidden',
                }}
              >
                <Text
                  type="supporting"
                  size="xsm"
                  weight="semibold"
                  style={{ fontVariantNumeric: 'tabular-nums' }}
                >
                  {fps !== null ? `${fps} FPS` : '— FPS'}
                </Text>
              </HStack>

              <HStack padding={1} gap={0.5} vAlign="center" wrap="wrap" style={HUD_SURFACE_STYLE}>
                {actions}
                {actions && (
                  <span
                    aria-hidden="true"
                    style={{
                      width: '1px',
                      height: '1rem',
                      backgroundColor: 'rgba(255, 255, 255, 0.14)',
                      marginInline: 'var(--spacing-1)',
                    }}
                  />
                )}
                {hasParams && (
                  <Button
                    label={isZh ? '参数' : 'Params'}
                    variant="ghost"
                    size="sm"
                    icon={<Icon icon={SlidersHorizontal} />}
                    onClick={() => setParamsOpen((prev) => !prev)}
                    style={
                      paramsOpen ? { backgroundColor: 'rgba(255, 255, 255, 0.12)' } : undefined
                    }
                  />
                )}
                <Button
                  label={isZh ? '高清' : 'HD'}
                  variant="ghost"
                  size="sm"
                  icon={<Icon icon={Sparkles} />}
                  onClick={() => setIsHd((prev) => !prev)}
                  style={isHd ? { backgroundColor: 'rgba(255, 255, 255, 0.16)' } : undefined}
                />
                <IconButton
                  label={
                    isFullscreen
                      ? isZh
                        ? '退出全屏'
                        : 'Exit fullscreen'
                      : isZh
                        ? '全屏显示'
                        : 'Enter fullscreen'
                  }
                  icon={<Icon icon={isFullscreen ? Minimize2 : Maximize2} />}
                  variant="ghost"
                  size="sm"
                  onClick={handleToggleFullscreen}
                />
              </HStack>
            </HStack>

            {hasParams && paramsOpen && paramGroups && (
              <VStack
                gap={0}
                style={{
                  ...HUD_SURFACE_STYLE,
                  position: 'absolute',
                  zIndex: 3,
                  overflow: 'hidden',
                  ...(isWideStage
                    ? {
                        top: '3.5rem',
                        right: 'var(--spacing-3)',
                        width: '15.5rem',
                        maxHeight: 'calc(100% - 4.25rem)',
                      }
                    : {
                        left: 'var(--spacing-2)',
                        right: 'var(--spacing-2)',
                        bottom: 'var(--spacing-2)',
                        maxHeight: '54%',
                      }),
                }}
              >
                <HStack
                  paddingBlock={2}
                  paddingInline={3}
                  hAlign="between"
                  vAlign="center"
                  width="100%"
                  style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.1)' }}
                >
                  <Text type="supporting" size="xsm" weight="semibold">
                    {isZh ? '参数配置' : 'Parameters'}
                  </Text>
                  <HStack gap={1} vAlign="center">
                    {onResetParams && hasModifiedParams && (
                      <Button
                        label={isZh ? '重置' : 'Reset'}
                        variant="ghost"
                        size="sm"
                        icon={<Icon icon={RotateCcw} />}
                        onClick={onResetParams}
                      />
                    )}
                    <IconButton
                      label={isZh ? '收起参数面板' : 'Close parameter panel'}
                      icon={<Icon icon={X} />}
                      variant="ghost"
                      size="sm"
                      onClick={() => setParamsOpen(false)}
                    />
                  </HStack>
                </HStack>

                <VStack
                  padding={3}
                  gap={2}
                  width="100%"
                  style={{
                    flex: 1,
                    minHeight: 0,
                    overflowY: 'auto',
                    scrollbarWidth: 'none',
                  }}
                >
                  <EffectParamPanel groups={paramGroups} layout={isWideStage ? 'side' : 'tabs'} />
                </VStack>
              </VStack>
            )}
          </Theme>
        </VStack>

        {toolbar && (
          <VStack padding={3} gap={3} width="100%">
            {toolbar}
          </VStack>
        )}
      </VStack>
    </Card>
  );
}

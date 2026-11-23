import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Viewer } from 'cesium';
import { Button } from '@astryxdesign/core/Button';
import { Card } from '@astryxdesign/core/Card';
import { Divider } from '@astryxdesign/core/Divider';
import { HStack } from '@astryxdesign/core/HStack';
import { Icon } from '@astryxdesign/core/Icon';
import { IconButton } from '@astryxdesign/core/IconButton';
import { StackItem } from '@astryxdesign/core/Stack';
import { Text } from '@astryxdesign/core/Text';
import { VStack } from '@astryxdesign/core/VStack';
import { RotateCcw, SlidersHorizontal, X } from 'lucide-react';
import { useMediaQuery } from '@astryxdesign/core/hooks';
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
  /** Always-visible primary action buttons rendered in the compact bottom bar. */
  actions?: ReactNode;
  /** Declarative full-property parameter groups shown when the parameter panel is expanded. */
  paramGroups?: readonly ParamGroup[];
  /** Callback to restore all parameters to their initial defaults. */
  onResetParams?: () => void;
  /** Whether any parameter currently differs from its default value. */
  hasModifiedParams?: boolean;
  /** Optional custom toolbar rendered below the canvas when not using actions + paramGroups. */
  toolbar?: ReactNode;
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
  const isDesktop = useMediaQuery('(min-width: 960px)');
  const hostRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<Viewer | null>(null);
  const onMountRef = useRef(onMount);
  onMountRef.current = onMount;

  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [paramsOpen, setParamsOpen] = useState(false);

  const hasParams = Boolean(paramGroups && paramGroups.length > 0);
  const showSidePanel = hasParams && paramsOpen && isDesktop;
  const showMobilePanel = hasParams && paramsOpen && !isDesktop;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const controller = new AbortController();
    const { signal } = controller;
    let viewer: Viewer | null = null;
    let cleanupEffect: (() => void) | void;

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
        viewerRef.current = viewer;
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

  // Trigger an immediate Cesium resize when toggling the side inspector or compact mobile height.
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed()) return;
    const frameId = requestAnimationFrame(() => {
      if (!viewer.isDestroyed()) {
        viewer.resize();
      }
    });
    return () => cancelAnimationFrame(frameId);
  }, [paramsOpen, isDesktop]);

  const canvasHeight = showMobilePanel
    ? 'clamp(15rem, 38svh, 22rem)'
    : 'clamp(22rem, 52svh, 34rem)';

  return (
    <Card width="100%" padding={0}>
      <VStack gap={0} width="100%">
        <HStack gap={0} vAlign="stretch" width="100%">
          <StackItem size="fill" style={{ minWidth: 0 }}>
            <VStack
              width="100%"
              style={{
                position: 'relative',
                height: canvasHeight,
                overflow: 'hidden',
                backgroundColor: '#060708',
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
                  <Text
                    type="body"
                    color="secondary"
                    role={status === 'error' ? 'alert' : 'status'}
                  >
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
          </StackItem>

          {showSidePanel && paramGroups && (
            <VStack
              width="17.5rem"
              gap={0}
              style={{
                height: canvasHeight,
                borderInlineStart: '1px solid var(--color-border)',
                flexShrink: 0,
              }}
            >
              <HStack
                padding={3}
                hAlign="between"
                vAlign="center"
                width="100%"
                style={{ borderBottom: '1px solid var(--color-border)' }}
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
                gap={3}
                width="100%"
                style={{
                  flex: 1,
                  minHeight: 0,
                  overflowY: 'auto',
                  scrollbarWidth: 'thin',
                  scrollbarColor: 'var(--color-border-emphasized) transparent',
                }}
              >
                <EffectParamPanel groups={paramGroups} layout="side" />
              </VStack>
            </VStack>
          )}
        </HStack>

        {(actions || hasParams) && (
          <>
            <Divider />
            <HStack padding={3} gap={2} hAlign="between" vAlign="center" wrap="wrap" width="100%">
              <HStack gap={2} vAlign="center" wrap="wrap">
                {actions}
              </HStack>

              {hasParams && (
                <HStack gap={1.5} vAlign="center">
                  {showMobilePanel && onResetParams && hasModifiedParams && (
                    <Button
                      label={isZh ? '恢复默认' : 'Reset'}
                      variant="ghost"
                      size="sm"
                      icon={<Icon icon={RotateCcw} />}
                      onClick={onResetParams}
                    />
                  )}
                  <Button
                    label={isZh ? '参数' : 'Parameters'}
                    variant={paramsOpen ? 'secondary' : 'ghost'}
                    size="sm"
                    icon={<Icon icon={SlidersHorizontal} />}
                    onClick={() => setParamsOpen((prev) => !prev)}
                  />
                </HStack>
              )}
            </HStack>
          </>
        )}

        {showMobilePanel && paramGroups && (
          <>
            <Divider />
            <VStack padding={3} gap={3} width="100%">
              <EffectParamPanel groups={paramGroups} layout="tabs" />
            </VStack>
          </>
        )}

        {toolbar && (
          <VStack padding={3} gap={3} width="100%">
            {toolbar}
          </VStack>
        )}
      </VStack>
    </Card>
  );
}

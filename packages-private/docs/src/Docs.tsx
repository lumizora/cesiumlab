import { Button } from '@astryxdesign/core/Button';
import { CodeBlock } from '@astryxdesign/core/CodeBlock';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { FlowingArcDemo } from './demos/FlowingArcDemo';

const packCode = 'pnpm --filter @cesiumlab/effects build\npnpm --filter @cesiumlab/effects pack';
const installCode = 'pnpm add ./cesiumlab-effects-0.1.0.tgz cesium@1.147.0';
const usageCode = `import { createFlowingArc } from '@cesiumlab/effects';

const arc = createFlowingArc(viewer, {
  from: [103.82, 1.35],
  to: [139.69, 35.68],
  height: 430_000,
  duration: 4,
});

viewer.clock.shouldAnimate = true;`;
const cleanupCode = 'arc.destroy();';

function CopyExampleButton() {
  const [feedback, setFeedback] = useState('');
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  async function copy() {
    window.clearTimeout(timer.current);
    try {
      await navigator.clipboard.writeText(usageCode);
      setFeedback('已复制');
    } catch {
      setFeedback('复制失败，请手动选择代码');
    }
    timer.current = window.setTimeout(() => setFeedback(''), 1600);
  }

  return (
    <>
      <Button label="复制 TypeScript 示例" size="sm" variant="secondary" clickAction={copy}>
        {feedback || '复制示例'}
      </Button>
      <span className="sr-only" role="status">
        {feedback}
      </span>
    </>
  );
}

function subscribeToHash(onChange: () => void) {
  window.addEventListener('hashchange', onChange);
  return () => window.removeEventListener('hashchange', onChange);
}

export function Docs() {
  const hash = useSyncExternalStore(subscribeToHash, () => window.location.hash || '#overview');

  useEffect(() => {
    document.getElementById(window.location.hash.slice(1))?.scrollIntoView();
  }, []);

  return (
    <>
      <a href="#main" className="skip-link">
        跳到正文
      </a>
      <div className="mx-auto grid max-w-[120rem] grid-cols-1 lg:grid-cols-[16rem_minmax(0,1fr)]">
        <aside className="z-20 border-b border-line bg-panel lg:sticky lg:top-4 lg:mx-4 lg:my-4 lg:h-[calc(100svh-2rem)] lg:self-start lg:overflow-y-auto lg:rounded-2xl lg:border">
          <a
            className="flex items-center gap-3 px-5 py-4 text-base font-semibold tracking-tight"
            href="./"
            aria-label="Cesiumlab 文档首页"
          >
            <span className="brand-mark" aria-hidden="true"></span>
            Cesiumlab
            <span className="ml-auto text-xs font-medium text-muted lg:hidden">API 文档</span>
          </a>
          <nav aria-label="文档导航" className="px-3 py-2">
            <p className="mb-2 hidden px-3 text-xs font-semibold text-muted lg:block">入门指南</p>
            <ul className="flex gap-1 overflow-x-auto whitespace-nowrap lg:block">
              <li>
                <a
                  className="nav-link"
                  href="#overview"
                  aria-current={hash === '#overview' ? 'location' : undefined}
                >
                  概览
                </a>
              </li>
              <li>
                <a
                  className="nav-link"
                  href="#installation"
                  aria-current={hash === '#installation' ? 'location' : undefined}
                >
                  安装
                </a>
              </li>
              <li>
                <a
                  className="nav-link"
                  href="#usage"
                  aria-current={hash === '#usage' ? 'location' : undefined}
                >
                  快速开始
                </a>
              </li>
            </ul>
            <p className="mb-2 mt-7 hidden px-3 text-xs font-semibold text-muted lg:block">
              地球飞线
            </p>
            <ul className="flex gap-1 overflow-x-auto whitespace-nowrap lg:block">
              <li>
                <a
                  className="nav-link"
                  href="#demo"
                  aria-current={hash === '#demo' ? 'location' : undefined}
                >
                  实时演示
                </a>
              </li>
              <li>
                <a
                  className="nav-link"
                  href="#api"
                  aria-current={hash === '#api' ? 'location' : undefined}
                >
                  API 参考
                </a>
              </li>
              <li>
                <a
                  className="nav-link"
                  href="#cleanup"
                  aria-current={hash === '#cleanup' ? 'location' : undefined}
                >
                  资源清理
                </a>
              </li>
            </ul>
          </nav>
        </aside>

        <main
          id="main"
          tabIndex={-1}
          className="mx-auto w-full min-w-0 max-w-[51rem] px-5 pb-16 pt-10 sm:px-8 lg:pt-14"
        >
          <article id="doc-content" className="relative isolate">
            <div id="overview" className="mb-8">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <h1 className="min-w-0 [overflow-wrap:anywhere] text-2xl font-semibold leading-tight tracking-[-0.035em] sm:text-[2rem]">
                  @cesiumlab/effects
                </h1>
                <CopyExampleButton />
              </div>
              <p className="mt-4 max-w-[65ch] text-base leading-7 text-muted">
                为已有的 CesiumJS Viewer
                添加地球飞线。沿抬升的测地线绘制发光轨迹，并让光点随场景时钟循环移动。
              </p>
            </div>

            <FlowingArcDemo />

            <section id="installation" aria-labelledby="installation-title">
              <h2 id="installation-title" className="section-heading">
                安装
              </h2>
              <p className="doc-prose mb-3">
                需要 CesiumJS <code>1.147.x</code>。在本工作区之外使用时，先在仓库根目录构建并打包。
              </p>
              <CodeBlock
                code={packCode}
                language="bash"
                title="终端"
                hasLanguageLabel={false}
                width="100%"
              />
              <p className="doc-prose my-3">
                将生成的 tarball 放到消费项目根目录，和 Cesium 一起安装。
              </p>
              <CodeBlock
                code={installCode}
                language="bash"
                title="终端"
                hasLanguageLabel={false}
                width="100%"
              />
            </section>

            <section id="usage" className="section-space" aria-labelledby="usage-title">
              <h2 id="usage-title" className="section-heading">
                快速开始
              </h2>
              <p className="doc-prose mb-3">
                将你的 <code>Viewer</code> 和两个经纬度坐标传给 <code>createFlowingArc()</code>
                。开启 Viewer 时钟后，光点会沿线循环。
              </p>
              <CodeBlock
                code={usageCode}
                language="typescript"
                title="TypeScript"
                hasLanguageLabel={false}
                width="100%"
              />
            </section>

            <section id="api" className="section-space" aria-labelledby="api-title">
              <h2 id="api-title" className="section-heading">
                API 参考
              </h2>
              <h3 className="mb-3 font-mono text-[0.96rem] font-semibold text-accent">
                createFlowingArc(viewer, options)
              </h3>
              <p className="doc-prose mb-5">
                <code>viewer</code> 是调用方持有的 Cesium <code>Viewer</code>。函数返回一个包含
                <code>destroy(): void</code> 的对象。参数类型为 <code>FlowingArcOptions</code>。
              </p>
              <div
                className="overflow-x-auto rounded-xl border border-line"
                role="region"
                aria-label="飞线参数表"
                tabIndex={0}
              >
                <table className="w-full min-w-[32rem] text-left text-sm">
                  <thead className="border-b border-line bg-panel text-xs text-muted">
                    <tr>
                      <th scope="col">属性</th>
                      <th scope="col">类型</th>
                      <th scope="col">默认值</th>
                      <th scope="col">说明</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    <tr>
                      <th scope="row">
                        <code>from</code>
                      </th>
                      <td>
                        <code>readonly [number, number]</code>
                      </td>
                      <td>必填</td>
                      <td>起点，先经度、后纬度，单位为度。</td>
                    </tr>
                    <tr>
                      <th scope="row">
                        <code>to</code>
                      </th>
                      <td>
                        <code>readonly [number, number]</code>
                      </td>
                      <td>必填</td>
                      <td>终点，先经度、后纬度，单位为度。</td>
                    </tr>
                    <tr>
                      <th scope="row">
                        <code>height?</code>
                      </th>
                      <td>
                        <code>number</code>
                      </td>
                      <td>
                        <code>350_000</code>
                      </td>
                      <td>相对场景椭球的峰值高度，单位为米。</td>
                    </tr>
                    <tr>
                      <th scope="row">
                        <code>duration?</code>
                      </th>
                      <td>
                        <code>number</code>
                      </td>
                      <td>
                        <code>4</code>
                      </td>
                      <td>单次飞行的 Cesium 时钟秒数。</td>
                    </tr>
                    <tr>
                      <th scope="row">
                        <code>color?</code>
                      </th>
                      <td>
                        <code>Color</code>
                      </td>
                      <td>
                        <code>Color.DEEPSKYBLUE</code>
                      </td>
                      <td>飞线和光点描边的颜色。</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p className="doc-prose mt-4">
                经度范围为 −180° 至 180°，纬度范围为 −90° 至
                90°。起终点必须不同且不能接近对跖点，高度和周期必须是有限正数。飞线按椭球计算高度，经过高地形时可能被遮挡。
              </p>
            </section>

            <section id="cleanup" className="section-space" aria-labelledby="cleanup-title">
              <h2 id="cleanup-title" className="section-heading">
                资源清理
              </h2>
              <p className="doc-prose mb-3">
                离开场景时调用 <code>arc.destroy()</code>。它只移除这条飞线创建的
                Entity，也可以重复调用。Viewer 由调用方自行销毁。
              </p>
              <CodeBlock
                code={cleanupCode}
                language="typescript"
                title="TypeScript"
                hasLanguageLabel={false}
                width="100%"
              />
            </section>
          </article>

          <footer className="mt-12 flex flex-wrap items-center justify-between gap-3 border-t border-line py-5 text-xs text-muted">
            <a className="doc-link" href="https://github.com/lumizora/cesiumlab">
              GitHub
            </a>
          </footer>
        </main>
      </div>
    </>
  );
}

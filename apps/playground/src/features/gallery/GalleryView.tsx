import { useMemo, useState } from 'react';
import * as stylex from '@stylexjs/stylex';
import { Button } from '@astryxdesign/core/Button';
import { Card } from '@astryxdesign/core/Card';

import StatusBadge from '../../components/StatusBadge';
import { KIND_LABELS, MATURITY_LABELS, RUNTIME_LABELS, runtimeTone } from '../../catalog/format';
import { catalog, catalogStats } from '../../catalog/registry';
import { experimentHref } from '../../router';
import FeaturedGlobe from './FeaturedGlobe';

const sx = stylex.create({
  liveDot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    backgroundColor: 'var(--color-background-green)',
    flexShrink: 0,
  },
  displayRow: { display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' },
  filterRow: { display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' },
  cardInner: { display: 'flex', flexDirection: 'column', height: '100%' },
  statusRow: { display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' },
});

type Filter = 'all' | 'approved' | 'runnable' | 'archive';
const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: '全部实验' },
  { key: 'approved', label: '视觉已批准' },
  { key: 'runnable', label: '可运行' },
  { key: 'archive', label: '历史档案' },
];

function coverClass(id: string) {
  if (id === 'earth-network-convergence') return 'cover-network';
  if (id === 'cesium-smoke-test') return 'cover-smoke';
  return 'cover-archive';
}

function Cover({ id }: { id: string }) {
  if (id === 'earth-network-convergence') {
    return (
      <div className="cover-scene">
        <FeaturedGlobe small />
        <span className="cover-caption">7 TRACES → SHANGHAI</span>
      </div>
    );
  }
  if (id === 'cesium-smoke-test') {
    return (
      <div className="smoke-art">
        <div className="smoke-orbit" />
        <div className="smoke-orbit smoke-orbit--second" />
        <div className="smoke-cube">◇</div>
        <span>WEBGL 2.0 / VIEWER</span>
      </div>
    );
  }
  return (
    <div className="archive-art">
      <div className="archive-folder">
        VISUAL
        <br />
        REFERENCE<small>FILE_001</small>
      </div>
      <span>ARCHIVE / NOT IMPLEMENTED</span>
    </div>
  );
}

export default function GalleryView() {
  const [filter, setFilter] = useState<Filter>('all');
  const filtered = useMemo(
    () =>
      catalog.filter(({ metadata: m }) => {
        if (filter === 'approved') return m.maturity === 'visual-approved';
        if (filter === 'runnable') return m.runtimeStatus === 'runnable';
        if (filter === 'archive') return m.runtimeStatus === 'not-implemented';
        return true;
      }),
    [filter],
  );

  return (
    <div className="gallery-page">
      <section className="hero page-shell" aria-labelledby="home-heading">
        <div className="hero-copy">
          <h1 className="hero-kicker" id="home-heading">
            CesiumJS 视觉实验库
          </h1>
          <p className="eyebrow">● THE CREATIVE GEOSPATIAL PLAYGROUND — 2026</p>
          <p className="hero-title">
            <span>MAKE</span>
            <em>the earth</em>
            <span>
              MOVE
              <span className="hero-spark" aria-hidden="true">
                ✳
              </span>
            </span>
          </p>
          <p className="hero-description">
            让地球不止是地图。
            <br />
            把光、运动和空间想象力变成真实可运行的 <strong>CesiumJS 视觉实验。</strong>
          </p>
          <div className="hero-actions">
            <a
              className="y2k-action y2k-action--dark"
              href="#/"
              onClick={(event) => {
                event.preventDefault();
                document.getElementById('experiments')?.scrollIntoView({ behavior: 'smooth' });
              }}
            >
              探索特效作品 <span>↗</span>
            </a>
            <a
              className="y2k-action y2k-action--outline"
              href={experimentHref('earth-network-convergence')}
            >
              ▶ OPEN PLAYGROUND
            </a>
          </div>
          <p className="hero-footnote">✳ VISUAL FIRST. &nbsp; SHIP WHEN IT FEELS RIGHT.</p>
        </div>
        <div className="hero-visual">
          <div className="featured-window">
            <div className="window-top">
              <span>
                ✳ FEATURED EXPERIMENT <small>/ S2-001</small>
              </span>
              <span>□ □ ×</span>
            </div>
            <div className="window-scene">
              <FeaturedGlobe />
              <span className="scene-top">● MOTION CONCEPT / PREVIEW</span>
              <span className="scene-count">001 / 003</span>
              <div className="scene-title">
                <small>EXPLORE LIVE EFFECT ↗</small>
                <strong>EARTH NETWORK CONVERGENCE</strong>
                <span>7 TRACES &nbsp; → &nbsp; SHANGHAI</span>
              </div>
            </div>
            <div className="window-bottom">
              <span {...stylex.props(sx.displayRow)}>
                <i {...stylex.props(sx.liveDot)} /> VISUAL APPROVED <small>/ 08 NOV 2026</small>
              </span>
              <a href={experimentHref('earth-network-convergence')}>OPEN REAL CESIUM VIEWER ↗</a>
            </div>
          </div>
          <div className="visual-sticker">
            ✳
            <strong>
              NEW
              <br />
              DIMENSIONS
            </strong>
          </div>
        </div>
      </section>

      <div className="ticker-tape">
        <span>✳ SEE THE UNSEEN</span>
        <span>◇ BUILD THE IMPOSSIBLE</span>
        <span>✳ SEE THE UNSEEN</span>
        <span>◇ BUILD THE IMPOSSIBLE</span>
      </div>

      <section className="lab-section page-shell" id="experiments">
        <header className="section-heading">
          <div>
            <p className="eyebrow">▣ EXPERIMENT INDEX / 002</p>
            <h2>
              THE <em>experiments</em>
              <span aria-hidden="true">✳</span>
            </h2>
            <p>可以运行的特效、验证工具与历史档案，状态公开透明。</p>
          </div>
          <div className="index-stamp">
            <strong>{String(catalogStats.total).padStart(2, '0')}</strong>
            <span>REGISTERED</span>
          </div>
        </header>
        <aside className="notice" role="note">
          <strong>S2-001 已通过用户视觉验收。</strong>
          <p>
            Earth Network Convergence 已通过视觉验收；Smoke Test
            仍是工程验证，历史档案不提供运行场景。
          </p>
        </aside>
        <div className="stats" aria-label="实验统计">
          <div className="stat">
            <strong className="stat-value">{catalogStats.total}</strong>
            <span>已登记实验</span>
          </div>
          <div className="stat">
            <strong className="stat-value">{catalogStats.runnable}</strong>
            <span>可运行</span>
          </div>
          <div className="stat">
            <strong className="stat-value">{catalogStats.visualApproved}</strong>
            <span>Visual Approved</span>
          </div>
        </div>
        <div className="filters" {...stylex.props(sx.filterRow)} aria-label="筛选实验">
          {FILTERS.map(({ key, label }) => (
            <Button
              key={key}
              type="button"
              variant={filter === key ? 'primary' : 'secondary'}
              label={label}
              onClick={() => setFilter(key)}
            />
          ))}
        </div>
        <div className="experiment-grid">
          {filtered.map(({ metadata: m }) => (
            <article
              key={m.id}
              className="experiment-card"
              data-testid="experiment-card"
              data-runtime={m.runtimeStatus}
              data-maturity={m.maturity}
            >
              <Card padding={0} elevation="none">
                <div {...stylex.props(sx.cardInner)}>
                  <div className={'card-cover ' + coverClass(m.id)}>
                    <span className="card-number">
                      EXP /{' '}
                      {String(catalog.findIndex((e) => e.metadata.id === m.id) + 1).padStart(
                        3,
                        '0',
                      )}
                    </span>
                    <Cover id={m.id} />
                    <span className="card-arrow" aria-hidden="true">
                      ↗
                    </span>
                  </div>
                  <div className="card-body">
                    <div {...stylex.props(sx.statusRow)}>
                      <StatusBadge label={KIND_LABELS[m.kind]} tone="info" />
                      <StatusBadge
                        label={RUNTIME_LABELS[m.runtimeStatus]}
                        tone={runtimeTone(m.runtimeStatus)}
                      />
                    </div>
                    <h3>{m.title}</h3>
                    <p className="card-summary">{m.summary}</p>
                    <div className="card-tags">
                      {m.tags.slice(0, 3).map((t) => (
                        <span key={t}>{t}</span>
                      ))}
                    </div>
                    <div className="card-bottom">
                      <span>{MATURITY_LABELS[m.maturity]}</span>
                      <a href={experimentHref(m.id)} aria-label={'查看 ' + m.title + ' 详情'}>
                        {m.maturity === 'visual-approved' ? '查看已批准 Showcase' : '查看详情'} ↗
                      </a>
                    </div>
                  </div>
                </div>
              </Card>
            </article>
          ))}
        </div>
        {filtered.length === 0 && <p className="empty-state">这个筛选条件下暂无实验。</p>}
        <p className="registry-note">
          当前所有已登记档案均在上方展示；只有手工注册的可运行实验才能加载真实 CesiumJS Viewer。
        </p>
      </section>

      <section className="process-section" id="process">
        <div className="page-shell">
          <p className="eyebrow">THE WAY WE CREATE / 003</p>
          <h2>
            FROM <em>vision</em>
            <br />
            TO <span>reality.</span>
          </h2>
          <p className="process-lede">
            从一个视觉参考出发，先还原，再验证；通过视觉验收后才考虑封装与发布。
          </p>
          <div className="steps">
            {[
              ['01', '视觉参考', '图片 / 视频 / 动画描述'],
              ['02', 'AI 实现', 'CesiumJS / TypeScript / GLSL'],
              ['03', '视觉验收', '浏览器截图与效果比对'],
              ['04', '可复用封装', '仅在明确批准后推进'],
            ].map(([number, title, description]) => (
              <Card key={number} padding={4} elevation="none">
                <div className="step">
                  <strong>{number} ✳</strong>
                  <h3>{title}</h3>
                  <p>{description}</p>
                </div>
              </Card>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

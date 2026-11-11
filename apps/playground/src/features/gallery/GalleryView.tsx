import { useMemo, useState } from 'react';
import * as stylex from '@stylexjs/stylex';
import { Button } from '@astryxdesign/core/Button';
import { Card } from '@astryxdesign/core/Card';

import StatusBadge from '../../components/StatusBadge';
import { MATURITY_LABELS, RUNTIME_LABELS, runtimeTone } from '../../catalog/format';
import { catalog } from '../../catalog/registry';
import { experimentHref } from '../../router';
import FeaturedGlobe from './FeaturedGlobe';

const sx = stylex.create({
  cardInner: { display: 'flex', flexDirection: 'column', height: '100%' },
  filters: { display: 'flex', gap: '8px', flexWrap: 'wrap' },
  statuses: { display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' },
});

type Filter = 'all' | 'runnable' | 'archive';
const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'runnable', label: '可运行' },
  { key: 'archive', label: '档案' },
];

function Cover({ id }: { id: string }) {
  if (id === 'earth-network-convergence') {
    return (
      <div className="cover-scene">
        <FeaturedGlobe small />
      </div>
    );
  }
  if (id === 'cesium-smoke-test') {
    return (
      <div className="smoke-art">
        <div className="smoke-orbit" />
        <div className="smoke-orbit smoke-orbit--second" />
        <div className="smoke-cube">◇</div>
      </div>
    );
  }
  return (
    <div className="archive-art">
      <div className="archive-folder">
        视觉
        <br />
        参考
      </div>
    </div>
  );
}

export default function GalleryView() {
  const [filter, setFilter] = useState<Filter>('all');
  const filtered = useMemo(
    () =>
      catalog.filter(({ metadata }) =>
        filter === 'all'
          ? true
          : filter === 'runnable'
            ? metadata.runtimeStatus === 'runnable'
            : metadata.runtimeStatus !== 'runnable',
      ),
    [filter],
  );

  return (
    <div className="gallery-page gallery-page--compact">
      <section className="hero page-shell" aria-labelledby="home-heading">
        <div className="hero-copy">
          <h1 id="home-heading">CesiumJS 视觉实验库</h1>
          <p className="hero-title">
            让地球<span>动起来。</span>
          </p>
          <p className="hero-description">探索基于 CesiumJS 的空间视觉特效。</p>
          <a
            className="y2k-action y2k-action--dark"
            href="#/"
            onClick={(event) => {
              event.preventDefault();
              document.getElementById('experiments')?.scrollIntoView({ behavior: 'smooth' });
            }}
          >
            浏览实验 ↗
          </a>
        </div>
        <div className="hero-visual">
          <div className="featured-window">
            <div className="window-top">
              <span>精选实验 · S2-001</span>
              <span>✳</span>
            </div>
            <div className="window-scene">
              <FeaturedGlobe />
              <span className="scene-top">效果示意 · 非实时画面</span>
            </div>
            <div className="window-bottom">
              <strong>地球网络汇聚</strong>
              <a href={experimentHref('earth-network-convergence')}>查看实时效果 ↗</a>
            </div>
          </div>
        </div>
      </section>

      <section className="lab-section page-shell" id="experiments">
        <header className="section-heading">
          <div>
            <h2>特效实验</h2>
            <p>共 {catalog.length} 项 · 持续更新</p>
          </div>
          <div {...stylex.props(sx.filters)} aria-label="筛选实验">
            {FILTERS.map(({ key, label }) => (
              <Button
                key={key}
                type="button"
                size="sm"
                variant={filter === key ? 'primary' : 'secondary'}
                label={label}
                onClick={() => setFilter(key)}
              />
            ))}
          </div>
        </header>
        <div className="experiment-grid">
          {filtered.map(({ metadata: m }) => (
            <article
              className="experiment-card"
              data-testid="experiment-card"
              data-runtime={m.runtimeStatus}
              data-maturity={m.maturity}
              key={m.id}
            >
              <Card padding={0} elevation="none">
                <div {...stylex.props(sx.cardInner)}>
                  <a
                    className="card-cover"
                    href={experimentHref(m.id)}
                    aria-label={'查看 ' + m.title + ' 详情'}
                  >
                    <Cover id={m.id} />
                    <span className="card-arrow" aria-hidden="true">
                      ↗
                    </span>
                  </a>
                  <div className="card-body">
                    <div {...stylex.props(sx.statuses)}>
                      <StatusBadge
                        label={RUNTIME_LABELS[m.runtimeStatus]}
                        tone={runtimeTone(m.runtimeStatus)}
                      />
                      {m.maturity === 'visual-approved' && (
                        <StatusBadge label={MATURITY_LABELS[m.maturity]} tone="ok" />
                      )}
                    </div>
                    <h3>{m.title}</h3>
                    <p className="card-summary">{m.summary}</p>
                    {m.maturity === 'visual-approved' && (
                      <p className="card-approved-note">S2-001 已通过用户视觉验收。</p>
                    )}
                    <a className="card-link" href={experimentHref(m.id)}>
                      查看详情 ↗
                    </a>
                  </div>
                </div>
              </Card>
            </article>
          ))}
        </div>
        {filtered.length === 0 && <p className="empty-state">暂无符合条件的实验。</p>}
      </section>
    </div>
  );
}

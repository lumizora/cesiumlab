import { Card } from '@astryxdesign/core/Card';

import StatusBadge from '../../components/StatusBadge';
import {
  KIND_LABELS,
  MATURITY_LABELS,
  REFERENCE_LABELS,
  RUNTIME_LABELS,
  runtimeTone,
} from '../../catalog/format';
import { getExperiment } from '../../catalog/registry';
import type { RuntimeStatus } from '../../catalog/types';
import ViewerHost from '../viewer/ViewerHost';

function runtimeExplanation(status: RuntimeStatus): string {
  switch (status) {
    case 'not-implemented':
      return '该实验尚未实现运行入口，仅保留公开档案。收到视觉参考并完成实现后，才会注册可运行场景。';
    case 'unavailable':
      return '该实验此前登记为可运行，但当前入口不可用或检查未通过。档案保留，运行状态如实展示。';
    case 'error':
      return '最近一次运行检查报告错误。请查看验证记录与已知限制；修复前不会提供运行入口。';
    case 'runnable':
      return '元数据声明可运行，但 Playground 尚未注册运行入口。这属于登记配置问题。';
  }
}

function referenceNote(visibility: 'public' | 'private' | 'none') {
  if (visibility === 'public') return '参考素材可公开查看。';
  if (visibility === 'private') return '参考素材不公开；本页不提供原文件。';
  return '当前没有参考素材。';
}

export default function ExperimentDetailView({experimentId}: {experimentId: string}) {
  const entry = getExperiment(experimentId);

  return (
    <div className="page detail-page" data-testid="experiment-detail">
      <a className="back-link" href="#/">← 返回 Gallery</a>
      {!entry ? (
        <section className="not-found" role="alert">
          <p className="eyebrow">NOT FOUND</p><h1>找不到实验</h1>
          <p>没有登记 ID 为 <code>{experimentId}</code> 的实验。它可能尚未登记，或链接写错了。</p>
          <a className="button" href="#/">回到 Gallery</a>
        </section>
      ) : (
        <>
          <header className="detail-header">
            <p className="eyebrow">VISUAL ARCHIVE / EXPERIMENT DETAILS</p>
            <div className="card-badges">
              <StatusBadge label={KIND_LABELS[entry.metadata.kind]} tone="info"/>
              <StatusBadge label={RUNTIME_LABELS[entry.metadata.runtimeStatus]} tone={runtimeTone(entry.metadata.runtimeStatus)}/>
              <StatusBadge label={MATURITY_LABELS[entry.metadata.maturity]} tone="muted"/>
            </div>
            <h1>{entry.metadata.title}</h1>
            <p className="hero-lede">{entry.metadata.summary}</p>
          </header>

          {entry.metadata.runtimeStatus === 'runnable' && entry.load ? (
            <section className="viewer-section" aria-labelledby="live-scene-heading">
              <div className="section-heading"><div><h2 id="live-scene-heading">Live scene</h2><p>实际 CesiumJS WebGL 输出 · 不是截图或 AI 概念图</p></div></div>
              <ViewerHost key={entry.metadata.id} experimentId={entry.metadata.id}/>
            </section>
          ) : (
            <section className="empty-scene" aria-labelledby="no-scene-heading">
              <StatusBadge label={RUNTIME_LABELS[entry.metadata.runtimeStatus]} tone={runtimeTone(entry.metadata.runtimeStatus)}/>
              <h2 id="no-scene-heading">该实验暂无运行场景</h2>
              <p>{runtimeExplanation(entry.metadata.runtimeStatus)}</p>
            </section>
          )}

          <section className="notes" aria-labelledby="notes-heading">
            <div className="section-heading"><div><h2 id="notes-heading">实现说明</h2><p>面向非程序员的简明说明；更完整的工程记录见实验目录中的 README。</p></div></div>
            <div className="notes-grid">
              {([['它做了什么',entry.metadata.notes.overview],['技术路线',entry.metadata.notes.technology],['已知限制',entry.metadata.notes.limitations]] as const).map(([label,value])=>(
                <Card key={label} padding={4} elevation="none"><div className="note-card"><h3>{label}</h3><p>{value}</p></div></Card>
              ))}
            </div>
          </section>

          <section className="detail-meta" aria-labelledby="meta-heading">
            <div className="section-heading"><div><h2 id="meta-heading">档案与验证</h2><p>运行状态是元数据声明；验证记录是最近一次实际本地检查的结果，两者分开阅读。</p></div></div>
            <dl className="metadata-grid">
              {[
                ['实验 ID', entry.metadata.id],
                ['成熟度', MATURITY_LABELS[entry.metadata.maturity]],
                ['运行状态', RUNTIME_LABELS[entry.metadata.runtimeStatus]],
                ['参考可见性', REFERENCE_LABELS[entry.metadata.referenceVisibility]],
                ['构建 revision', __GIT_REVISION__],
                ['运行入口', entry.metadata.entry ?? '未注册'],
              ].map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
            </dl>
            <div className={'verification-note'+(entry.metadata.verification ? '' : ' verification-note--pending')}>
              {entry.metadata.verification ? (
                <><strong>本地验证记录</strong><p>最近一次检查：{entry.metadata.verification.checkedAt} · {entry.metadata.verification.environment}</p><p>证据位置：<code>{entry.metadata.verification.evidence}</code></p></>
              ) : (
                <><strong>尚未记录验证证据</strong><p>当前运行状态来自元数据声明，不能视为已经通过浏览器或视觉检查。</p></>
              )}
            </div>
            <p className="reference-note">{referenceNote(entry.metadata.referenceVisibility)}</p>
          </section>
          <a className="back-link back-link--bottom" href="#/">← 返回 Gallery</a>
        </>
      )}
    </div>
  );
}

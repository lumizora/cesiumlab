import type { MouseEvent } from 'react';

import type { Route } from '../router';

export default function AppHeader({ route }: { route: Route }) {
  function jumpTo(id: string) {
    return (event: MouseEvent<HTMLAnchorElement>) => {
      if (route.name === 'gallery') {
        event.preventDefault();
        document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
      }
    };
  }

  return (
    <>
      <div className="announcement" aria-label="项目公告">
        <span aria-hidden="true">✳</span> AN OPEN VISUAL EXPERIMENT LAB
        <span className="announcement-divider">//</span> BUILT WITH CESIUMJS + CURIOSITY
        <span className="announcement-divider">//</span> VISUAL FIRST
      </div>
      <header className="site-header">
        <a className="brand" href="#/" aria-label="cesiumlab 首页">
          <span className="brand-symbol" aria-hidden="true">◎</span>
          <span>cesium<span className="brand-light">lab</span><b className="brand-dot">.</b></span>
        </a>
        <nav className="site-nav" aria-label="主导航">
          <a href="#/" aria-current={route.name === 'gallery' ? 'page' : undefined}>首页 <small>01</small></a>
          <a href="#/" onClick={jumpTo('experiments')}>特效实验 <small>02</small></a>
          <a href="#/" onClick={jumpTo('process')}>创作流程 <small>03</small></a>
        </nav>
        <a className="header-cta" href="https://github.com/lumizora/cesiumlab" target="_blank" rel="noopener noreferrer">
          GITHUB <span aria-hidden="true">↗</span>
        </a>
      </header>
    </>
  );
}

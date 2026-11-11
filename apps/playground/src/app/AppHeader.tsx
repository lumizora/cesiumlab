import type { MouseEvent } from 'react';

import type { Route } from '../router';

export default function AppHeader({ route }: { route: Route }) {
  function browseExperiments(event: MouseEvent<HTMLAnchorElement>) {
    if (route.name === 'gallery') {
      event.preventDefault();
      document.getElementById('experiments')?.scrollIntoView({ behavior: 'smooth' });
    }
  }

  return (
    <header className="site-header">
      <a className="brand" href="#/" aria-label="cesiumlab 首页">
        <span className="brand-symbol" aria-hidden="true">◎</span>
        <span>cesium<span className="brand-light">lab</span><b className="brand-dot">.</b></span>
      </a>
      <nav className="site-nav" aria-label="主导航">
        <a href="#/" aria-current={route.name === 'gallery' ? 'page' : undefined}>首页</a>
        <a href="#/" onClick={browseExperiments}>实验</a>
      </nav>
      <a className="header-cta" href="https://github.com/lumizora/cesiumlab" target="_blank" rel="noopener noreferrer">
        GitHub ↗
      </a>
    </header>
  );
}

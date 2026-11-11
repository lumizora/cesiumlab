import { Component, type ReactNode } from 'react';

import AppFooter from './app/AppFooter';
import AppHeader from './app/AppHeader';
import ExperimentDetailView from './features/detail/ExperimentDetailView';
import GalleryView from './features/gallery/GalleryView';
import NotFoundView from './features/not-found/NotFoundView';
import { useHashRoute } from './router';

class ViewErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error('[cesiumlab] Unhandled UI error.', error);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <section className="page fatal-error" role="alert">
        <p className="eyebrow">UI ERROR</p>
        <h1>页面组件发生未处理错误</h1>
        <p>导航仍可用；你也可以重新加载页面恢复初始状态。</p>
        <pre className="error-detail">{this.state.error.message}</pre>
        <div className="fatal-actions">
          <a className="button" href="#/">
            回到 Gallery
          </a>
          <button
            className="button button--ghost"
            type="button"
            onClick={() => window.location.reload()}
          >
            重新加载页面
          </button>
        </div>
      </section>
    );
  }
}

export default function App() {
  const { route } = useHashRoute();
  const routeKey = route.name === 'experiment' ? route.name + route.id : route.name;

  return (
    <>
      <a className="skip-link" href="#main">
        跳到主要内容
      </a>
      <div className="app-shell">
        <AppHeader route={route} />
        <main id="main" tabIndex={-1}>
          <ViewErrorBoundary key={routeKey}>
            {route.name === 'gallery' ? (
              <GalleryView />
            ) : route.name === 'experiment' ? (
              <ExperimentDetailView experimentId={route.id} />
            ) : (
              <NotFoundView path={route.path} />
            )}
          </ViewErrorBoundary>
        </main>
        <AppFooter />
      </div>
    </>
  );
}

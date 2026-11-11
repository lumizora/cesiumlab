import { useEffect, useState } from 'react';

export type Route =
  { name: 'gallery' } | { name: 'experiment'; id: string } | { name: 'not-found'; path: string };

export function parseRoute(hash: string): Route {
  const raw = hash.startsWith('#') ? hash.slice(1) : hash;
  const path = (raw.split('?')[0] ?? '').replace(/\/+$/, '') || '/';

  if (path === '/') return { name: 'gallery' };

  const match = /^\/experiments\/([^/]+)$/.exec(path);
  if (match?.[1]) {
    try {
      return { name: 'experiment', id: decodeURIComponent(match[1]) };
    } catch {
      return { name: 'not-found', path };
    }
  }
  return { name: 'not-found', path };
}

export function experimentHref(id: string): string {
  return '#/experiments/' + encodeURIComponent(id);
}

export function useHashRoute(): { route: Route } {
  const [route, setRoute] = useState<Route>(() => parseRoute(window.location.hash));
  useEffect(() => {
    const sync = () => setRoute(parseRoute(window.location.hash));
    window.addEventListener('hashchange', sync);
    sync();
    return () => window.removeEventListener('hashchange', sync);
  }, []);
  return { route };
}

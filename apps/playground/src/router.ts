import { onMounted, onUnmounted, ref } from 'vue';

export type Route =
  { name: 'gallery' } | { name: 'experiment'; id: string } | { name: 'not-found'; path: string };

export function parseRoute(hash: string): Route {
  const raw = hash.startsWith('#') ? hash.slice(1) : hash;
  const path = (raw.split('?')[0] ?? '').replace(/\/+$/, '') || '/';

  if (path === '/') {
    return { name: 'gallery' };
  }

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
  return `#/experiments/${encodeURIComponent(id)}`;
}

export function useHashRoute() {
  const route = ref<Route>(parseRoute(window.location.hash));

  const sync = () => {
    route.value = parseRoute(window.location.hash);
  };

  onMounted(() => {
    sync();
    window.addEventListener('hashchange', sync);
  });

  onUnmounted(() => {
    window.removeEventListener('hashchange', sync);
  });

  return { route };
}

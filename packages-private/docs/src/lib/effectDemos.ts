import type { ComponentType } from 'react';

export interface EffectDemoMeta {
  /** Unique slug / identifier (e.g. 'flowing-arc'). */
  id: string;
  /** Display title shown in the sidebar and page header. */
  title: string;
  /** Sidebar section name (e.g. 'Visual Effects'). */
  section: string;
  /** Short summary shown in search results or previews. */
  description: string;
  /** Optional "new" indicator dot in the sidebar. */
  isNew?: boolean;
  /** Optional sort order within its section. */
  order?: number;
}

export interface EffectDemoModule {
  meta: EffectDemoMeta;
  default: ComponentType;
}

export interface EffectDemoEntry {
  meta: EffectDemoMeta;
  Component: ComponentType;
  filePath: string;
}

const modules = import.meta.glob<EffectDemoModule>(
  '../../../../packages/*/src/*/demos/*.demo.tsx',
  { eager: true },
);

export const EFFECT_DEMOS: EffectDemoEntry[] = Object.entries(modules)
  .map(([filePath, mod]) => ({
    meta: mod.meta,
    Component: mod.default,
    filePath,
  }))
  .sort((a, b) => {
    const orderDiff = (a.meta.order ?? 999) - (b.meta.order ?? 999);
    return orderDiff !== 0 ? orderDiff : a.meta.title.localeCompare(b.meta.title);
  });

const demoByName = new Map<string, EffectDemoEntry>();
for (const entry of EFFECT_DEMOS) {
  demoByName.set(entry.meta.title, entry);
  demoByName.set(entry.meta.id, entry);
}

export function getEffectDemo(nameOrId: string): EffectDemoEntry | undefined {
  return demoByName.get(nameOrId);
}

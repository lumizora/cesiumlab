import { EFFECT_DEMOS } from '../lib/effectDemos';

export interface NavItem {
  name: string;
  path: string;
  isNew?: boolean;
}

export interface NavGroup {
  section: string;
  count?: number;
  items: NavItem[];
}

function buildNavItems(): NavGroup[] {
  const groups: NavGroup[] = [
    {
      section: 'Getting Started',
      items: [
        { name: 'Introduction', path: '/docs/introduction' },
        { name: 'Installation', path: '/docs/installation' },
      ],
    },
  ];

  const effectGroups = new Map<string, NavGroup>();
  for (const demo of EFFECT_DEMOS) {
    let group = effectGroups.get(demo.meta.section);
    if (!group) {
      group = { section: demo.meta.section, count: 0, items: [] };
      effectGroups.set(demo.meta.section, group);
      groups.push(group);
    }
    group.items.push({
      name: demo.meta.title,
      path: `/docs/${demo.meta.id}`,
      isNew: demo.meta.isNew,
    });
    group.count = group.items.length;
  }

  return groups;
}

export const NAV_ITEMS: NavGroup[] = buildNavItems();

export const DEFAULT_DOC_PATH: string = EFFECT_DEMOS[0]
  ? `/docs/${EFFECT_DEMOS[0].meta.id}`
  : '/docs/introduction';

export interface SearchEntry {
  name: string;
  category: string;
  path: string;
  isNew?: boolean;
}

export const SEARCH_ITEMS: SearchEntry[] = [
  { name: 'Introduction', category: 'Getting Started', path: '/docs/introduction' },
  { name: 'Installation', category: 'Getting Started', path: '/docs/installation' },
  ...EFFECT_DEMOS.map((demo) => ({
    name: demo.meta.title,
    category: demo.meta.section,
    path: `/docs/${demo.meta.id}`,
    isNew: demo.meta.isNew,
  })),
];

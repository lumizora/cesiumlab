// The cesiumlab theme. `astryx experimental theme editor` wrote this file once and never changes it again.
// The checked settings live in cesiumlab.settings.json and the generated cesiumlab.settings.ts;
// change them with `astryx experimental theme editor set cesiumlab ...`. Add your own changes below: they win over the settings.
import { defineTheme } from '@astryxdesign/core/theme';
import { cesiumlabSettings } from './cesiumlab.settings';

export const cesiumlabTheme = defineTheme({
  extends: cesiumlabSettings,
  name: 'cesiumlab',
  tokens: {
    // Surfaces & Backgrounds (Light / Dark)
    // body = AppShell 外壳/侧边栏底色 (#fafafa / #111112)
    // surface = 主内容画布 (#ffffff / #0a0a0a)
    // card = 画布上的卡片/代码块 (#fafafa / #111112)
    '--color-background-body': ['#fafafa', '#111112'],
    '--color-background-surface': ['#ffffff', '#0a0a0a'],
    '--color-background-card': ['#fafafa', '#111112'],
    '--color-background-popover': ['#ffffff', '#161618'],
    '--color-background-muted': ['#f3f3f4', '#1c1c1f'],
    '--color-overlay-hover': ['rgba(0, 0, 0, 0.06)', 'rgba(255, 255, 255, 0.08)'],
    '--color-overlay-pressed': ['rgba(0, 0, 0, 0.1)', 'rgba(255, 255, 255, 0.12)'],

    // Typography & Icon Colors
    '--color-text-primary': ['#111111', '#fafafa'],
    '--color-text-secondary': ['#52525b', '#a1a1aa'],
    '--color-text-disabled': ['#8e8e93', '#636369'],
    '--color-icon-primary': ['#111111', '#fafafa'],
    '--color-icon-secondary': ['#52525b', '#a1a1aa'],
    '--color-icon-disabled': ['#8e8e93', '#636369'],

    // Accents (Polarity Inversion) & Blue Indicator
    '--color-accent': ['#171717', '#fafafa'],
    '--color-on-accent': ['#ffffff', '#0a0a0a'],
    '--color-info': ['#2563eb', '#3b82f6'],
    '--color-icon-info': ['#2563eb', '#3b82f6'],
    '--color-text-info': ['#2563eb', '#3b82f6'],

    // Borders & Floating Elevation
    '--color-border': ['#e5e5e7', '#222225'],
    '--color-border-emphasized': ['#d4d4d8', '#3f3f46'],
    '--shadow-low':
      '0 2px 10px light-dark(rgba(0, 0, 0, 0.03), rgba(0, 0, 0, 0.5)), 0 1px 2px light-dark(rgba(0, 0, 0, 0.04), rgba(255, 255, 255, 0.05))',
    '--shadow-med':
      '0 4px 20px light-dark(rgba(0, 0, 0, 0.04), rgba(0, 0, 0, 0.5)), 0 0 0 1px light-dark(rgba(0, 0, 0, 0.04), rgba(255, 255, 255, 0.05))',

    // Border Radius Scale (6px / 8px / 12px / 16px)
    '--radius-inner': '6px',
    '--radius-element': '8px',
    '--radius-container': '12px',
    '--radius-page': '16px',

    // Font Families
    '--font-family-body': '"Geist", "Inter", -apple-system, BlinkMacSystemFont, sans-serif',
    '--font-family-heading': '"Geist", "Inter", -apple-system, BlinkMacSystemFont, sans-serif',
    '--font-family-code': '"Geist Mono", "JetBrains Mono", ui-monospace, monospace',

    // Typography Scale & Weight Ceiling (<= 600)
    '--font-weight-bold': '600',
    '--text-heading-1-size': '1.75rem',
    '--text-heading-1-leading': '1.2',
    '--text-heading-1-weight': '600',
    '--text-heading-2-size': '1.125rem',
    '--text-heading-2-leading': '1.35',
    '--text-heading-2-weight': '600',
    '--text-body-size': '0.875rem',
    '--text-body-leading': '1.6',
    '--text-body-weight': '400',
    '--text-code-size': '0.8125rem',
    '--text-code-leading': '1.65',
    '--text-code-weight': '400',
    '--text-label-size': '0.75rem',
    '--text-label-leading': '1.35',
    '--text-label-weight': '500',
    '--text-supporting-size': '0.75rem',
    '--text-supporting-leading': '1.35',
  },
  localTokens: {
    '--effect-blaze-glow':
      'linear-gradient(0deg, light-dark(rgba(248, 201, 168, 0.65), rgba(234, 88, 12, 0.24)) 0%, light-dark(rgba(253, 232, 215, 0.35), rgba(249, 115, 22, 0.08)) 45%, transparent 100%)',
  },
  components: {
    'app-shell-header': {
      base: {
        backgroundColor: 'transparent',
        backgroundImage:
          'linear-gradient(180deg, light-dark(rgba(255, 255, 255, 0.78), rgba(10, 10, 10, 0.78)) 0%, light-dark(rgba(255, 255, 255, 0.38), rgba(10, 10, 10, 0.38)) 100%)',
        backdropFilter: 'blur(20px) saturate(190%)',
        WebkitBackdropFilter: 'blur(20px) saturate(190%)',
        borderBottom: 'none',
        boxShadow: 'inset 0 -0.5px 0 light-dark(rgba(0, 0, 0, 0.05), rgba(255, 255, 255, 0.08))',
      },
    },
    'top-nav': {
      base: {
        backgroundColor: 'transparent',
      },
    },
    button: {
      base: {
        borderRadius: '0.625rem',
      },
    },
    heading: {
      'level:1': {
        letterSpacing: '-0.025em',
      },
      'level:2': {
        letterSpacing: '-0.015em',
      },
    },
    'side-nav-section': {
      base: {
        paddingTop: '0.5rem',
        paddingBottom: '0.5rem',
      },
    },
    'side-nav-item': {
      base: {
        borderRadius: '0.5rem',
      },
      'size:sm': {
        paddingInline: '12px',
      },
      selected: {
        backgroundColor: 'light-dark(#eaeaeb, #242427)',
      },
    },
    'status-dot': {
      'variant:accent': {
        backgroundColor: 'light-dark(#2563eb, #3b82f6)',
      },
    },
  },
});

// The cesiumlab theme. `astryx experimental theme editor` wrote this file once and never changes it again.
// The checked settings live in cesiumlab.settings.json and the generated cesiumlab.settings.ts;
// change them with `astryx experimental theme editor set cesiumlab ...`. Add your own changes below: they win over the settings.
import { defineTheme } from '@astryxdesign/core/theme';
import { cesiumlabSettings } from './cesiumlab.settings';

const FILM_GRAIN_TEXTURE =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200' viewBox='0 0 200 200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.82' numOctaves='3' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3CfeComponentTransfer%3E%3CfeFuncR type='linear' slope='2.8' intercept='-0.9'/%3E%3CfeFuncG type='linear' slope='2.8' intercept='-0.9'/%3E%3CfeFuncB type='linear' slope='2.8' intercept='-0.9'/%3E%3C/feComponentTransfer%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.22'/%3E%3C/svg%3E\")";

export const cesiumlabTheme = defineTheme({
  extends: cesiumlabSettings,
  name: 'cesiumlab',
  tokens: {
    // Matte Tactical Obsidian (Dark) / Archival Paper Gray (Light)
    '--color-background-body': ['#f4f4f5', '#060708'],
    '--color-background-surface': ['#f4f4f5', '#060708'],
    '--color-background-card': ['#ffffff', '#0b0c0e'],
    '--color-background-popover': ['#ffffff', '#0e1013'],
    '--color-background-muted': ['#eaeaec', '#121417'],
    '--color-overlay-hover': ['rgba(9, 9, 11, 0.05)', 'rgba(255, 255, 255, 0.06)'],
    '--color-overlay-pressed': ['rgba(9, 9, 11, 0.1)', 'rgba(255, 255, 255, 0.12)'],

    // High-Contrast Monochrome Typography & Icons
    '--color-text-primary': ['#09090b', '#f4f4f5'],
    '--color-text-secondary': ['#52525b', '#8e9299'],
    '--color-text-disabled': ['#a1a1aa', '#52525b'],
    '--color-icon-primary': ['#09090b', '#f4f4f5'],
    '--color-icon-secondary': ['#52525b', '#8e9299'],
    '--color-icon-disabled': ['#a1a1aa', '#52525b'],

    // Stark Polarity Accent (White button on obsidian / Black button on paper)
    '--color-accent': ['#09090b', '#f4f4f5'],
    '--color-on-accent': ['#ffffff', '#060708'],
    '--color-info': ['#0284c7', '#38bdf8'],
    '--color-icon-info': ['#0284c7', '#38bdf8'],
    '--color-text-info': ['#0284c7', '#38bdf8'],

    // Crisp 1px Structural Hairlines & Flat Elevation
    '--color-border': ['rgba(9, 9, 11, 0.12)', 'rgba(255, 255, 255, 0.12)'],
    '--color-border-emphasized': ['rgba(9, 9, 11, 0.24)', 'rgba(255, 255, 255, 0.26)'],
    '--shadow-low': 'none',
    '--shadow-med': 'none',

    // Sharp Industrial / Architectural Corners
    '--radius-inner': '0px',
    '--radius-element': '2px',
    '--radius-container': '2px',
    '--radius-page': '2px',

    // Font Families
    '--font-family-body':
      '"MiSans", "MiSans VF", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    '--font-family-heading':
      '"MiSans", "MiSans VF", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    '--font-family-code': 'ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace',

    // Typography Scale & Weight Ceiling (<= 600)
    '--font-weight-bold': '600',
    '--text-heading-1-size': '1.875rem',
    '--text-heading-1-leading': '1.2',
    '--text-heading-1-weight': '600',
    '--text-heading-2-size': '1.125rem',
    '--text-heading-2-leading': '1.35',
    '--text-heading-2-weight': '600',
    '--text-body-size': '0.875rem',
    '--text-body-leading': '1.65',
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
    '--effect-blaze-glow': 'none',
    '--effect-film-grain': FILM_GRAIN_TEXTURE,
  },
  components: {
    'app-shell': {
      base: {
        backgroundImage: FILM_GRAIN_TEXTURE,
        backgroundRepeat: 'repeat',
        backgroundSize: '200px 200px',
      },
      'variant:surface': {
        backgroundImage: FILM_GRAIN_TEXTURE,
        backgroundRepeat: 'repeat',
        backgroundSize: '200px 200px',
      },
    },
    'app-shell-sidenav': {
      base: {
        backgroundColor: 'transparent',
        backgroundImage: FILM_GRAIN_TEXTURE,
        backgroundRepeat: 'repeat',
        backgroundSize: '200px 200px',
      },
    },
    'app-shell-header': {
      base: {
        backgroundColor: 'light-dark(rgba(244, 244, 245, 0.78), rgba(6, 7, 8, 0.76))',
        backdropFilter: 'blur(14px)',
        WebkitBackdropFilter: 'blur(14px)',
        borderBottom: '1px solid light-dark(rgba(9, 9, 11, 0.12), rgba(255, 255, 255, 0.12))',
        boxShadow: 'none',
      },
    },
    'top-nav': {
      base: {
        backgroundColor: 'transparent',
      },
    },
    'top-nav-heading': {
      base: {
        letterSpacing: '0.06em',
      },
    },
    'top-nav-item': {
      base: {
        fontSize: '0.8125rem',
        letterSpacing: '0.04em',
      },
    },
    'side-nav': {
      base: {
        backgroundColor: 'light-dark(rgba(244, 244, 245, 0.72), rgba(6, 7, 8, 0.72))',
        borderRight: '1px solid light-dark(rgba(9, 9, 11, 0.1), rgba(255, 255, 255, 0.1))',
      },
    },
    card: {
      base: {
        backgroundColor: 'light-dark(rgba(255, 255, 255, 0.72), rgba(11, 12, 14, 0.72))',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        borderStyle: 'solid',
        borderWidth: '1px',
        borderColor: 'light-dark(rgba(9, 9, 11, 0.12), rgba(255, 255, 255, 0.12))',
        borderRadius: '2px',
        boxShadow: 'none',
      },
    },
    dialog: {
      base: {
        backgroundColor: 'light-dark(#ffffff, #0c0d10)',
        borderStyle: 'solid',
        borderWidth: '1px',
        borderColor: 'light-dark(rgba(9, 9, 11, 0.16), rgba(255, 255, 255, 0.16))',
        borderRadius: '2px',
        boxShadow: 'none',
      },
    },
    popover: {
      base: {
        backgroundColor: 'light-dark(#ffffff, #0c0d10)',
        borderStyle: 'solid',
        borderWidth: '1px',
        borderColor: 'light-dark(rgba(9, 9, 11, 0.16), rgba(255, 255, 255, 0.16))',
        borderRadius: '2px',
        boxShadow: 'none',
      },
    },
    drawer: {
      base: {
        backgroundColor: 'light-dark(#f4f4f5, #060708)',
        borderStyle: 'solid',
        borderWidth: '1px',
        borderColor: 'light-dark(rgba(9, 9, 11, 0.12), rgba(255, 255, 255, 0.12))',
        boxShadow: 'none',
      },
    },
    'dropdown-menu': {
      base: {
        backgroundColor: 'light-dark(#ffffff, #0c0d10)',
        borderStyle: 'solid',
        borderWidth: '1px',
        borderColor: 'light-dark(rgba(9, 9, 11, 0.16), rgba(255, 255, 255, 0.16))',
        borderRadius: '2px',
        boxShadow: 'none',
      },
    },
    button: {
      base: {
        borderRadius: '2px',
      },
      'variant:secondary': {
        backgroundColor: 'light-dark(rgba(9, 9, 11, 0.04), rgba(255, 255, 255, 0.05))',
        border: '1px solid light-dark(rgba(9, 9, 11, 0.14), rgba(255, 255, 255, 0.14))',
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
        borderRadius: '2px',
      },
      'size:sm': {
        paddingInline: '12px',
      },
      selected: {
        backgroundColor: 'light-dark(rgba(9, 9, 11, 0.08), rgba(255, 255, 255, 0.09))',
      },
    },
    'status-dot': {
      'variant:accent': {
        backgroundColor: 'light-dark(#0284c7, #38bdf8)',
      },
    },
    code: {
      base: {
        fontFamily: 'var(--font-family-body)',
      },
    },
    text: {
      'type:code': {
        fontFamily: 'var(--font-family-body)',
      },
    },
  },
});

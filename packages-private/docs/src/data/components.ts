export interface NavItem {
  name: string;
  isNew?: boolean;
}

export interface NavGroup {
  section: string;
  count?: number;
  items: NavItem[];
}

export interface ApiProperty extends Record<string, unknown> {
  property: string;
  type: string;
  defaultValue: string;
  description: string;
}

export interface ComponentDoc {
  title: string;
  description: string;
  installCmd: string;
  dependencies: string[];
  codeSnippet: string;
  apiReference: ApiProperty[];
}

export const NAV_ITEMS: NavGroup[] = [
  {
    section: 'Getting Started',
    items: [
      { name: 'Introduction' },
      { name: 'Installation' },
      { name: 'Rendering Pipeline' },
      { name: 'React Wrapper' },
    ],
  },
  {
    section: 'Visual Effects',
    count: 18,
    items: [
      { name: 'Volumetric Clouds', isNew: true },
      { name: 'Atmospheric Scattering' },
      { name: 'Weather System', isNew: true },
      { name: 'Ocean Water' },
      { name: 'Sci-Fi Scanline' },
    ],
  },
  {
    section: 'Post Processing',
    count: 9,
    items: [{ name: 'Bloom' }, { name: 'Depth of Field' }, { name: 'Color Grading' }],
  },
];

export interface SearchEntry {
  name: string;
  category: string;
  isNew?: boolean;
  targetDoc?: string;
}

export const SEARCH_ITEMS: SearchEntry[] = [
  {
    name: 'Volumetric Clouds',
    category: 'Visual Effects',
    isNew: true,
    targetDoc: 'Volumetric Clouds',
  },
  {
    name: 'Atmospheric Scattering',
    category: 'Visual Effects',
    targetDoc: 'Atmospheric Scattering',
  },
  { name: 'Weather System', category: 'Visual Effects', isNew: true, targetDoc: 'Weather System' },
  { name: 'Ocean Water', category: 'Visual Effects', targetDoc: 'Ocean Water' },
  { name: 'Sci-Fi Scanline', category: 'Visual Effects', targetDoc: 'Sci-Fi Scanline' },
  { name: 'Bloom', category: 'Post Processing', targetDoc: 'Bloom' },
  { name: 'Depth of Field', category: 'Post Processing', targetDoc: 'Depth of Field' },
  { name: 'Color Grading', category: 'Post Processing', targetDoc: 'Color Grading' },
  { name: 'Bend', category: 'Live HTML', targetDoc: 'Volumetric Clouds' },
  { name: 'Displacement', category: 'Live HTML', isNew: true, targetDoc: 'Volumetric Clouds' },
  { name: 'Force Field', category: 'Live HTML', isNew: true, targetDoc: 'Volumetric Clouds' },
  { name: 'Liquid', category: 'Live HTML', targetDoc: 'Ocean Water' },
  { name: 'Universal', category: 'Live HTML', targetDoc: 'Introduction' },
  { name: 'Glass Object', category: 'Live HTML', targetDoc: 'Volumetric Clouds' },
];

export const DEFAULT_CODE_SNIPPET = `const scale = window.visualViewport?.scale || 1;
const requested = Math.min(window.devicePixelRatio || 1, 2) * scale;
const width = Math.max(element.clientWidth, 1);
const height = Math.max(element.clientHeight, 1);
let maxDimension = 8192;
if (context) {
  let limit = canvasDimensionLimits.get(context);
  if (limit === undefined) {
    limit = Math.min(
      maxDimension,
      context.getParameter(context.MAX_TEXTURE_SIZE),
      context.getParameter(context.MAX_RENDERBUFFER_SIZE),
    );
    canvasDimensionLimits.set(context, limit);
  }
  maxDimension = limit;
}
return Math.min(
  requested,
  maxDimension / Math.max(width, height),
);`;

export const COMPONENT_DOCS: Record<string, ComponentDoc> = {
  'Volumetric Clouds': {
    title: 'Volumetric Clouds',
    description:
      'A high-performance ray-marched volumetric cloud system for CesiumJS. Features dynamic weather patterns, self-shadowing, and atmospheric scattering integration.',
    installCmd: 'npx @cesium-ui/cli add clouds-volumetric',
    dependencies: ['npm install three@0.160.0', 'npm install @types/three -D'],
    codeSnippet: DEFAULT_CODE_SNIPPET,
    apiReference: [
      {
        property: 'radius',
        type: 'number',
        defaultValue: '0.4',
        description: 'Radius of the ascii lens around the cursor, relative to the screen height.',
      },
      {
        property: 'softness',
        type: 'number',
        defaultValue: '1',
        description: 'Edge feather of the lens as a fraction of the radius (0 to 1).',
      },
    ],
  },
  'Atmospheric Scattering': {
    title: 'Atmospheric Scattering',
    description:
      'Physically based Rayleigh and Mie atmospheric scattering post-process stage calibrated for orbital-to-ground camera transitions in CesiumJS.',
    installCmd: 'npx @cesium-ui/cli add atmospheric-scattering',
    dependencies: ['npm install three@0.160.0', 'npm install @types/three -D'],
    codeSnippet: DEFAULT_CODE_SNIPPET,
    apiReference: [
      {
        property: 'rayleighScale',
        type: 'number',
        defaultValue: '1.2',
        description: 'Multiplier controlling Rayleigh scattering intensity across the horizon.',
      },
      {
        property: 'mieAnisotropy',
        type: 'number',
        defaultValue: '0.76',
        description: 'Phase function anisotropy factor for forward solar scattering (-1 to 1).',
      },
    ],
  },
  'Weather System': {
    title: 'Weather System',
    description:
      'GPU-accelerated precipitation, snow accumulation, and volumetric fog system synchronized with CesiumJS scene lighting and wind vectors.',
    installCmd: 'npx @cesium-ui/cli add weather-system',
    dependencies: ['npm install three@0.160.0', 'npm install @types/three -D'],
    codeSnippet: DEFAULT_CODE_SNIPPET,
    apiReference: [
      {
        property: 'mode',
        type: 'string',
        defaultValue: '"rain"',
        description: 'Active precipitation mode ("rain" | "snow" | "fog").',
      },
      {
        property: 'intensity',
        type: 'number',
        defaultValue: '0.7',
        description: 'Normalized density and velocity multiplier for weather particles (0 to 1).',
      },
    ],
  },
};

export function getComponentDoc(name: string): ComponentDoc {
  if (COMPONENT_DOCS[name]) {
    return COMPONENT_DOCS[name];
  }
  const slug = name.toLowerCase().replace(/\s+/g, '-');
  return {
    title: name,
    description: `A high-performance ${name.toLowerCase()} module for CesiumJS. Designed for seamless integration with custom post-processing pipelines and real-time geospatial scenes.`,
    installCmd: `npx @cesium-ui/cli add ${slug}`,
    dependencies: ['npm install three@0.160.0', 'npm install @types/three -D'],
    codeSnippet: DEFAULT_CODE_SNIPPET,
    apiReference: [
      {
        property: 'radius',
        type: 'number',
        defaultValue: '0.4',
        description: 'Radius of the ascii lens around the cursor, relative to the screen height.',
      },
      {
        property: 'softness',
        type: 'number',
        defaultValue: '1',
        description: 'Edge feather of the lens as a fraction of the radius (0 to 1).',
      },
    ],
  };
}

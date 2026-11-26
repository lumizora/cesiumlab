export {
  createCometArc,
  type CometArcHandle,
  type CometArcOptions,
  type CometArcUpdateOptions,
} from './comet-arc/index.ts';

export {
  createPulseRing,
  type PulseRingHandle,
  type PulseRingMode,
  type PulseRingOptions,
  type PulseRingUpdateOptions,
} from './pulse-ring/index.ts';

export {
  createEnergyBeam,
  type EnergyBeamHandle,
  type EnergyBeamOptions,
  type EnergyBeamUpdateOptions,
} from './energy-beam/index.ts';

export {
  createEnergyWall,
  type EnergyWallHandle,
  type EnergyWallOptions,
  type EnergyWallUpdateOptions,
} from './energy-wall/index.ts';

export {
  createRadarScan,
  type RadarScanHandle,
  type RadarScanOptions,
  type RadarScanUpdateOptions,
} from './radar-scan/index.ts';

export {
  createHoloDome,
  type HoloDomeHandle,
  type HoloDomeOptions,
  type HoloDomeUpdateOptions,
} from './holo-dome/index.ts';
export {
  createFlowPath,
  type FlowPathHandle,
  type FlowPathItem,
  type FlowPathOptions,
  type FlowPathPositions,
  type FlowPathStylePatch,
  type FlowPathUpdateOptions,
} from './flow-path/index.ts';
export {
  createHoloBeacon,
  type HoloBeaconHandle,
  type HoloBeaconOptions,
  type HoloBeaconUpdateOptions,
} from './holo-beacon/index.ts';
export {
  createWaterSurface,
  type WaterSurfaceHandle,
  type WaterSurfaceOptions,
  type WaterSurfaceUpdateOptions,
} from './water-surface/index.ts';
export {
  createWeatherOverlay,
  type WeatherMode,
  type WeatherOverlayHandle,
  type WeatherOverlayOptions,
  type WeatherOverlayUpdateOptions,
} from './weather-overlay/index.ts';
export {
  createHeatmap,
  type HeatmapBounds,
  type HeatmapHandle,
  type HeatmapOptions,
  type HeatmapPalette,
  type HeatmapPoint,
  type HeatmapUpdateOptions,
} from './heatmap/index.ts';
export {
  createWindField,
  type WindFieldBounds,
  type WindFieldGrid,
  type WindFieldHandle,
  type WindFieldOptions,
  type WindFieldPalette,
  type WindFieldPreset,
  type WindFieldUpdateOptions,
} from './wind-field/index.ts';
export {
  createPulseScatter,
  type PulseScatterHandle,
  type PulseScatterOptions,
  type PulseScatterPoint,
  type PulseScatterStyle,
  type PulseScatterUpdateOptions,
} from './pulse-scatter/index.ts';
export {
  createTerrainAnalysis,
  type TerrainAnalysisHandle,
  type TerrainAnalysisMode,
  type TerrainAnalysisOptions,
  type TerrainAnalysisUpdateOptions,
} from './terrain-analysis/index.ts';
export {
  createWorldScan,
  type WorldScanHandle,
  type WorldScanMode,
  type WorldScanOptions,
  type WorldScanUpdateOptions,
} from './world-scan/index.ts';
export {
  createHexPrism,
  type HexPrismHandle,
  type HexPrismOptions,
  type HexPrismPalette,
  type HexPrismPoint,
  type HexPrismShape,
  type HexPrismUpdateOptions,
} from './hex-prism/index.ts';
export {
  createBuildingStyle,
  type BuildingStyleHandle,
  type BuildingStyleOptions,
  type BuildingStylePreset,
  type BuildingStyleTarget,
  type BuildingStyleUpdateOptions,
} from './building-style/index.ts';
export {
  createViewshed,
  type ViewshedHandle,
  type ViewshedOptions,
  type ViewshedUpdateOptions,
} from './viewshed/index.ts';

export type { EffectBaseOptions, EffectHandle } from './shared/effect.ts';
export type { ColorInput, LngLat } from './shared/geo.ts';

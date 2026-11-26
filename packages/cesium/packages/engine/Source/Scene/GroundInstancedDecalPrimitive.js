import {
  BoundingSphere,
  Cartesian3,
  Check,
  Color,
  ComponentDatatype,
  EncodedCartesian3,
  IndexDatatype,
  PrimitiveType,
  defined,
  destroyObject,
} from "@cesium/core";
import Buffer from "../Renderer/Buffer.js";
import BufferUsage from "../Renderer/BufferUsage.js";
import DrawCommand from "../Renderer/DrawCommand.js";
import Pass from "../Renderer/Pass.js";
import RenderState from "../Renderer/RenderState.js";
import ShaderProgram from "../Renderer/ShaderProgram.js";
import ShaderSource from "../Renderer/ShaderSource.js";
import VertexArray from "../Renderer/VertexArray.js";
import BlendingState from "./BlendingState.js";
import ClassificationType from "./ClassificationType.js";
import CullFace from "./CullFace.js";

// Unit 3D bounding box: X,Y in [-1, 1], Z in [0, 1] (bottom -> top)
const BOX_CORNERS = new Float32Array([
  -1, -1, 0, // 0
  1, -1, 0, // 1
  1, 1, 0, // 2
  -1, 1, 0, // 3
  -1, -1, 1, // 4
  1, -1, 1, // 5
  1, 1, 1, // 6
  -1, 1, 1, // 7
]);

// Outward-facing CCW triangles (rendered with CullFace.FRONT so decals stay visible when camera enters box)
const BOX_INDICES = new Uint16Array([
  0, 3, 2, 0, 2, 1, // bottom (z = 0)
  4, 5, 6, 4, 6, 7, // top (z = 1)
  0, 1, 5, 0, 5, 4, // south (y = -1)
  2, 3, 7, 2, 7, 6, // north (y = +1)
  1, 2, 6, 1, 6, 5, // east (x = +1)
  3, 0, 4, 3, 4, 7, // west (x = -1)
]);

const DECAL_VS = /* glsl */ `
in vec3 a_corner;
in vec3 a_centerHigh;
in vec3 a_centerLow;
in vec4 a_extents;
in vec4 a_color;

out vec3 v_centerEC;
out vec3 v_eastEC;
out vec3 v_northEC;
out vec3 v_upEC;
out vec4 v_extents;
out vec4 v_color;

void main() {
  vec3 upWC = normalize(a_centerHigh + a_centerLow);
  vec3 eastWC = normalize(cross(vec3(0.0, 0.0, 1.0), upWC));
  vec3 northWC = cross(upWC, eastWC);

  float radius = a_extents.x;
  float h = mix(a_extents.y, a_extents.z, a_corner.z);
  vec3 localOffsetWC = eastWC * (a_corner.x * radius)
                     + northWC * (a_corner.y * radius)
                     + upWC * h;

  vec4 centerRTE = czm_translateRelativeToEye(a_centerHigh, a_centerLow);
  vec4 worldRTE = centerRTE + vec4(localOffsetWC, 0.0);

  v_centerEC = (czm_modelViewRelativeToEye * centerRTE).xyz;
  v_eastEC = czm_viewRotation * eastWC;
  v_northEC = czm_viewRotation * northWC;
  v_upEC = czm_viewRotation * upWC;
  v_extents = a_extents;
  v_color = a_color;

  gl_Position = czm_modelViewProjectionRelativeToEye * worldRTE;
}
`;

const DECAL_FS = /* glsl */ `
in vec3 v_centerEC;
in vec3 v_eastEC;
in vec3 v_northEC;
in vec3 v_upEC;
in vec4 v_extents;
in vec4 v_color;

void main() {
  float logDepthOrDepth = czm_unpackDepth(
    texture(czm_globeDepthTexture, gl_FragCoord.xy / czm_viewport.zw)
  );
  if (logDepthOrDepth == 0.0) {
    discard;
  }

  vec4 eyeCoord = czm_windowToEyeCoordinates(gl_FragCoord.xy, logDepthOrDepth);
  vec3 pEC = eyeCoord.xyz / eyeCoord.w;
  vec3 deltaEC = pEC - v_centerEC;

  float localE = dot(deltaEC, v_eastEC) / v_extents.x;
  float localN = dot(deltaEC, v_northEC) / v_extents.x;
  float localH = dot(deltaEC, v_upEC);

  if (abs(localE) > 1.0 || abs(localN) > 1.0 || localH < v_extents.y || localH > v_extents.z) {
    discard;
  }

  czm_materialInput materialInput;
  materialInput.st = vec2(localE, localN) * 0.5 + 0.5;
  materialInput.str = vec3(v_color.a, localH, 0.0);
  materialInput.positionToEyeEC = -pEC;

  czm_material material = czm_getMaterial(materialInput);
  if (material.alpha <= 0.004) {
    discard;
  }

  vec3 baseRgb = v_color.rgb;
  vec3 hotRgb = mix(baseRgb, vec3(1.0), 0.72);
  vec3 finalRgb = baseRgb * material.emission.g + hotRgb * material.emission.r + material.diffuse;
  out_FragColor = vec4(finalRgb, material.alpha);
}
`;

const ATTRIBUTE_LOCATIONS = {
  a_corner: 0,
  a_centerHigh: 1,
  a_centerLow: 2,
  a_extents: 3,
  a_color: 4,
};

const encodedScratch = new EncodedCartesian3();

/**
 * Hardware-instanced screen-space deferred decal primitive for draping tens of thousands
 * of animated radial/planar decals onto both terrain and 3D Tiles in a single GPU draw call,
 * with zero stencil overlap artifacts and infinite zoom sharpness.
 *
 * @alias GroundInstancedDecalPrimitive
 * @constructor
 *
 * @param {object} options Object with the following properties:
 * @param {Array<object>} options.instances Array of `{ position: Cartesian3, radius: number, color?: Color, phase?: number, minHeight?: number, maxHeight?: number }`.
 * @param {Material} options.material Material whose `czm_getMaterial(materialInput)` shades each decal.
 * @param {ClassificationType} [options.classificationType=ClassificationType.BOTH] Whether to drape onto terrain only or both terrain and 3D Tiles.
 * @param {number} [options.minHeight=-200] Default lower vertical bound in metres for decal projection volumes.
 * @param {number} [options.maxHeight=4500] Default upper vertical bound in metres for decal projection volumes.
 * @param {boolean} [options.show=true] Determines if this primitive will be shown.
 */
function GroundInstancedDecalPrimitive(options) {
  //>>includeStart('debug', pragmas.debug);
  Check.defined("options", options);
  Check.defined("options.instances", options.instances);
  Check.defined("options.material", options.material);
  //>>includeEnd('debug');

  /**
   * Determines if this primitive will be shown.
   * @type {boolean}
   * @default true
   */
  this.show = options.show ?? true;
  /**
   * The material used to shade each decal instance.
   * @type {Material}
   */
  this.material = options.material;
  /**
   * Determines whether terrain, 3D Tiles, or both will be classified.
   * @type {ClassificationType}
   * @default ClassificationType.BOTH
   */
  this.classificationType =
    options.classificationType ?? ClassificationType.BOTH;
  this._defaultMinHeight = options.minHeight ?? -200.0;
  this._defaultMaxHeight = options.maxHeight ?? 4500.0;

  this._instances = options.instances;
  this._instanceCount = options.instances.length;
  this._dirtyBuffers = true;

  this._boxVertexBuffer = undefined;
  this._boxIndexBuffer = undefined;
  this._instanceGeomBuffer = undefined;
  this._instanceColorBuffer = undefined;
  this._vertexArray = undefined;
  this._shaderProgram = undefined;
  this._renderState = undefined;
  this._drawCommand = undefined;
  this._boundingSphere = undefined;
}

/**
 * Replaces the instanced decal data and marks GPU instance buffers for upload on the next frame.
 *
 * @param {Array<object>} instances New array of decal instances.
 */
GroundInstancedDecalPrimitive.prototype.setInstances = function (instances) {
  this._instances = instances;
  this._instanceCount = instances.length;
  this._dirtyBuffers = true;
};

GroundInstancedDecalPrimitive.prototype._rebuildInstanceBuffers = function (
  context,
) {
  this._dirtyBuffers = false;

  if (defined(this._vertexArray) && !this._vertexArray.isDestroyed()) {
    this._vertexArray = this._vertexArray.destroy();
  }
  this._vertexArray = undefined;
  // VertexArray.destroy() owns and destroys its attached vertex/index buffers.
  if (defined(this._instanceGeomBuffer) && !this._instanceGeomBuffer.isDestroyed()) {
    this._instanceGeomBuffer.destroy();
  }
  this._instanceGeomBuffer = undefined;
  if (defined(this._instanceColorBuffer) && !this._instanceColorBuffer.isDestroyed()) {
    this._instanceColorBuffer.destroy();
  }
  this._instanceColorBuffer = undefined;
  if (defined(this._boxVertexBuffer) && this._boxVertexBuffer.isDestroyed()) {
    this._boxVertexBuffer = undefined;
  }
  if (defined(this._boxIndexBuffer) && this._boxIndexBuffer.isDestroyed()) {
    this._boxIndexBuffer = undefined;
  }

  const count = this._instanceCount;
  if (count === 0) {
    this._boundingSphere = undefined;
    return;
  }

  if (!defined(this._boxVertexBuffer)) {
    this._boxVertexBuffer = Buffer.createVertexBuffer({
      context: context,
      typedArray: BOX_CORNERS,
      usage: BufferUsage.STATIC_DRAW,
    });
  }
  if (!defined(this._boxIndexBuffer)) {
    this._boxIndexBuffer = Buffer.createIndexBuffer({
      context: context,
      typedArray: BOX_INDICES,
      usage: BufferUsage.STATIC_DRAW,
      indexDatatype: IndexDatatype.UNSIGNED_SHORT,
    });
  }

  const geomData = new Float32Array(count * 10);
  const colorData = new Uint8Array(count * 4);
  const pointsForBounds = new Array(count);
  let maxRadius = 0;

  for (let i = 0; i < count; ++i) {
    const inst = this._instances[i];
    const pos = inst.position;
    pointsForBounds[i] = pos;

    EncodedCartesian3.fromCartesian(pos, encodedScratch);
    const radius = inst.radius ?? 400.0;
    const minH = inst.minHeight ?? this._defaultMinHeight;
    const maxH = inst.maxHeight ?? this._defaultMaxHeight;
    const ext = Math.max(radius, Math.abs(minH), Math.abs(maxH));
    if (ext > maxRadius) {
      maxRadius = ext;
    }

    const gBase = i * 10;
    geomData[gBase] = encodedScratch.high.x;
    geomData[gBase + 1] = encodedScratch.high.y;
    geomData[gBase + 2] = encodedScratch.high.z;
    geomData[gBase + 3] = encodedScratch.low.x;
    geomData[gBase + 4] = encodedScratch.low.y;
    geomData[gBase + 5] = encodedScratch.low.z;
    geomData[gBase + 6] = radius;
    geomData[gBase + 7] = minH;
    geomData[gBase + 8] = maxH;
    geomData[gBase + 9] = 0.0;

    const c = inst.color ?? Color.CYAN;
    const phase = inst.phase ?? 0.0;
    const cBase = i * 4;
    colorData[cBase] = Math.round(c.red * 255);
    colorData[cBase + 1] = Math.round(c.green * 255);
    colorData[cBase + 2] = Math.round(c.blue * 255);
    colorData[cBase + 3] = Math.max(
      0,
      Math.min(255, Math.round((((phase % 1) + 1) % 1) * 255)),
    );
  }

  this._boundingSphere = BoundingSphere.fromPoints(pointsForBounds);
  this._boundingSphere.radius += maxRadius;

  this._instanceGeomBuffer = Buffer.createVertexBuffer({
    context: context,
    typedArray: geomData,
    usage: BufferUsage.STATIC_DRAW,
  });
  this._instanceColorBuffer = Buffer.createVertexBuffer({
    context: context,
    typedArray: colorData,
    usage: BufferUsage.STATIC_DRAW,
  });

  const stride = 10 * Float32Array.BYTES_PER_ELEMENT;
  this._vertexArray = new VertexArray({
    context: context,
    indexBuffer: this._boxIndexBuffer,
    attributes: [
      {
        index: ATTRIBUTE_LOCATIONS.a_corner,
        vertexBuffer: this._boxVertexBuffer,
        componentDatatype: ComponentDatatype.FLOAT,
        componentsPerAttribute: 3,
        instanceDivisor: 0,
      },
      {
        index: ATTRIBUTE_LOCATIONS.a_centerHigh,
        vertexBuffer: this._instanceGeomBuffer,
        componentDatatype: ComponentDatatype.FLOAT,
        componentsPerAttribute: 3,
        offsetInBytes: 0,
        strideInBytes: stride,
        instanceDivisor: 1,
      },
      {
        index: ATTRIBUTE_LOCATIONS.a_centerLow,
        vertexBuffer: this._instanceGeomBuffer,
        componentDatatype: ComponentDatatype.FLOAT,
        componentsPerAttribute: 3,
        offsetInBytes: 3 * Float32Array.BYTES_PER_ELEMENT,
        strideInBytes: stride,
        instanceDivisor: 1,
      },
      {
        index: ATTRIBUTE_LOCATIONS.a_extents,
        vertexBuffer: this._instanceGeomBuffer,
        componentDatatype: ComponentDatatype.FLOAT,
        componentsPerAttribute: 4,
        offsetInBytes: 6 * Float32Array.BYTES_PER_ELEMENT,
        strideInBytes: stride,
        instanceDivisor: 1,
      },
      {
        index: ATTRIBUTE_LOCATIONS.a_color,
        vertexBuffer: this._instanceColorBuffer,
        componentDatatype: ComponentDatatype.UNSIGNED_BYTE,
        componentsPerAttribute: 4,
        normalize: true,
        instanceDivisor: 1,
      },
    ],
  });
};

/**
 * Called by Cesium Scene during each frame render.
 * @private
 */
GroundInstancedDecalPrimitive.prototype.update = function (frameState) {
  if (!this.show || this._instanceCount === 0) {
    return;
  }

  const passes = frameState.passes;
  if (!passes.render) {
    return;
  }

  const context = frameState.context;
  if (this._dirtyBuffers) {
    this._rebuildInstanceBuffers(context);
  }
  if (!defined(this._vertexArray)) {
    return;
  }

  this.material.update(context);

  if (!defined(this._shaderProgram)) {
    this._shaderProgram = ShaderProgram.fromCache({
      context: context,
      vertexShaderSource: new ShaderSource({
        sources: [DECAL_VS],
      }),
      fragmentShaderSource: new ShaderSource({
        sources: [this.material.shaderSource, DECAL_FS],
      }),
      attributeLocations: ATTRIBUTE_LOCATIONS,
    });
  }

  if (!defined(this._renderState)) {
    this._renderState = RenderState.fromCache({
      cull: {
        enabled: true,
        face: CullFace.FRONT,
      },
      depthTest: {
        enabled: false,
      },
      depthMask: false,
      blending: BlendingState.ALPHA_BLEND,
    });
  }

  const targetPass =
    this.classificationType === ClassificationType.TERRAIN
      ? Pass.TERRAIN_CLASSIFICATION
      : Pass.OPAQUE;

  if (!defined(this._drawCommand)) {
    this._drawCommand = new DrawCommand({
      owner: this,
      primitiveType: PrimitiveType.TRIANGLES,
      count: BOX_INDICES.length,
      instanceCount: this._instanceCount,
      vertexArray: this._vertexArray,
      shaderProgram: this._shaderProgram,
      renderState: this._renderState,
      uniformMap: this.material._uniforms,
      boundingVolume: this._boundingSphere,
      pass: targetPass,
    });
  } else {
    this._drawCommand.vertexArray = this._vertexArray;
    this._drawCommand.instanceCount = this._instanceCount;
    this._drawCommand.boundingVolume = this._boundingSphere;
    this._drawCommand.uniformMap = this.material._uniforms;
    this._drawCommand.pass = targetPass;
  }

  frameState.commandList.push(this._drawCommand);
};

GroundInstancedDecalPrimitive.prototype.isDestroyed = function () {
  return false;
};

GroundInstancedDecalPrimitive.prototype.destroy = function () {
  // VertexArray.destroy() destroys its attached vertex/index buffers; guard each buffer with !isDestroyed().
  if (defined(this._vertexArray) && !this._vertexArray.isDestroyed()) {
    this._vertexArray.destroy();
  }
  this._vertexArray = undefined;
  if (defined(this._boxVertexBuffer) && !this._boxVertexBuffer.isDestroyed()) {
    this._boxVertexBuffer.destroy();
  }
  this._boxVertexBuffer = undefined;
  if (defined(this._boxIndexBuffer) && !this._boxIndexBuffer.isDestroyed()) {
    this._boxIndexBuffer.destroy();
  }
  this._boxIndexBuffer = undefined;
  if (defined(this._instanceGeomBuffer) && !this._instanceGeomBuffer.isDestroyed()) {
    this._instanceGeomBuffer.destroy();
  }
  this._instanceGeomBuffer = undefined;
  if (defined(this._instanceColorBuffer) && !this._instanceColorBuffer.isDestroyed()) {
    this._instanceColorBuffer.destroy();
  }
  this._instanceColorBuffer = undefined;
  this._shaderProgram = this._shaderProgram && this._shaderProgram.destroy();
  return destroyObject(this);
};

export default GroundInstancedDecalPrimitive;

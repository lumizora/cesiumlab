import { assert, expect, test } from 'vite-plus/test';
import { Cartesian3, Clock, Ellipsoid, EntityCollection, JulianDate, type Viewer } from 'cesium';
import { createFlowingArc, type FlowingArcOptions } from '../src/index.ts';

const options: FlowingArcOptions = { from: [103.82, 1.35], to: [139.69, 35.68], duration: 4 };

function sceneFixture(): Viewer {
  return {
    scene: { ellipsoid: Ellipsoid.WGS84 },
    entities: new EntityCollection(),
    clock: new Clock({ currentTime: JulianDate.fromIso8601('2026-01-01T00:00:00Z') }),
    isDestroyed: () => false,
  } as Viewer;
}

test('the arc moves with the Cesium clock and repeats', () => {
  const viewer = sceneFixture();
  createFlowingArc(viewer, options);
  const [{ position, polyline }] = viewer.entities.values;
  assert(position && polyline?.positions);
  const start = viewer.clock.currentTime;
  const midway = JulianDate.addSeconds(start, 2, new JulianDate());
  const restart = JulianDate.addSeconds(start, 4, new JulianDate());
  const origin = position.getValue(start);
  const midpoint = position.getValue(midway);
  assert(origin && midpoint);
  expect(polyline.positions.getValue(start)).toHaveLength(97);
  expect(Cartesian3.distance(origin, midpoint)).toBeGreaterThan(100_000);
  expect(position.getValue(restart)).toEqual(origin);
});

test('destroy removes only the effect and is safe to call repeatedly', () => {
  const viewer = sceneFixture();
  const unrelated = viewer.entities.add({ id: 'consumer-entity' });
  const first = createFlowingArc(viewer, options);
  const second = createFlowingArc(viewer, options);
  first.destroy();
  first.destroy();
  expect(viewer.entities.values).toHaveLength(2);
  second.destroy();
  expect(viewer.entities.values).toEqual([unrelated]);
});

test('invalid inputs do not add entities', () => {
  const viewer = sceneFixture();
  expect(() => createFlowingArc(viewer, { ...options, duration: 0 })).toThrow(RangeError);
  expect(() => createFlowingArc(viewer, { ...options, to: options.from })).toThrow(RangeError);
  expect(() => createFlowingArc(viewer, { ...options, from: [0, 0], to: [180, 0] })).toThrow(
    RangeError,
  );
  expect(() => createFlowingArc(viewer, { ...options, to: [181, 0] })).toThrow(RangeError);
  expect(viewer.entities.values).toHaveLength(0);
});

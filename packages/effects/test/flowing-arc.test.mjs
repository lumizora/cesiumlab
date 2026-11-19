import assert from 'node:assert/strict';
import test from 'node:test';
import { Cartesian3, Ellipsoid, EntityCollection, JulianDate } from 'cesium';
import { createFlowingArc } from '@cesiumlab/effects';

const options = { from: [103.82, 1.35], to: [139.69, 35.68], duration: 4 };

function sceneFixture() {
  return {
    scene: { ellipsoid: Ellipsoid.WGS84 },
    entities: new EntityCollection(),
    clock: { currentTime: JulianDate.fromIso8601('2026-01-01T00:00:00Z') },
    isDestroyed: () => false,
  };
}

test('the arc moves with the Cesium clock and repeats', () => {
  const viewer = sceneFixture();
  createFlowingArc(viewer, options);
  const [{ position, polyline }] = viewer.entities.values;
  const start = viewer.clock.currentTime;
  const midway = JulianDate.addSeconds(start, 2, new JulianDate());
  const restart = JulianDate.addSeconds(start, 4, new JulianDate());
  const origin = position.getValue(start);
  assert.equal(polyline.positions.getValue(start).length, 97);
  assert.ok(Cartesian3.distance(origin, position.getValue(midway)) > 100_000);
  assert.deepEqual(position.getValue(restart), origin);
});

test('destroy removes only the effect and is safe to call repeatedly', () => {
  const viewer = sceneFixture();
  const unrelated = viewer.entities.add({ id: 'consumer-entity' });
  const first = createFlowingArc(viewer, options);
  const second = createFlowingArc(viewer, options);
  first.destroy();
  first.destroy();
  assert.equal(viewer.entities.values.length, 2);
  second.destroy();
  assert.deepEqual(viewer.entities.values, [unrelated]);
});

test('invalid inputs do not add entities', () => {
  const viewer = sceneFixture();
  assert.throws(() => createFlowingArc(viewer, { ...options, duration: 0 }), RangeError);
  assert.throws(() => createFlowingArc(viewer, { ...options, to: options.from }), RangeError);
  assert.throws(() => createFlowingArc(viewer, { ...options, from: [0, 0], to: [180, 0] }), RangeError);
  assert.throws(() => createFlowingArc(viewer, { ...options, to: [181, 0] }), RangeError);
  assert.equal(viewer.entities.values.length, 0);
});

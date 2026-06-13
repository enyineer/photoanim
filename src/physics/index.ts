/**
 * Physics core barrel. Everything exported here is a deterministic,
 * side-effect-free pure function (or plain data) with no rendering,
 * three.js or DOM dependency. The render layer consumes these to drive
 * meshes and shader uniforms; the test suite exercises them directly.
 */
export * from './constants';
export * from './math';
export * from './buoyancy';
export * from './meniscus';
export * from './runoff';
export * from './wetting';
export * from './drips';
export * from './waves';
export * from './timeline';
export * from './frame';

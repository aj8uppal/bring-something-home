export const CAMERA = {
  /** North is up while playing, matching the map; the title keeps its three-quarter view. */
  defaultYaw: 0,
  titleYaw: 0.62,
  minZoom: 0.3,
  maxZoom: 1.6,
  rotationSpeed: 1.8,
  defaultPitch: 46,
  minPitch: 32,
  maxPitch: 78,
  tiltSpeed: 38,
};
export const clampPitch = (degrees: number) =>
  Number.isFinite(degrees)
    ? Math.max(CAMERA.minPitch, Math.min(CAMERA.maxPitch, degrees))
    : CAMERA.defaultPitch;
export const clampZoom = (zoom: number) => Math.max(CAMERA.minZoom, Math.min(CAMERA.maxZoom, zoom));
export const wrapYaw = (yaw: number) => Math.atan2(Math.sin(yaw), Math.cos(yaw));
export function screenMovement(x: number, z: number, yaw: number) {
  return { x: x * Math.cos(yaw) + z * Math.sin(yaw), z: -x * Math.sin(yaw) + z * Math.cos(yaw) };
}

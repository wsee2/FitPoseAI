export interface Keypoint {
  x: number;
  y: number;
  conf: number;
}

/** Reads one keypoint from a flattened MoveNet output: [y0, x0, c0, y1, x1, c1, ...] */
export function getKeypoint(keypoints: number[], index: number): Keypoint {
  return {
    x: keypoints[index * 3 + 1] ?? 0,
    y: keypoints[index * 3] ?? 0,
    conf: keypoints[index * 3 + 2] ?? 0,
  };
}

export function calculateAngle(a: Keypoint, b: Keypoint, c: Keypoint): number {
  const radians =
    Math.atan2(c.y - b.y, c.x - b.x) - Math.atan2(a.y - b.y, a.x - b.x);
  let angle = Math.abs((radians * 180) / Math.PI);
  if (angle > 180) angle = 360 - angle;
  return angle;
}

export function spineLeanAngle(shoulder: Keypoint, hip: Keypoint): number {
  const dx = shoulder.x - hip.x;
  const dy = hip.y - shoulder.y;
  return (Math.atan2(Math.abs(dx), Math.max(Math.abs(dy), 1e-6)) * 180) / Math.PI;
}

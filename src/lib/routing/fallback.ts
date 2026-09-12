import { estimateLegSeconds, type LatLng } from "../geo";
import type { Matrix } from "./solver";

/** Straight-line based matrix used when Google Maps is not configured or fails. */
export function estimateMatrix(points: LatLng[]): Matrix {
  const n = points.length;
  const seconds: number[][] = Array.from({ length: n }, () => Array(n).fill(0));
  const meters: number[][] = Array.from({ length: n }, () => Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      const e = estimateLegSeconds(points[i], points[j]);
      seconds[i][j] = e.seconds;
      meters[i][j] = e.meters;
    }
  }
  return { seconds, meters };
}

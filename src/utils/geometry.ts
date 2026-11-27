export interface Point {
  x: number;
  y: number;
}

/**
 * Calculates polygon area using the Shoelace formula (Gauss's area formula).
 * Returns area in square pixels (SVG coordinate units squared).
 */
export function calculatePolygonArea(vertices: Point[]): number {
  if (!vertices || vertices.length < 3) return 0;

  let sum = 0;
  const n = vertices.length;

  for (let i = 0; i < n; i++) {
    const current = vertices[i];
    const next = vertices[(i + 1) % n];
    sum += current.x * next.y - next.x * current.y;
  }

  return Math.abs(sum) / 2;
}

/**
 * Converts area in square pixels to square meters using calibration ratio.
 * pixelsPerMeter: number of SVG pixels per real-world meter.
 */
export function calculateAreaInSquareMeters(
  areaPx: number,
  pixelsPerMeter: number | null | undefined
): number | null {
  if (!pixelsPerMeter || pixelsPerMeter <= 0) return null;
  const areaM2 = areaPx / (pixelsPerMeter * pixelsPerMeter);
  return Math.round(areaM2 * 100) / 100;
}

/**
 * Point-in-polygon test using ray-casting algorithm.
 * Returns true if point (x, y) is inside the polygon.
 */
export function isPointInPolygon(point: Point, polygon: Point[]): boolean {
  if (!polygon || polygon.length < 3) return false;

  let inside = false;
  const { x, y } = point;
  const n = polygon.length;

  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = polygon[i].x;
    const yi = polygon[i].y;
    const xj = polygon[j].x;
    const yj = polygon[j].y;

    const intersect =
      yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;

    if (intersect) inside = !inside;
  }

  return inside;
}

/**
 * Orientation helper for line segment intersection:
 * returns 0 if collinear, 1 if clockwise, 2 if counterclockwise.
 */
function orientation(p: Point, q: Point, r: Point): number {
  const val = (q.y - p.y) * (r.x - q.x) - (q.x - p.x) * (r.y - q.y);
  if (Math.abs(val) < 1e-9) return 0;
  return val > 0 ? 1 : 2;
}

/**
 * Checks if point q lies on segment pr (assuming p, q, r are collinear).
 */
function onSegment(p: Point, q: Point, r: Point): boolean {
  return (
    q.x <= Math.max(p.x, r.x) + 1e-9 &&
    q.x >= Math.min(p.x, r.x) - 1e-9 &&
    q.y <= Math.max(p.y, r.y) + 1e-9 &&
    q.y >= Math.min(p.y, r.y) - 1e-9
  );
}

/**
 * Checks if line segment p1q1 and p2q2 intersect.
 */
function doSegmentsIntersect(p1: Point, q1: Point, p2: Point, q2: Point): boolean {
  const o1 = orientation(p1, q1, p2);
  const o2 = orientation(p1, q1, q2);
  const o3 = orientation(p2, q2, p1);
  const o4 = orientation(p2, q2, q1);

  // General case
  if (o1 !== o2 && o3 !== o4) {
    return true;
  }

  // Special Cases: collinear segments overlapping
  if (o1 === 0 && onSegment(p1, p2, q1)) return true;
  if (o2 === 0 && onSegment(p1, q2, q1)) return true;
  if (o3 === 0 && onSegment(p2, p1, q2)) return true;
  if (o4 === 0 && onSegment(p2, q1, q2)) return true;

  return false;
}

/**
 * Checks if polygon has self-intersecting edges.
 */
export function hasSelfIntersections(vertices: Point[]): boolean {
  const n = vertices.length;
  if (n < 4) return false;

  for (let i = 0; i < n; i++) {
    const p1 = vertices[i];
    const q1 = vertices[(i + 1) % n];

    // Check against all non-adjacent edges
    for (let j = i + 1; j < n; j++) {
      // Skip adjacent edges (including first & last edge sharing vertex 0)
      if (Math.abs(i - j) <= 1 || (i === 0 && j === n - 1)) {
        continue;
      }

      const p2 = vertices[j];
      const q2 = vertices[(j + 1) % n];

      if (doSegmentsIntersect(p1, q1, p2, q2)) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Attempts to repair/untangle a self-intersecting polygon by ordering
 * vertices angularly around their centroid.
 */
export function untanglePolygon(points: Point[]): Point[] {
  if (points.length < 3) return points;
  let cx = 0;
  let cy = 0;
  for (const p of points) {
    cx += p.x;
    cy += p.y;
  }
  cx /= points.length;
  cy /= points.length;

  return points.slice().sort((a, b) => {
    const angleA = Math.atan2(a.y - cy, a.x - cx);
    const angleB = Math.atan2(b.y - cy, b.x - cx);
    return angleA - angleB;
  });
}

/**
 * Validates a polygon coordinate array.
 */
export function validatePolygonCoordinates(vertices: any): {
  valid: boolean;
  error?: string;
  sanitized?: Point[];
} {
  if (!Array.isArray(vertices)) {
    return { valid: false, error: 'Polygon coordinates must be an array of points.' };
  }

  if (vertices.length < 3) {
    return { valid: false, error: 'A room polygon requires at least 3 vertices.' };
  }

  const sanitized: Point[] = [];
  for (let i = 0; i < vertices.length; i++) {
    const pt = vertices[i];
    if (
      typeof pt !== 'object' ||
      pt === null ||
      typeof pt.x !== 'number' ||
      typeof pt.y !== 'number' ||
      !Number.isFinite(pt.x) ||
      !Number.isFinite(pt.y)
    ) {
      return {
        valid: false,
        error: `Vertex at index ${i} contains invalid or non-finite coordinates.`,
      };
    }
    sanitized.push({ x: Number(pt.x), y: Number(pt.y) });
  }

  // Remove consecutive duplicates
  const deduped: Point[] = [];
  for (let i = 0; i < sanitized.length; i++) {
    const cur = sanitized[i];
    const prev = deduped[deduped.length - 1];
    if (!prev || Math.abs(cur.x - prev.x) > 1e-4 || Math.abs(cur.y - prev.y) > 1e-4) {
      deduped.push(cur);
    }
  }

  // Remove redundant closing point if first and last point are identical
  if (
    deduped.length > 3 &&
    Math.abs(deduped[0].x - deduped[deduped.length - 1].x) < 1e-4 &&
    Math.abs(deduped[0].y - deduped[deduped.length - 1].y) < 1e-4
  ) {
    deduped.pop();
  }

  if (deduped.length < 3) {
    return { valid: false, error: 'A room polygon requires at least 3 distinct vertices.' };
  }

  const area = calculatePolygonArea(deduped);
  if (area < 0.1) {
    return { valid: false, error: 'Polygon area is too small or degenerate (collinear vertices).' };
  }

  if (hasSelfIntersections(deduped)) {
    // Attempt auto-repair by sorting angularly around centroid
    const repaired = untanglePolygon(deduped);
    if (!hasSelfIntersections(repaired) && calculatePolygonArea(repaired) >= 0.1) {
      return { valid: true, sanitized: repaired };
    }
    return { valid: false, error: 'Polygon edges cannot self-intersect.' };
  }

  return { valid: true, sanitized: deduped };
}


// Client-side Miller-plane geometry for the Viewer node.
// Mirrors atomipy.miller.miller_planes: returns the polygon(s) where the
// (h,k,l) lattice plane(s) intersect the cell, as ordered Cartesian vertices.

export type Cell = { a: number; b: number; c: number; alpha: number; beta: number; gamma: number };
export type Vec3 = [number, number, number];

const VFRAC: Vec3[] = [
  [0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0],
  [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1],
];
const EDGES: [number, number][] = [
  [0, 1], [2, 3], [4, 5], [6, 7],
  [0, 2], [1, 3], [4, 6], [5, 7],
  [0, 4], [1, 5], [2, 6], [3, 7],
];

/** Parse the cell (a,b,c,α,β,γ) from a PDB CRYST1 record. Null if absent/invalid. */
export function parseCryst1(pdb: string): Cell | null {
  const m = pdb.match(/^CRYST1.*$/m);
  if (!m) return null;
  const line = m[0];
  // PDB fixed columns first; fall back to whitespace split.
  let a = parseFloat(line.slice(6, 15));
  let b = parseFloat(line.slice(15, 24));
  let c = parseFloat(line.slice(24, 33));
  let alpha = parseFloat(line.slice(33, 40));
  let beta = parseFloat(line.slice(40, 47));
  let gamma = parseFloat(line.slice(47, 54));
  const bad = (vals: number[]) => vals.some((v) => !Number.isFinite(v) || v <= 0);
  if (bad([a, b, c, alpha, beta, gamma])) {
    const p = line.trim().split(/\s+/);
    a = parseFloat(p[1]); b = parseFloat(p[2]); c = parseFloat(p[3]);
    alpha = parseFloat(p[4]); beta = parseFloat(p[5]); gamma = parseFloat(p[6]);
    if (bad([a, b, c, alpha, beta, gamma])) return null;
  }
  return { a, b, c, alpha, beta, gamma };
}

/** 3x3 fractional→Cartesian matrix (columns a, b, c). */
function fromFracMatrix(cell: Cell): number[][] {
  const d2r = Math.PI / 180;
  const al = cell.alpha * d2r, be = cell.beta * d2r, ga = cell.gamma * d2r;
  const ca = Math.cos(al), cb = Math.cos(be), cg = Math.cos(ga), sg = Math.sin(ga);
  const v = Math.sqrt(Math.max(0, 1 - ca * ca - cb * cb - cg * cg + 2 * ca * cb * cg));
  return [
    [cell.a, cell.b * cg, cell.c * cb],
    [0, cell.b * sg, cell.c * (ca - cb * cg) / sg],
    [0, 0, cell.c * v / sg],
  ];
}

function matVec(M: number[][], x: Vec3): Vec3 {
  return [
    M[0][0] * x[0] + M[0][1] * x[1] + M[0][2] * x[2],
    M[1][0] * x[0] + M[1][1] * x[1] + M[1][2] * x[2],
    M[2][0] * x[0] + M[2][1] * x[1] + M[2][2] * x[2],
  ];
}
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0],
];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a: Vec3) => Math.sqrt(dot(a, a));

/** Interplanar spacing d_hkl (Å). */
export function dSpacing(h: number, k: number, l: number, cell: Cell): number {
  const M = fromFracMatrix(cell);
  // real-space metric G = MᵀM
  const G = [0, 1, 2].map((i) => [0, 1, 2].map((j) => M[0][i] * M[0][j] + M[1][i] * M[1][j] + M[2][i] * M[2][j]));
  // inv(G) (symmetric 3x3)
  const det =
    G[0][0] * (G[1][1] * G[2][2] - G[1][2] * G[2][1]) -
    G[0][1] * (G[1][0] * G[2][2] - G[1][2] * G[2][0]) +
    G[0][2] * (G[1][0] * G[2][1] - G[1][1] * G[2][0]);
  if (Math.abs(det) < 1e-30) return Infinity;
  const inv = [
    [(G[1][1] * G[2][2] - G[1][2] * G[2][1]) / det, (G[0][2] * G[2][1] - G[0][1] * G[2][2]) / det, (G[0][1] * G[1][2] - G[0][2] * G[1][1]) / det],
    [(G[1][2] * G[2][0] - G[1][0] * G[2][2]) / det, (G[0][0] * G[2][2] - G[0][2] * G[2][0]) / det, (G[0][2] * G[1][0] - G[0][0] * G[1][2]) / det],
    [(G[1][0] * G[2][1] - G[1][1] * G[2][0]) / det, (G[0][1] * G[2][0] - G[0][0] * G[2][1]) / det, (G[0][0] * G[1][1] - G[0][1] * G[1][0]) / det],
  ];
  const hkl = [h, k, l];
  let invd2 = 0;
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) invd2 += hkl[i] * inv[i][j] * hkl[j];
  return invd2 > 0 ? 1 / Math.sqrt(invd2) : Infinity;
}

function uniqueRows(pts: Vec3[], tol = 1e-9): Vec3[] {
  const out: Vec3[] = [];
  for (const p of pts) {
    if (!out.some((o) => Math.abs(o[0] - p[0]) < tol && Math.abs(o[1] - p[1]) < tol && Math.abs(o[2] - p[2]) < tol)) {
      out.push(p);
    }
  }
  return out;
}

function intersectPolygon(M: number[][], h: number, k: number, l: number, s: number): Vec3[] | null {
  const pts: Vec3[] = [];
  for (const [e0, e1] of EDGES) {
    const v0 = VFRAC[e0], v1 = VFRAC[e1];
    const dv: Vec3 = [v1[0] - v0[0], v1[1] - v0[1], v1[2] - v0[2]];
    const denom = h * dv[0] + k * dv[1] + l * dv[2];
    if (Math.abs(denom) < 1e-14) continue;
    const t = (s - (h * v0[0] + k * v0[1] + l * v0[2])) / denom;
    if (t < -1e-12 || t > 1 + 1e-12) continue;
    const p: Vec3 = [v0[0] + t * dv[0], v0[1] + t * dv[1], v0[2] + t * dv[2]];
    if (p.every((q) => q >= -1e-12 && q <= 1 + 1e-12)) {
      pts.push([Math.min(1, Math.max(0, p[0])), Math.min(1, Math.max(0, p[1])), Math.min(1, Math.max(0, p[2]))]);
    }
  }
  const P = uniqueRows(pts);
  if (P.length < 3) return null;
  // order in-plane by angle around centroid
  const c0: Vec3 = [0, 0, 0];
  P.forEach((p) => { c0[0] += p[0]; c0[1] += p[1]; c0[2] += p[2]; });
  c0[0] /= P.length; c0[1] /= P.length; c0[2] /= P.length;
  const nvec: Vec3 = [h, k, l];
  let ref: Vec3 = [1, 0, 0];
  if (norm(cross(nvec, ref)) < 1e-12) ref = [0, 1, 0];
  if (norm(cross(nvec, ref)) < 1e-12) ref = [0, 0, 1];
  let u = cross(nvec, ref);
  const nu = norm(u);
  u = [u[0] / nu, u[1] / nu, u[2] / nu];
  let w = cross(nvec, u);
  const nw = norm(w);
  w = [w[0] / nw, w[1] / nw, w[2] / nw];
  P.sort((p, q) => {
    const ap = sub(p, c0), aq = sub(q, c0);
    return Math.atan2(dot(ap, w), dot(ap, u)) - Math.atan2(dot(aq, w), dot(aq, u));
  });
  return P.map((p) => matVec(M, p)); // fractional → Cartesian
}

export type MillerOpts = {
  singlePlane?: boolean;   // false (default) = full family of planes
  planeLevel?: number | "auto";
  offset?: number;         // shift along normal, in Å
};

/** Polygons (Cartesian vertices) where the (h,k,l) plane(s) cut the cell. */
export function millerPlanes(h: number, k: number, l: number, cell: Cell, opts: MillerOpts = {}): Vec3[][] {
  h = Math.round(h); k = Math.round(k); l = Math.round(l);
  if (h === 0 && k === 0 && l === 0) return [];
  const M = fromFracMatrix(cell);
  const offset = opts.offset || 0;
  const ds = offset ? offset / dSpacing(h, k, l, cell) : 0;
  const svals = VFRAC.map((v) => h * v[0] + k * v[1] + l * v[2]);
  const nmin = Math.ceil(Math.min(...svals) - ds);
  const nmax = Math.floor(Math.max(...svals) - ds);
  const polys: Vec3[][] = [];
  if (opts.singlePlane) {
    let levels: number[];
    if (opts.planeLevel === undefined || opts.planeLevel === "auto") {
      levels = [];
      for (let n = nmin; n <= nmax; n++) levels.push(n);
      levels.sort((p, q) => Math.abs(p - 1) - Math.abs(q - 1));
    } else {
      // Explicit fractional level (may be non-integer, e.g. the structure
      // midpoint) — use it as-is, do NOT round.
      levels = [opts.planeLevel as number];
    }
    for (const n of levels) {
      const poly = intersectPolygon(M, h, k, l, n + ds);
      if (poly) { polys.push(poly); break; }
    }
  } else {
    for (let n = nmin; n <= nmax; n++) {
      const poly = intersectPolygon(M, h, k, l, n + ds);
      if (poly) polys.push(poly);
    }
  }
  return polys;
}

/** Fan-triangulate a polygon into a 3Dmol addCustom spec (double-sided). */
export function polygonTo3Dmol(poly: Vec3[]): { vertexArr: { x: number; y: number; z: number }[]; normalArr: { x: number; y: number; z: number }[]; faceArr: number[] } {
  const vertexArr = poly.map((p) => ({ x: p[0], y: p[1], z: p[2] }));
  let n = cross(sub(poly[1], poly[0]), sub(poly[2], poly[0]));
  const nn = norm(n) || 1;
  n = [n[0] / nn, n[1] / nn, n[2] / nn];
  const normalArr = poly.map(() => ({ x: n[0], y: n[1], z: n[2] }));
  const faceArr: number[] = [];
  for (let i = 1; i < poly.length - 1; i++) {
    faceArr.push(0, i, i + 1);     // front
    faceArr.push(0, i + 1, i);     // back (so it's visible from both sides)
  }
  return { vertexArr, normalArr, faceArr };
}

/** "Auto" plane level = midpoint of the structure along the (h,k,l) normal,
 *  in fractional plane-level units — the SAME convention the Edit cut uses, so
 *  the overlay plane lands exactly where the cut would. Parses atom coordinates
 *  from a PDB string. Returns null if no atoms/cell. */
export function atomMidLevel(pdb: string, cell: Cell, h: number, k: number, l: number): number | null {
  const M = fromFracMatrix(cell);
  // invert M (3x3) to map Cartesian -> fractional
  const det =
    M[0][0] * (M[1][1] * M[2][2] - M[1][2] * M[2][1]) -
    M[0][1] * (M[1][0] * M[2][2] - M[1][2] * M[2][0]) +
    M[0][2] * (M[1][0] * M[2][1] - M[1][1] * M[2][0]);
  if (Math.abs(det) < 1e-30) return null;
  const inv = [
    [(M[1][1] * M[2][2] - M[1][2] * M[2][1]) / det, (M[0][2] * M[2][1] - M[0][1] * M[2][2]) / det, (M[0][1] * M[1][2] - M[0][2] * M[1][1]) / det],
    [(M[1][2] * M[2][0] - M[1][0] * M[2][2]) / det, (M[0][0] * M[2][2] - M[0][2] * M[2][0]) / det, (M[0][2] * M[1][0] - M[0][0] * M[1][2]) / det],
    [(M[1][0] * M[2][1] - M[1][1] * M[2][0]) / det, (M[0][1] * M[2][0] - M[0][0] * M[2][1]) / det, (M[0][0] * M[1][1] - M[0][1] * M[1][0]) / det],
  ];
  let fmin = Infinity, fmax = -Infinity, n = 0;
  for (const line of pdb.split("\n")) {
    if (!(line.startsWith("ATOM") || line.startsWith("HETATM"))) continue;
    const x = parseFloat(line.slice(30, 38)), y = parseFloat(line.slice(38, 46)), z = parseFloat(line.slice(46, 54));
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) continue;
    const xf = inv[0][0] * x + inv[0][1] * y + inv[0][2] * z;
    const yf = inv[1][0] * x + inv[1][1] * y + inv[1][2] * z;
    const zf = inv[2][0] * x + inv[2][1] * y + inv[2][2] * z;
    const f = h * xf + k * yf + l * zf;
    if (f < fmin) fmin = f;
    if (f > fmax) fmax = f;
    n++;
  }
  // No atoms, or a degenerate set (e.g. just the dummy atom for an empty box,
  // or a single atomic layer) → return null so the caller falls back to the
  // cell-based "auto" level and still draws a plane across the box.
  if (n === 0 || !(fmax > fmin + 1e-9)) return null;
  return 0.5 * (fmin + fmax);
}

function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return [245, 158, 11]; // amber fallback
  const v = parseInt(m[1], 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

/** Jmol `draw POLYGON` commands for one plane's polygons (translucent).
 *  `idPrefix` namespaces the draw IDs so multiple planes don't collide.
 *  (Caller is responsible for an initial `draw miller* delete` to clear.) */
export function jmolMillerCommands(polys: Vec3[][], hexColor: string, opacity: number, idPrefix = "miller"): string[] {
  const [r, g, b] = hexToRgb(hexColor);
  const translucent = Math.min(1, Math.max(0, 1 - opacity)); // Jmol: 0 opaque .. 1 transparent
  const cmds: string[] = [];
  polys.forEach((poly, idx) => {
    const verts = poly.map((p) => `{${p[0].toFixed(4)} ${p[1].toFixed(4)} ${p[2].toFixed(4)}}`).join(" ");
    const tris: string[] = [];
    for (let i = 1; i < poly.length - 1; i++) tris.push(`[0 ${i} ${i + 1}]`);
    const id = `${idPrefix}${idx}`;
    cmds.push(`draw ${id} POLYGON ${poly.length} ${verts} ${tris.length} ${tris.join(" ")}`);
    cmds.push(`color $${id} translucent ${translucent.toFixed(2)} [${r} ${g} ${b}]`);
  });
  return cmds;
}

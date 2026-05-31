/**
 * 3D digital Earth canvas for News (tilted axis, drag yaw, preview / design lab).
 * @module preview/dashboard-news-globe-canvas
 */

const TAU = Math.PI * 2;
const TILT = (23.4 * Math.PI) / 180;
const IDLE_DEG_PER_SEC = 4;
const DRAG_SENSITIVITY = 0.0028;
const MAX_VELOCITY = 0.45;
const FRICTION = 0.91;

/** @typedef {{ x: number, y: number, z: number, depth: number }} Vec3 */

/**
 * @param {number} latDeg
 * @param {number} lonDeg
 * @param {number} r
 * @returns {Vec3}
 */
function latLonToVec(latDeg, lonDeg, r = 1) {
  const lat = (latDeg * Math.PI) / 180;
  const lon = (lonDeg * Math.PI) / 180;
  const cl = Math.cos(lat);
  return {
    x: cl * Math.sin(lon) * r,
    y: Math.sin(lat) * r,
    z: cl * Math.cos(lon) * r,
  };
}

/**
 * @param {Vec3} v
 * @param {number} yaw
 * @returns {Vec3}
 */
function rotateYaw(v, yaw) {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  return {
    x: v.x * c + v.z * s,
    y: v.y,
    z: -v.x * s + v.z * c,
    depth: 0,
  };
}

/**
 * @param {Vec3} v
 * @returns {Vec3}
 */
function applyTilt(v) {
  const c = Math.cos(TILT);
  const s = Math.sin(TILT);
  return {
    x: v.x,
    y: v.y * c - v.z * s,
    z: v.y * s + v.z * c,
    depth: 0,
  };
}

/**
 * @param {Vec3} v
 * @param {number} cx
 * @param {number} cy
 * @param {number} radius
 * @returns {{ x: number, y: number, depth: number, visible: boolean }}
 */
function project(v, cx, cy, radius) {
  const depth = v.z;
  if (depth < -0.12) return { x: 0, y: 0, depth, visible: false };
  const persp = 1 / (1.12 - depth * 0.22);
  return {
    x: cx + v.x * radius * persp,
    y: cy - v.y * radius * persp,
    depth,
    visible: true,
  };
}

/**
 * @param {number} lat
 * @param {number} lon
 */
function inAmericas(lat, lon) {
  if (lat > 72 || lat < -56) return false;
  if (lon > -32 || lon < -132) return false;
  if (lat > 18 && lon > -88) return false;
  if (lat < -12 && lon < -78) return false;
  return true;
}

/**
 * @param {number} lat
 * @param {number} lon
 */
function inEuropeAfrica(lat, lon) {
  if (lon < -28 || lon > 52) return false;
  if (lat > 72 || lat < -36) return false;
  return true;
}

/**
 * @param {number} lat
 * @param {number} lon
 */
function inAsia(lat, lon) {
  if (lon < 42 || lon > 148) return false;
  if (lat > 68 || lat < -8) return false;
  if (lat > 22 && lon > 118 && lon < 132) return false;
  return true;
}

/**
 * @param {number} lat
 * @param {number} lon
 */
function inMiddleEast(lat, lon) {
  if (lon < 18 || lon > 62) return false;
  if (lat > 44 || lat < 8) return false;
  return true;
}

/** @param {number} lat @param {number} lon */
function isLand(lat, lon) {
  return inAmericas(lat, lon) || inEuropeAfrica(lat, lon) || inAsia(lat, lon) || inMiddleEast(lat, lon);
}

const GRID_STEP = 2.8;

/**
 * @returns {{ points: [number, number][], edges: [number, number][][] }}
 */
function buildContinentMesh() {
  const land = new Set();
  const points = [];
  const ranges = [
    { lat: [-54, 68], lon: [-128, -34] },
    { lat: [-34, 66], lon: [-18, 48] },
    { lat: [-8, 68], lon: [42, 148] },
    { lat: [8, 44], lon: [18, 62] },
  ];
  for (const { lat: [latMin, latMax], lon: [lonMin, lonMax] } of ranges) {
    for (let lat = latMin; lat <= latMax; lat += GRID_STEP) {
      for (let lon = lonMin; lon <= lonMax; lon += GRID_STEP) {
        if (!isLand(lat, lon)) continue;
        const key = `${lat.toFixed(1)},${lon.toFixed(1)}`;
        if (land.has(key)) continue;
        land.add(key);
        points.push([lat, lon]);
      }
    }
  }
  const edges = [];
  for (const key of land) {
    const [lat, lon] = key.split(",").map(Number);
    for (const [dlat, dlon] of [
      [GRID_STEP, 0],
      [0, GRID_STEP],
      [GRID_STEP, GRID_STEP],
    ]) {
      const nk = `${(lat + dlat).toFixed(1)},${(lon + dlon).toFixed(1)}`;
      if (land.has(nk)) edges.push([[lat, lon], [lat + dlat, lon + dlon]]);
    }
  }
  return { points, edges };
}

const CONTINENT_MESH = buildContinentMesh();
const CONTINENT_POINTS = CONTINENT_MESH.points;
const CONTINENT_EDGES = CONTINENT_MESH.edges;

/** @type {[number, number, number][]} */
const ORBIT_NODES = [
  [1.18, 0, 0.35],
  [-1.05, 0.42, 0.55],
  [0.2, 1.12, 0.25],
  [-0.55, -1.08, 0.4],
  [0.85, -0.75, -0.35],
  [-0.9, 0.15, -0.55],
  [0.15, 0.95, -0.75],
];

/** @type {[number, number][]} */
const NETWORK_EDGES = [
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 4],
  [4, 5],
  [5, 6],
  [6, 7],
  [7, 8],
  [8, 9],
  [9, 0],
  [0, 4],
  [1, 5],
  [2, 6],
  [3, 7],
  [4, 8],
];

/** @type {Record<string, { from: [number, number], to: [number, number] }>} */
const STORY_FLOWS = {
  inflation: { from: [38, -96], to: [48, 12] },
  europe: { from: [38, -96], to: [50, 10] },
  ai: { from: [37, -122], to: [42, -118] },
  energy: { from: [26, 48], to: [38, -96] },
};

/**
 * @param {number} lat
 * @param {number} lon
 * @param {number} yaw
 * @param {number} cx
 * @param {number} cy
 * @param {number} radius
 * @param {number} [lift]
 */
function projectLatLon(lat, lon, yaw, cx, cy, radius, lift = 1) {
  const v = applyTilt(rotateYaw(latLonToVec(lat, lon, lift), yaw));
  return project(v, cx, cy, radius);
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {[number, number]} a
 * @param {[number, number]} b
 * @param {number} yaw
 * @param {number} cx
 * @param {number} cy
 * @param {number} radius
 * @param {string} stroke
 * @param {number} width
 */
function drawFlowArc(ctx, a, b, yaw, cx, cy, radius, stroke, width) {
  const steps = 28;
  const lat1 = (a[0] * Math.PI) / 180;
  const lon1 = (a[1] * Math.PI) / 180;
  const lat2 = (b[0] * Math.PI) / 180;
  const lon2 = (b[1] * Math.PI) / 180;
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const lat = lat1 + (lat2 - lat1) * t;
    const lon = lon1 + (lon2 - lon1) * t;
    const v = applyTilt(rotateYaw(latLonToVec((lat * 180) / Math.PI, (lon * 180) / Math.PI, 1.02), yaw));
    const p = project(v, cx, cy, radius);
    if (p.visible) pts.push(p);
  }
  if (pts.length < 2) return;
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.strokeStyle = stroke;
  ctx.lineWidth = width;
  ctx.stroke();
}

/**
 * @param {HTMLCanvasElement} canvas
 */
export class NewsGlobeCanvas {
  /** @param {HTMLCanvasElement} canvas */
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.storyId = "inflation";
    this.yaw = 0;
    this.velocity = 0;
    this.orbitPhase = 0;
    this.raf = 0;
    this.lastFrame = 0;
    this.dragging = false;
    this.reduced = false;
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.resize();
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const w = Math.max(rect.width, 1);
    const h = Math.max(rect.height, 1);
    this.displaySize = Math.max(w, h);
    this.canvas.width = Math.round(w * this.dpr);
    this.canvas.height = Math.round(h * this.dpr);
    this.cx = this.canvas.width / 2;
    this.cy = this.canvas.height / 2;
    this.radius = Math.min(this.canvas.width, this.canvas.height) * 0.36;
  }

  /** @param {string} id */
  setStory(id) {
    this.storyId = id;
  }

  /** @param {number} dt */
  tick(dt) {
    if (!this.dragging) {
      if (Math.abs(this.velocity) > 0.02) {
        this.yaw += this.velocity;
        this.velocity *= Math.pow(FRICTION, dt * 60);
      } else {
        this.velocity = 0;
        if (!this.reduced) this.yaw += IDLE_DEG_PER_SEC * dt * (Math.PI / 180);
      }
    }
    this.orbitPhase += dt * 0.55;
  }

  draw() {
    const ctx = this.ctx;
    const { cx, cy, radius, yaw } = this;
    const w = this.canvas.width;
    const h = this.canvas.height;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const atmos = ctx.createRadialGradient(cx, cy, radius * 0.2, cx, cy, radius * 1.35);
    atmos.addColorStop(0, "rgba(55, 120, 200, 0.22)");
    atmos.addColorStop(0.55, "rgba(25, 55, 100, 0.08)");
    atmos.addColorStop(1, "rgba(4, 8, 16, 0)");
    ctx.fillStyle = atmos;
    ctx.fillRect(0, 0, w, h);

    const ocean = ctx.createRadialGradient(cx - radius * 0.2, cy - radius * 0.25, radius * 0.05, cx, cy, radius);
    ocean.addColorStop(0, "rgba(70, 130, 210, 0.5)");
    ocean.addColorStop(0.55, "rgba(18, 38, 72, 0.95)");
    ocean.addColorStop(1, "rgba(6, 10, 22, 0.98)");
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, TAU);
    ctx.fillStyle = ocean;
    ctx.fill();

    const shade = ctx.createRadialGradient(cx + radius * 0.35, cy, radius * 0.15, cx, cy, radius);
    shade.addColorStop(0, "rgba(0, 0, 0, 0)");
    shade.addColorStop(0.72, "rgba(0, 0, 0, 0)");
    shade.addColorStop(1, "rgba(0, 0, 0, 0.55)");
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, TAU);
    ctx.fillStyle = shade;
    ctx.fill();

    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, TAU);
    ctx.clip();

    const graticule = [];
    for (let lat = -75; lat <= 75; lat += 15) {
      const ring = [];
      for (let lon = -180; lon <= 180; lon += 6) {
        const v = applyTilt(rotateYaw(latLonToVec(lat, lon, 1), yaw));
        ring.push(project(v, cx, cy, radius));
      }
      graticule.push(ring);
    }
    const meridians = [];
    for (let lon = -180; lon < 180; lon += 18) {
      const mer = [];
      for (let lat = -90; lat <= 90; lat += 6) {
        const v = applyTilt(rotateYaw(latLonToVec(lat, lon, 1), yaw));
        mer.push(project(v, cx, cy, radius));
      }
      meridians.push(mer);
    }

    const drawPolyline = (pts, alpha, width) => {
      ctx.beginPath();
      let started = false;
      for (const p of pts) {
        if (!p.visible) {
          started = false;
          continue;
        }
        if (!started) {
          ctx.moveTo(p.x, p.y);
          started = true;
        } else ctx.lineTo(p.x, p.y);
      }
      ctx.strokeStyle = `rgba(100, 175, 255, ${alpha})`;
      ctx.lineWidth = width * this.dpr;
      ctx.stroke();
    };

    for (const ring of graticule) drawPolyline(ring, 0.08, 0.65);
    for (const mer of meridians) drawPolyline(mer, 0.07, 0.6);

    for (const [[lat1, lon1], [lat2, lon2]] of CONTINENT_EDGES) {
      const p1 = projectLatLon(lat1, lon1, yaw, cx, cy, radius, 1.008);
      const p2 = projectLatLon(lat2, lon2, yaw, cx, cy, radius, 1.008);
      if (!p1.visible || !p2.visible) continue;
      const depth = (p1.depth + p2.depth) / 2;
      if (depth < -0.2) continue;
      const alpha = depth > 0 ? 0.1 + depth * 0.28 : 0.05;
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.strokeStyle = `rgba(90, 175, 255, ${alpha})`;
      ctx.lineWidth = (depth > 0 ? 0.9 : 0.55) * this.dpr;
      ctx.stroke();
    }

    const landFront = [];
    const landBack = [];
    for (const [lat, lon] of CONTINENT_POINTS) {
      const p = projectLatLon(lat, lon, yaw, cx, cy, radius, 1.012);
      if (!p.visible) continue;
      (p.depth > 0 ? landFront : landBack).push(p);
    }

    for (const p of landBack) {
      const s = 1.1 * this.dpr;
      ctx.fillStyle = "rgba(60, 130, 200, 0.1)";
      ctx.beginPath();
      ctx.arc(p.x, p.y, s, 0, TAU);
      ctx.fill();
    }

    for (const ring of graticule) drawPolyline(ring, 0.16, 0.8);
    for (const mer of meridians) drawPolyline(mer, 0.13, 0.7);

    ctx.shadowColor = "rgba(120, 210, 255, 0.85)";
    ctx.shadowBlur = 5 * this.dpr;
    for (const [[lat1, lon1], [lat2, lon2]] of CONTINENT_EDGES) {
      const p1 = projectLatLon(lat1, lon1, yaw, cx, cy, radius, 1.015);
      const p2 = projectLatLon(lat2, lon2, yaw, cx, cy, radius, 1.015);
      if (!p1.visible || !p2.visible) continue;
      const depth = (p1.depth + p2.depth) / 2;
      if (depth < 0.08) continue;
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.strokeStyle = `rgba(150, 220, 255, ${0.22 + depth * 0.45})`;
      ctx.lineWidth = (1 + depth * 0.6) * this.dpr;
      ctx.stroke();
    }

    for (const p of landFront) {
      const s = (1.4 + p.depth * 1) * this.dpr;
      ctx.fillStyle = `rgba(130, 210, 255, ${0.28 + p.depth * 0.5})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, s, 0, TAU);
      ctx.fill();
    }
    ctx.shadowBlur = 0;

    const spec = ctx.createRadialGradient(cx - radius * 0.28, cy - radius * 0.32, 0, cx, cy, radius);
    spec.addColorStop(0, "rgba(180, 220, 255, 0.14)");
    spec.addColorStop(0.45, "rgba(80, 140, 210, 0.04)");
    spec.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = spec;
    ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);

    const flow = STORY_FLOWS[this.storyId] || STORY_FLOWS.inflation;
    ctx.shadowColor = "rgba(140, 220, 255, 0.6)";
    ctx.shadowBlur = 10 * this.dpr;
    drawFlowArc(ctx, flow.from, flow.to, yaw, cx, cy, radius, "rgba(160, 220, 255, 0.55)", 2.2 * this.dpr);
    ctx.shadowBlur = 0;

    ctx.restore();

    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, TAU);
    ctx.strokeStyle = "rgba(120, 195, 255, 0.35)";
    ctx.lineWidth = 1.4 * this.dpr;
    ctx.stroke();

    const shell = [];
    for (const [ox, oy, oz] of ORBIT_NODES) {
      const v = applyTilt(rotateYaw({ x: ox, y: oy, z: oz, depth: 0 }, yaw + this.orbitPhase * 0.15));
      shell.push(project(v, cx, cy, radius));
    }

    for (const [a, b] of NETWORK_EDGES) {
      const p1 = shell[a];
      const p2 = shell[b];
      if (!p1.visible || !p2.visible) continue;
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.strokeStyle = "rgba(90, 165, 240, 0.22)";
      ctx.lineWidth = 0.8 * this.dpr;
      ctx.setLineDash([3 * this.dpr, 5 * this.dpr]);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    for (let i = 0; i < shell.length; i++) {
      const p = shell[i];
      if (!p.visible) continue;
      const pulse = 0.65 + Math.sin(this.orbitPhase * 2 + i) * 0.35;
      ctx.shadowColor = "rgba(150, 220, 255, 0.9)";
      ctx.shadowBlur = 8 * this.dpr;
      ctx.fillStyle = `rgba(180, 230, 255, ${pulse})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, (2.2 + p.depth) * this.dpr, 0, TAU);
      ctx.fill();
    }
    ctx.shadowBlur = 0;

    for (let i = 0; i < 6; i++) {
      const angle = this.orbitPhase + (i * TAU) / 6;
      const v = applyTilt(
        rotateYaw(
          {
            x: Math.sin(angle) * 1.22,
            y: Math.sin(angle * 0.7) * 0.35,
            z: Math.cos(angle) * 1.22,
            depth: 0,
          },
          yaw
        )
      );
      const p = project(v, cx, cy, radius);
      if (!p.visible) continue;
      ctx.fillStyle = "rgba(200, 240, 255, 0.75)";
      ctx.beginPath();
      ctx.arc(p.x, p.y, 1.8 * this.dpr, 0, TAU);
      ctx.fill();
    }
  }

  start() {
    this.reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.lastFrame = performance.now();
    const loop = (now) => {
      if (!this.canvas.isConnected) return;
      const dt = Math.min(0.05, (now - this.lastFrame) / 1000);
      this.lastFrame = now;
      this.tick(dt);
      this.draw();
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  destroy() {
    cancelAnimationFrame(this.raf);
  }
}

/**
 * @param {HTMLElement} visual
 * @param {string} [storyId]
 * @returns {() => void}
 */
export function bindNewsGlobeCanvas(visual, storyId = "inflation") {
  const stage = visual.querySelector("[data-globe-stage]");
  const hit = visual.querySelector("[data-globe-hit]");
  if (!stage) {
    console.error("[news globe] canvas bind failed — no stage");
    return () => {};
  }

  const canvas = stage.querySelector(".news-globe-canvas");
  if (!canvas) {
    console.error("[news globe] canvas bind failed — no canvas");
    return () => {};
  }

  const globe = new NewsGlobeCanvas(canvas);
  globe.setStory(storyId);
  globe.start();
  visual._globeCanvas = globe;

  const target = hit || stage;
  let dragging = false;
  let pointerId = null;
  let lastX = 0;
  let lastT = 0;
  const velocitySamples = [];
  let touchAxis = null;
  let startX = 0;
  let startY = 0;

  let parallaxX = 0;
  let parallaxY = 0;
  let targetParallaxX = 0;
  let targetParallaxY = 0;

  visual.classList.add("is-interactive");
  visual.dataset.globeBound = "true";

  const pushSample = (dx, dtMs) => {
    if (dtMs <= 0) return;
    velocitySamples.push((dx * DRAG_SENSITIVITY) / (dtMs / 1000));
    if (velocitySamples.length > 6) velocitySamples.shift();
  };

  const onDown = (e) => {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    pointerId = e.pointerId;
    lastX = e.clientX;
    lastT = performance.now();
    startX = e.clientX;
    startY = e.clientY;
    touchAxis = null;
    velocitySamples.length = 0;
    if (e.pointerType !== "touch") {
      dragging = true;
      globe.dragging = true;
      globe.velocity = 0;
      visual.classList.add("is-dragging");
      target.setPointerCapture(e.pointerId);
    }
  };

  const onMove = (e) => {
    if (e.pointerId !== pointerId) return;
    if (!dragging && e.pointerType === "mouse") {
      const rect = target.getBoundingClientRect();
      targetParallaxX = ((e.clientX - rect.left) / rect.width - 0.5) * 6;
      targetParallaxY = ((e.clientY - rect.top) / rect.height - 0.5) * 5;
      parallaxX += (targetParallaxX - parallaxX) * 0.1;
      parallaxY += (targetParallaxY - parallaxY) * 0.1;
      stage.style.setProperty("--globe-px", `${parallaxX.toFixed(2)}px`);
      stage.style.setProperty("--globe-py", `${parallaxY.toFixed(2)}px`);
    }
    const dx = e.clientX - lastX;
    const now = performance.now();
    const dtMs = now - lastT;
    if (e.pointerType === "touch" && touchAxis === null) {
      const tdx = e.clientX - startX;
      const tdy = e.clientY - startY;
      if (Math.abs(tdx) > 10 || Math.abs(tdy) > 10) {
        touchAxis = Math.abs(tdx) > Math.abs(tdy) * 1.15 ? "rotate" : "scroll";
        if (touchAxis === "rotate") {
          dragging = true;
          globe.dragging = true;
          globe.velocity = 0;
          visual.classList.add("is-dragging");
          target.setPointerCapture(e.pointerId);
        } else {
          pointerId = null;
          return;
        }
      } else return;
    }
    if (!dragging) return;
    if (e.pointerType === "touch") e.preventDefault();
    pushSample(dx, dtMs);
    globe.yaw += dx * DRAG_SENSITIVITY;
    lastX = e.clientX;
    lastT = now;
  };

  const onUp = (e) => {
    if (e.pointerId !== pointerId) return;
    if (dragging) {
      if (velocitySamples.length) {
        const avg = velocitySamples.reduce((a, b) => a + b, 0) / velocitySamples.length;
        globe.velocity = Math.max(-MAX_VELOCITY, Math.min(MAX_VELOCITY, avg * 0.45));
      }
      dragging = false;
      globe.dragging = false;
      visual.classList.remove("is-dragging");
      try {
        target.releasePointerCapture(e.pointerId);
      } catch {
        /* ok */
      }
    }
    pointerId = null;
    touchAxis = null;
  };

  const onResize = () => globe.resize();
  const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(onResize) : null;
  ro?.observe(stage);

  target.addEventListener("pointerdown", onDown);
  target.addEventListener("pointermove", onMove);
  target.addEventListener("pointerup", onUp);
  target.addEventListener("pointercancel", onUp);
  window.addEventListener("resize", onResize);

  return () => {
    globe.destroy();
    delete visual._globeCanvas;
    visual.classList.remove("is-interactive", "is-dragging");
    delete visual.dataset.globeBound;
    target.removeEventListener("pointerdown", onDown);
    target.removeEventListener("pointermove", onMove);
    target.removeEventListener("pointerup", onUp);
    target.removeEventListener("pointercancel", onUp);
    window.removeEventListener("resize", onResize);
    ro?.disconnect();
    stage.style.removeProperty("--globe-px");
    stage.style.removeProperty("--globe-py");
  };
}

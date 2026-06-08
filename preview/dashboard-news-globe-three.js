/**
 * Bloomberg-style intelligence globe — Natural Earth GeoJSON on a sphere (preview / design lab).
 * @module preview/dashboard-news-globe-three
 */

const COUNTRIES_GEO_110M =
  "https://cdn.jsdelivr.net/gh/martynafford/natural-earth-geojson@master/110m/cultural/ne_110m_admin_0_countries.json";
const COUNTRIES_GEO_FALLBACK =
  "https://cdn.jsdelivr.net/npm/three-globe@2/example/country-polygons/ne_110m_admin_0_countries.geojson";

const TILT = (23.4 * Math.PI) / 180;
const DRAG_SENSITIVITY = 0.005;
/** ~3 min per full revolution at 60fps — premium idle drift */
const IDLE_ROTATION_RAD_PER_SEC = 0.035;
const GLOBE_RADIUS = 1;
const OCEAN_RADIUS = GLOBE_RADIUS * 0.998;
const GRID_RADIUS = GLOBE_RADIUS * 1.0015;
const BORDER_RADIUS = GLOBE_RADIUS * 1.0045;
const NETWORK_RADIUS = GLOBE_RADIUS * 1.007;
const ATMOS_RADIUS = GLOBE_RADIUS * 1.032;
const INITIAL_YAW = Math.PI * 0.52;

const POLYGON_ALTITUDE = 0.004;
const CURVATURE_DEG = 4;
const GRID_RESOLUTION_DEG = 3;
const BORDER_RESOLUTION_DEG = 4;
/** ~10% of interior triangulation edges — intelligence mesh hint, not wireframe */
const LAND_DETAIL_EDGE_KEEP = 0.1;
const HOTSPOT_RADIUS = GLOBE_RADIUS * 1.009;
const FLOW_RADIUS = GLOBE_RADIUS * 1.01;
const PULSE_RING_RADIUS = GLOBE_RADIUS * 1.011;
/** Initial draw-in when a story is selected */
const STORY_FLOW_DRAW_MS = 900;
const STORY_HIGHLIGHT_REVEAL_MS = 900;
/** @type {Record<string, string[]>} */
const GLOBE_REGIONS = {
  europe: [
    "GB", "IE", "FR", "DE", "NL", "BE", "LU", "CH", "AT", "IT", "ES", "PT", "GR", "DK", "SE", "NO",
    "FI", "PL", "CZ", "SK", "HU", "RO", "BG", "HR", "SI", "EE", "LV", "LT",
  ],
  middle_east: ["SA", "AE", "OM", "YE", "QA", "BH", "KW", "IQ", "IR", "IL", "JO", "LB", "SY", "TR"],
  east_asia: ["CN", "JP", "KR", "TW", "HK", "MO", "MN"],
};

/**
 * Story → globe intelligence by narrative type (not every story is country-specific).
 * @typedef {'macro' | 'sector' | 'regional' | 'commodity'} StoryGlobeType
 */

/**
 * Match three-geojson-geometry polar2Cartesian (lat, lng → x,y,z on +Z-front sphere).
 * @param {number} lonDeg
 * @param {number} [latDeg]
 */
function geoToUnitVector(lonDeg, latDeg = 0) {
  const phi = ((90 - latDeg) * Math.PI) / 180;
  const theta = ((90 - lonDeg) * Math.PI) / 180;
  return {
    x: Math.sin(phi) * Math.cos(theta),
    y: Math.cos(phi),
    z: Math.sin(phi) * Math.sin(theta),
  };
}

/**
 * Globe.rotation.y that brings (lon, lat) to the camera-facing meridian.
 * Derived from three-geojson-geometry layout — do not add π/2 offsets.
 * @param {number} lonDeg
 * @param {number} [latDeg]
 */
function yawToFaceLonLat(lonDeg, latDeg = 0) {
  const v = geoToUnitVector(lonDeg, latDeg);
  return Math.atan2(-v.x, v.z);
}

/**
 * Approximate lon/lat at the view centre for a given yaw (equator reference).
 * @param {number} yawRad
 */
function centerGeoAtYaw(yawRad) {
  const x = Math.sin(yawRad);
  const z = Math.cos(yawRad);
  const theta = Math.atan2(z, x);
  const lon = 90 - (theta * 180) / Math.PI;
  const sinPhi = Math.sqrt(x * x + z * z);
  const lat = 90 - (Math.asin(Math.min(1, sinPhi)) * 180) / Math.PI;
  return { lon, lat };
}

/** @returns {boolean} */
function isGlobeStoryDebug() {
  if (typeof globalThis === "undefined") return false;
  if (globalThis.__NEWS_GLOBE_DEBUG__ === true) return true;
  if (typeof location === "undefined") return false;
  return new URLSearchParams(location.search).has("globe-debug");
}

/** Preview-only manual calibration (?globe-calibrate or __NEWS_GLOBE_CALIBRATE__). */
function isGlobeCalibrateMode() {
  if (typeof globalThis === "undefined") return false;
  if (globalThis.__NEWS_GLOBE_CALIBRATE__ === true) return true;
  if (typeof location === "undefined") return false;
  return new URLSearchParams(location.search).has("globe-calibrate");
}

/** @param {string} event @param {Record<string, unknown>} data */
function logGlobeStory(event, data) {
  if (isGlobeStoryDebug()) console.info(`[news-globe] ${event}`, data);
}

/** Major European economies kept faintly visible on macro stories. */
const EUROPE_MACRO_VISIBLE = [
  "GB", "IE", "FR", "DE", "NL", "BE", "ES", "IT", "CH", "AT", "SE", "NO", "DK", "FI", "PT",
];

/**
 * @type {Record<string, object>}
 */
/**
 * Story globe targets — semantic lon/lat plus calibrated yaw (rendered on this asset).
 * Yaw values computed via yawToFaceLonLat() against three-geojson-geometry layout.
 */
const STORY_GLOBE_CONFIG = {
  inflation: {
    type: "macro",
    orient: {
      lon: -96,
      lat: 38,
      yaw: 1.675516081914556,
      mode: "us_macro",
    },
    highlight: { primary: ["US"], secondary: EUROPE_MACRO_VISIBLE },
    hotspots: [
      { lon: -77.03, lat: 38.9 },
      { lon: -98.5, lat: 39.8 },
    ],
  },
  ai: {
    type: "sector",
    orient: {
      lon: -122,
      lat: 37,
      yaw: 2.129301687433082,
      mode: "pacific_supply",
    },
    highlight: { primary: ["US"], secondary: ["TW", "JP", "KR"], tertiary: ["CN"] },
    hotspots: [
      { lon: -122.08, lat: 37.39 },
      { lon: 121.56, lat: 25.03 },
    ],
    flows: [{ from: [-122.08, 37.39], to: [121.56, 25.03] }],
  },
  europe: {
    type: "regional",
    orient: {
      lon: -35,
      lat: 48,
      yaw: 0.610865238198015,
      mode: "transatlantic",
    },
    highlight: { primary: ["US"], region: "europe" },
    hotspots: [
      { lon: -74.01, lat: 40.71 },
      { lon: 8.68, lat: 50.11 },
    ],
    flows: [{ from: [-74.01, 40.71], to: [8.68, 50.11] }],
  },
  energy: {
    type: "commodity",
    orient: {
      lon: 51,
      lat: 26,
      yaw: -0.8901179185171082,
      mode: "middle_east",
    },
    highlight: { primaryRegion: "middle_east", secondary: ["US", "NO", "RU"] },
    hotspots: [
      { lon: 50.1, lat: 26.2 },
      { lon: 54.37, lat: 24.45 },
    ],
  },
  china: {
    type: "macro",
    orient: { lon: 116, lat: 35, yaw: yawToFaceLonLat(116, 35), mode: "pacific" },
    highlight: { primary: ["CN"], secondary: ["JP", "KR", "TW"] },
    hotspots: [{ lon: 116.4, lat: 39.9 }],
  },
};

/** Expected land-centre bands for smoke tests (semantic lon/lat, not yaw). */
const STORY_LAND_REGION = {
  inflation: { lonMin: -125, lonMax: -70, latMin: 22, latMax: 52 },
  ai: { lonMin: -135, lonMax: -105, latMin: 28, latMax: 48 },
  europe: { lonMin: -80, lonMax: 15, latMin: 35, latMax: 60 },
  energy: { lonMin: 30, lonMax: 65, latMin: 12, latMax: 38 },
};

/**
 * Continuous story-select motion — active until another story is chosen.
 * @type {Record<string, object>}
 */
const STORY_EFFECTS = {
  inflation: {
    pulses: [
      {
        lon: -98,
        lat: 39,
        radiusDeg: 7,
        baseOpacity: 0.14,
        peakOpacity: 0.28,
        color: 0x8ab4cc,
        phase: 0,
        speed: 0.85,
      },
    ],
    flowDrawIn: false,
  },
  ai: {
    pulses: [
      {
        lon: -122.08,
        lat: 37.39,
        radiusDeg: 4.2,
        baseOpacity: 0.12,
        peakOpacity: 0.24,
        color: 0x8ab4cc,
        phase: 0,
        speed: 0.95,
      },
      {
        lon: 121.56,
        lat: 25.03,
        radiusDeg: 4.2,
        baseOpacity: 0.12,
        peakOpacity: 0.24,
        color: 0x8ab4cc,
        phase: 1.8,
        speed: 0.95,
      },
    ],
    flowDrawIn: true,
    flowGlow: true,
    glowSpeed: 0.07,
  },
  europe: {
    pulses: [
      {
        lon: -74.01,
        lat: 40.71,
        radiusDeg: 3.6,
        baseOpacity: 0.11,
        peakOpacity: 0.22,
        color: 0x8ab4cc,
        phase: 0,
        speed: 0.8,
      },
      {
        lon: 8.68,
        lat: 50.11,
        radiusDeg: 3.6,
        baseOpacity: 0.11,
        peakOpacity: 0.22,
        color: 0x8ab4cc,
        phase: 2.1,
        speed: 0.8,
      },
    ],
    flowDrawIn: true,
    flowGlow: true,
    glowSpeed: 0.09,
  },
  energy: {
    pulses: [
      {
        lon: 50.1,
        lat: 26.2,
        radiusDeg: 5.8,
        baseOpacity: 0.13,
        peakOpacity: 0.26,
        color: 0x8aaa90,
        phase: 0,
        speed: 0.75,
      },
      {
        lon: 54.37,
        lat: 24.45,
        radiusDeg: 4.8,
        baseOpacity: 0.1,
        peakOpacity: 0.2,
        color: 0x8aaa90,
        phase: 1.6,
        speed: 0.75,
      },
    ],
    regionGlow: {
      lon: 52,
      lat: 26,
      radiusDeg: 10,
      baseOpacity: 0.08,
      peakOpacity: 0.18,
      color: 0x8aaa90,
      phase: 0.5,
      speed: 0.55,
    },
    flowDrawIn: false,
  },
};

/**
 * @param {object | undefined} config
 * @returns {number | null}
 */
function resolveStoryYaw(config) {
  if (typeof config?.orient?.yaw === "number") {
    return config.orient.yaw;
  }
  if (typeof config?.orient?.lon === "number") {
    return yawToFaceLonLat(
      config.orient.lon,
      typeof config.orient.lat === "number" ? config.orient.lat : 0
    );
  }
  if (config?.orient?.mode === "us_macro") return INITIAL_YAW;
  return null;
}

/**
 * @param {object | undefined} highlight
 * @returns {{ primary: Set<string>, secondary: Set<string>, tertiary: Set<string> }}
 */
function resolveHighlightSets(highlight) {
  const primary = new Set(highlight?.primary || []);
  const secondary = new Set(highlight?.secondary || []);
  const tertiary = new Set(highlight?.tertiary || []);

  if (highlight?.region && GLOBE_REGIONS[highlight.region]) {
    for (const iso of GLOBE_REGIONS[highlight.region]) primary.add(iso);
  }
  if (highlight?.primaryRegion && GLOBE_REGIONS[highlight.primaryRegion]) {
    for (const iso of GLOBE_REGIONS[highlight.primaryRegion]) primary.add(iso);
  }

  return { primary, secondary, tertiary };
}

const ORIENT_MS_SELECT = 1100;
const ORIENT_MS_PREVIEW = 720;

/** @param {number} from @param {number} to */
function shortestYawDelta(from, to) {
  let d = to - from;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/** @param {number} t */
function easeOutCubic(t) {
  return 1 - (1 - t) ** 3;
}

/** @type {Promise<object | null> | null} */
let countriesGeoCache = null;

function waitForCanvasSize(canvas) {
  return new Promise((resolve) => {
    let attempts = 0;
    const tick = () => {
      const r = canvas.getBoundingClientRect();
      if (r.width >= 4 && r.height >= 4) {
        resolve();
        return;
      }
      if (++attempts > 120) {
        resolve();
        return;
      }
      requestAnimationFrame(tick);
    };
    tick();
  });
}

function isAntarctica(feature) {
  return feature?.properties?.ISO_A2 === "AQ";
}

function geometryHasNaN(geometry) {
  const pos = geometry?.attributes?.position;
  if (!pos?.array) return false;
  for (let i = 0; i < pos.array.length; i++) {
    if (!Number.isFinite(pos.array[i])) return true;
  }
  return false;
}

async function loadCountriesGeo() {
  if (countriesGeoCache) return countriesGeoCache;
  countriesGeoCache = (async () => {
    for (const url of [COUNTRIES_GEO_110M, COUNTRIES_GEO_FALLBACK]) {
      try {
        const r = await fetch(url);
        if (!r.ok) continue;
        const data = await r.json();
        data.features = (data.features || []).filter((f) => !isAntarctica(f));
        return data;
      } catch {
        /* try next */
      }
    }
    console.warn("[news globe] countries GeoJSON unavailable");
    return null;
  })();
  return countriesGeoCache;
}

/** Subtle equirectangular navy gradient for ocean depth. */
function createOceanGradientTexture(THREE) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, "#0a1e38");
  g.addColorStop(0.38, "#040e1c");
  g.addColorStop(0.72, "#020810");
  g.addColorStop(1, "#01060c");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 512, 256);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Sparse interior edges on country cap geometry (shared triangles only).
 * @param {typeof import("three")} THREE
 * @param {import("three").BufferGeometry} capGeo
 * @param {number} keepFraction
 */
function buildSparseCapDetailGeometry(THREE, capGeo, keepFraction) {
  const pos = capGeo.attributes.position;
  const index = capGeo.index;
  if (!index || !pos) return null;

  const edgeCount = new Map();
  const edgeKey = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);

  for (let i = 0; i < index.count; i += 3) {
    const a = index.getX(i);
    const b = index.getX(i + 1);
    const c = index.getX(i + 2);
    for (const [u, v] of [
      [a, b],
      [b, c],
      [c, a],
    ]) {
      const k = edgeKey(u, v);
      edgeCount.set(k, (edgeCount.get(k) || 0) + 1);
    }
  }

  const segments = [];
  for (const [key, count] of edgeCount) {
    if (count !== 2) continue;
    const [a, b] = key.split("|").map(Number);
    const hash = ((a * 73856093) ^ (b * 19349663)) >>> 0;
    if (hash / 4294967295 > keepFraction) continue;
    segments.push(
      new THREE.Vector3(pos.getX(a), pos.getY(a), pos.getZ(a)),
      new THREE.Vector3(pos.getX(b), pos.getY(b), pos.getZ(b))
    );
  }

  if (!segments.length) return null;
  return new THREE.BufferGeometry().setFromPoints(segments);
}

/**
 * @param {typeof import("three")} THREE
 * @param {typeof import("three-conic-polygon-geometry")} ConicPolygonGeometry
 * @param {number[][][]} coords
 */
function createCountryCapMesh(THREE, ConicPolygonGeometry, coords) {
  const capGeo = new ConicPolygonGeometry(
    coords,
    0,
    GLOBE_RADIUS,
    false,
    true,
    false,
    CURVATURE_DEG
  );
  if (geometryHasNaN(capGeo)) {
    capGeo.dispose();
    throw new Error("cap geometry contains NaN");
  }
  const mesh = new THREE.Mesh(capGeo, null);
  mesh.scale.setScalar(1 + POLYGON_ALTITUDE);
  return { mesh, capGeo };
}

function buildCountriesLayer(
  THREE,
  ConicPolygonGeometry,
  GeoJsonGeometry,
  countriesGeo,
  capMat,
  detailMat,
  borderMat,
  disposables
) {
  const caps = new THREE.Group();
  caps.name = "countries-caps";
  const borders = new THREE.Group();
  borders.name = "countries-borders";
  /** @type {Map<string, import("three").Mesh[]>} */
  const countryMeshesByIso = new Map();

  for (const feature of countriesGeo.features || []) {
    const geom = feature.geometry;
    if (!geom) continue;
    if (geom.type !== "Polygon" && geom.type !== "MultiPolygon") continue;

    const polygons =
      geom.type === "Polygon" ? [geom.coordinates] : geom.coordinates;

    for (const coords of polygons) {
      if (!coords?.length) continue;
      try {
        const { mesh, capGeo } = createCountryCapMesh(THREE, ConicPolygonGeometry, coords);
        mesh.material = capMat;
        const iso = feature.properties?.ISO_A2;
        mesh.userData.globeLayer = "country";
        mesh.userData.isoA2 = iso;
        mesh.userData.countryName =
          feature.properties?.NAME || feature.properties?.ADMIN || feature.properties?.NAME_EN;
        if (iso) {
          const list = countryMeshesByIso.get(iso) || [];
          list.push(mesh);
          countryMeshesByIso.set(iso, list);
        }

        const detailGeo = buildSparseCapDetailGeometry(THREE, capGeo, LAND_DETAIL_EDGE_KEEP);
        if (detailGeo) {
          mesh.add(new THREE.LineSegments(detailGeo, detailMat));
          disposables.push({ geo: detailGeo, mat: null });
        }

        caps.add(mesh);
        disposables.push({ geo: capGeo, mat: null });
      } catch {
        /* skip invalid rings */
      }

      try {
        const borderGeo = new GeoJsonGeometry(
          { type: "Polygon", coordinates: coords },
          BORDER_RADIUS,
          BORDER_RESOLUTION_DEG
        );
        borders.add(new THREE.Line(borderGeo, borderMat));
        disposables.push({ geo: borderGeo, mat: null });
      } catch {
        /* skip invalid stroke */
      }
    }
  }

  const group = new THREE.Group();
  group.name = "countries";
  group.add(caps);
  group.add(borders);
  return { group, countryMeshesByIso };
}

/**
 * @param {typeof import("three")} THREE
 * @param {typeof import("three-geojson-geometry")} GeoJsonGeometry
 * @param {object} layers
 */
function createGlobeHighlightApi(THREE, GeoJsonGeometry, layers) {
  const disposables = layers.storyDisposables;

  const dimNetwork = () => {
    layers.materials.arcMat.opacity = 0.028;
    layers.materials.hubMat.opacity = 0.12;
  };

  const restoreNetwork = () => {
    layers.materials.arcMat.opacity = 0.06;
    layers.materials.hubMat.opacity = 0.35;
  };

  const applyCountryMaterials = (activeIsos) => {
    const active = new Set(activeIsos);
    for (const [iso, meshes] of layers.countryMeshesByIso) {
      const mat = active.has(iso) ? layers.highlightCapMat : layers.dimCapMat;
      for (const mesh of meshes) mesh.material = mat;
    }
  };

  const applyTieredCountryMaterials = (primary, secondary, tertiary) => {
    for (const [iso, meshes] of layers.countryMeshesByIso) {
      let mat = layers.dimCapMat;
      if (primary.has(iso)) mat = layers.highlightCapMat;
      else if (secondary.has(iso)) mat = layers.secondaryCapMat;
      else if (tertiary.has(iso)) mat = layers.tertiaryCapMat;
      for (const mesh of meshes) mesh.material = mat;
    }
  };

  const clearOverlay = () => {
    for (const { geo, mat } of disposables) {
      geo?.dispose();
      mat?.dispose();
    }
    disposables.length = 0;
    while (layers.storyOverlay.children.length) {
      layers.storyOverlay.remove(layers.storyOverlay.children[0]);
    }
    layers.hotspotEntries = [];
    layers.flowEntries = [];
    layers.flowGlowEntries = [];
    layers.pulseRingEntries = [];
    layers.storySelectFx = null;
    layers.highlightReveal = null;
  };

  const setHighlightOpacities = (opacities) => {
    if (opacities.primary != null) layers.highlightCapMat.opacity = opacities.primary;
    if (opacities.secondary != null) layers.secondaryCapMat.opacity = opacities.secondary;
    if (opacities.tertiary != null) layers.tertiaryCapMat.opacity = opacities.tertiary;
    if (opacities.dim != null) layers.dimCapMat.opacity = opacities.dim;
  };

  const addPulseRing = (lon, lat, options = {}) => {
    const coords = circleCoordsAt(lon, lat, options.radiusDeg ?? 4);
    const geo = new GeoJsonGeometry(
      { type: "LineString", coordinates: coords },
      PULSE_RING_RADIUS,
      3
    );
    const mat = new THREE.LineBasicMaterial({
      color: options.color ?? 0x8ab4cc,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    const line = new THREE.Line(geo, mat);
    layers.storyOverlay.add(line);
    disposables.push({ geo, mat });
    layers.pulseRingEntries.push({
      mat,
      baseOpacity: options.baseOpacity ?? 0.1,
      peakOpacity: options.peakOpacity ?? 0.22,
      phase: options.phase ?? 0,
      speed: options.speed ?? 0.85,
    });
  };

  const addFlowGlowTraveler = (coords, options = {}) => {
    if (!coords?.length) return;
    const geo = new GeoJsonGeometry(
      { type: "Point", coordinates: [[coords[0][0], coords[0][1]]] },
      FLOW_RADIUS * 1.003,
      3
    );
    const mat = new THREE.PointsMaterial({
      color: options.color ?? 0x9ec8e0,
      size: options.size ?? 0.042,
      transparent: true,
      opacity: 0,
      sizeAttenuation: true,
      depthWrite: false,
    });
    const mesh = new THREE.Points(geo, mat);
    setMeshAtLonLat(mesh, coords[0][0], coords[0][1], FLOW_RADIUS * 1.003);
    layers.storyOverlay.add(mesh);
    disposables.push({ geo, mat });
    layers.flowGlowEntries.push({
      mesh,
      mat,
      coords,
      phase: options.phase ?? 0,
      speed: options.speed ?? 0.08,
    });
  };

  const beginSelectEffects = (storyId, orientDelayMs = 0) => {
    const effect = STORY_EFFECTS[storyId];
    if (!effect) return;

    const now = performance.now();
    const fxStartMs = now + orientDelayMs;
    const targets = layers.highlightOpacityTargets ?? {
      primary: 0.88,
      secondary: 0.62,
      tertiary: 0.54,
      dim: 0.18,
    };

    layers.storySelectFx = {
      storyId,
      fxStartMs,
      active: true,
    };

    if (layers.reducedMotion) {
      setHighlightOpacities(targets);
      return;
    }

    layers.highlightReveal = {
      startMs: now,
      duration: Math.min(orientDelayMs || STORY_HIGHLIGHT_REVEAL_MS, STORY_HIGHLIGHT_REVEAL_MS),
      targets,
    };
    setHighlightOpacities({
      primary: 0.42,
      secondary: 0.3,
      tertiary: 0.26,
      dim: 0.16,
    });

    for (const pulse of effect.pulses ?? []) {
      addPulseRing(pulse.lon, pulse.lat, {
        radiusDeg: pulse.radiusDeg,
        baseOpacity: pulse.baseOpacity,
        peakOpacity: pulse.peakOpacity,
        color: pulse.color,
        phase: pulse.phase ?? 0,
        speed: pulse.speed ?? 0.85,
      });
    }

    if (effect.regionGlow) {
      const g = effect.regionGlow;
      addPulseRing(g.lon, g.lat, {
        radiusDeg: g.radiusDeg,
        baseOpacity: g.baseOpacity,
        peakOpacity: g.peakOpacity,
        color: g.color,
        phase: g.phase ?? 0,
        speed: g.speed ?? 0.55,
      });
    }

    for (const entry of layers.flowEntries) {
      entry.targetOpacity = 0.11;
      if (effect.flowDrawIn) {
        entry.mat.opacity = 0;
        entry.drawIn = true;
        entry.phase = 0;
      } else {
        entry.mat.opacity = entry.targetOpacity;
        entry.drawIn = false;
      }
    }

    if (effect.flowGlow) {
      for (const entry of layers.flowEntries) {
        if (entry.coords?.length) {
          addFlowGlowTraveler(entry.coords, {
            speed: effect.glowSpeed ?? 0.08,
            phase: entry.phase,
          });
        }
      }
    }
  };

  const startOrientation = (targetYaw, intent) => {
    const fromYaw = layers.globe.rotation.y;
    const delta = shortestYawDelta(fromYaw, targetYaw);
    logGlobeStory("orientation", {
      intent,
      fromYawRad: fromYaw,
      toYawRad: targetYaw,
      deltaYawRad: delta,
      fromYawDeg: (fromYaw * 180) / Math.PI,
      toYawDeg: (targetYaw * 180) / Math.PI,
      durationMs: intent === "preview" ? ORIENT_MS_PREVIEW : ORIENT_MS_SELECT,
    });
    layers.orientAnim = {
      fromYaw,
      toYaw: targetYaw,
      startMs: performance.now(),
      duration: intent === "preview" ? ORIENT_MS_PREVIEW : ORIENT_MS_SELECT,
    };
  };

  const applyStoryHighlights = (storyId, intent) => {
    const config = STORY_GLOBE_CONFIG[storyId];
    if (!config) return;

    const tiers = resolveHighlightSets(config.highlight);
    const hasTiered =
      tiers.primary.size > 0 || tiers.secondary.size > 0 || tiers.tertiary.size > 0;

    if (hasTiered) {
      applyTieredCountryMaterials(tiers.primary, tiers.secondary, tiers.tertiary);
    }

    if (config.hotspots?.length) api.setHotspots(config.hotspots);
    if (config.flows?.length) api.setCapitalFlows(config.flows);
    dimNetwork();

    const preview = intent === "preview";
    layers.highlightOpacityTargets = {
      primary: preview ? 0.78 : 0.88,
      secondary: preview ? 0.55 : 0.62,
      tertiary: preview ? 0.48 : 0.54,
      dim: preview ? 0.22 : 0.18,
    };
    if (intent !== "select" || layers.reducedMotion) {
      setHighlightOpacities(layers.highlightOpacityTargets);
    }
  };

  const api = {
    /**
     * @param {string} storyId
     * @param {{ intent?: 'preview' | 'select' }} [options]
     */
    setStory(storyId, options = {}) {
      const intent = options.intent === "preview" ? "preview" : "select";
      layers.storyId = storyId;
      api.clearHighlights({ keepManual: intent === "preview" });

      if (intent === "select") {
        layers.manualOverride = false;
      }

      applyStoryHighlights(storyId, intent);

      const config = STORY_GLOBE_CONFIG[storyId];
      const orientMode = config?.orient?.mode;
      const orientLon =
        typeof config?.orient?.lon === "number" ? config.orient.lon : null;
      const orientLat =
        typeof config?.orient?.lat === "number" ? config.orient.lat : null;
      const targetYaw = resolveStoryYaw(config);
      const willRotate =
        targetYaw != null && (intent === "select" || !layers.manualOverride);
      logGlobeStory("setStory", {
        storyId,
        intent,
        mapped: Boolean(config),
        orientMode: orientMode ?? null,
        targetRegion:
          config?.highlight?.primaryRegion || config?.highlight?.region || null,
        targetLonDeg: orientLon,
        targetLatDeg: orientLat,
        hotspotCoords: config?.hotspots ?? null,
        targetYawRad: targetYaw,
        targetYawDeg: targetYaw != null ? (targetYaw * 180) / Math.PI : null,
        currentYawRad: layers.globe.rotation.y,
        manualOverride: layers.manualOverride,
        willRotate,
      });
      if (willRotate) {
        startOrientation(targetYaw, intent);
      }

      if (intent === "select") {
        const orientDelay = willRotate ? ORIENT_MS_SELECT : 0;
        beginSelectEffects(storyId, orientDelay);
      }
    },

    highlightCountries(isoCodes = [], _options = {}) {
      applyCountryMaterials(isoCodes);
    },

    highlightRegion(regionId, options = {}) {
      const extra = options.countries || [];
      const regionIsos = GLOBE_REGIONS[regionId] || [];
      api.highlightCountries([...new Set([...regionIsos, ...extra])]);
    },

    setHotspots(points = []) {
      for (const pt of points) {
        const geo = new GeoJsonGeometry(
          { type: "Point", coordinates: [[pt.lon, pt.lat]] },
          HOTSPOT_RADIUS,
          3
        );
        const mat = new THREE.PointsMaterial({
          color: 0x9ec8e0,
          size: 0.034,
          transparent: true,
          opacity: 0.42,
          sizeAttenuation: true,
          depthWrite: false,
        });
        const pointsMesh = new THREE.Points(geo, mat);
        layers.storyOverlay.add(pointsMesh);
        disposables.push({ geo, mat });
        layers.hotspotEntries.push({ mat, phase: Math.random() * Math.PI * 2 });
      }
    },

    setCapitalFlows(flows = []) {
      if (!flows.length) return;
      for (const f of flows) {
        const span =
          Math.abs(f.from[0] - f.to[0]) + Math.abs(f.from[1] - f.to[1]);
        const steps = span > 80 ? 56 : 36;
        const coords = lerpArc(f.from[0], f.from[1], f.to[0], f.to[1], steps);
        const geo = new GeoJsonGeometry(
          { type: "LineString", coordinates: coords },
          FLOW_RADIUS,
          4
        );
        const mat = new THREE.LineBasicMaterial({
          color: 0x7ab0cc,
          transparent: true,
          opacity: 0.11,
          depthWrite: false,
        });
        const line = new THREE.Line(geo, mat);
        layers.storyOverlay.add(line);
        disposables.push({ geo, mat });
        layers.flowEntries.push({
          mat,
          phase: Math.random() * Math.PI * 2,
          targetOpacity: 0.11,
          drawIn: false,
          coords,
        });
      }
    },

    setEconomicEvents(events = []) {
      const points = events
        .filter((e) => typeof e.lon === "number" && typeof e.lat === "number")
        .map((e) => ({ lon: e.lon, lat: e.lat }));
      if (points.length) api.setHotspots(points);
    },

  /** @param {{ keepManual?: boolean }} [options] */
    clearHighlights(options = {}) {
      clearOverlay();
      for (const meshes of layers.countryMeshesByIso.values()) {
        for (const mesh of meshes) mesh.material = layers.baseCapMat;
      }
      restoreNetwork();
      if (!options.keepManual) {
        layers.manualOverride = false;
        layers.orientAnim = null;
      }
    },

    /** User took manual control — stop automated orientation until next story select. */
    releaseAutoOrientation() {
      layers.manualOverride = true;
      layers.orientAnim = null;
    },

    getCountryMeshes(iso) {
      return layers.countryMeshesByIso.get(iso) || [];
    },

    /** Current yaw and approximate view-centre geo (preview calibration). */
    getOrientationState() {
      const yawRad = layers.globe.rotation.y;
      const center = centerGeoAtYaw(yawRad);
      return {
        yawRad,
        yawDeg: (yawRad * 180) / Math.PI,
        centerLon: center.lon,
        centerLat: center.lat,
        manualOverride: layers.manualOverride,
        orientAnim: layers.orientAnim,
      };
    },

    /** Log yaw/lon after manual rotation (?globe-calibrate). */
    logOrientation(label = "manual") {
      const state = api.getOrientationState();
      console.info(`[news-globe] orientation:${label}`, state);
      return state;
    },

    /** Capture current view centre as a story target (preview calibration). */
    captureStoryTarget(storyId) {
      const yawRad = layers.globe.rotation.y;
      const center = centerGeoAtYaw(yawRad);
      const payload = {
        storyId,
        yawRad,
        yawDeg: (yawRad * 180) / Math.PI,
        centerLon: center.lon,
        centerLat: center.lat,
        orientSnippet: `{ lon: ${center.lon.toFixed(2)}, lat: ${center.lat.toFixed(2)}, yaw: ${yawRad} }`,
      };
      console.info("[news-globe] captureStoryTarget", payload);
      if (STORY_GLOBE_CONFIG[storyId]) {
        STORY_GLOBE_CONFIG[storyId].orient = {
          ...STORY_GLOBE_CONFIG[storyId].orient,
          lon: center.lon,
          lat: center.lat,
          yaw: yawRad,
        };
      }
      return payload;
    },

    /** Semantic land-region check for the story target lon/lat. */
    getStoryLandRegion(storyId) {
      return STORY_LAND_REGION[storyId] ?? null;
    },

    getStoryOrient(storyId) {
      return STORY_GLOBE_CONFIG[storyId]?.orient ?? null;
    },

    getStoryEffectState() {
      return {
        storySelectFx: layers.storySelectFx,
        pulseRingCount: layers.pulseRingEntries?.length ?? 0,
        flowCount: layers.flowEntries?.length ?? 0,
        flowGlowCount: layers.flowGlowEntries?.length ?? 0,
        highlightReveal: Boolean(layers.highlightReveal),
        effectsPaused: Boolean(layers.effectsPaused),
      };
    },

    tick(timeMs) {
      const prevMs = layers.lastTickMs ?? timeMs;
      const dt = Math.min(0.05, (timeMs - prevMs) / 1000);
      layers.lastTickMs = timeMs;

      if (
        layers.idleRotationEnabled &&
        !layers.idleRotationPaused &&
        !layers.orientAnim &&
        dt > 0
      ) {
        layers.globe.rotation.y += layers.idleRotationSpeed * dt;
      }

      const reveal = layers.highlightReveal;
      if (reveal) {
        const p = Math.min(1, (timeMs - reveal.startMs) / reveal.duration);
        const eased = easeOutCubic(p);
        const tgt = reveal.targets;
        setHighlightOpacities({
          primary: lerpNum(0.42, tgt.primary, eased),
          secondary: lerpNum(0.3, tgt.secondary, eased),
          tertiary: lerpNum(0.26, tgt.tertiary, eased),
          dim: lerpNum(0.16, tgt.dim, eased),
        });
        if (p >= 1) layers.highlightReveal = null;
      }

      const fx = layers.storySelectFx;
      const fxActive = Boolean(fx?.active && timeMs >= (fx?.fxStartMs ?? 0));
      const motionOff = layers.reducedMotion;
      const motionScale = motionOff ? 0 : layers.effectsPaused ? 0.4 : 1;
      const t = timeMs * 0.001;

      if (fxActive && !reveal && layers.highlightOpacityTargets) {
        const tgt = layers.highlightOpacityTargets;
        if (motionOff) {
          setHighlightOpacities(tgt);
        } else {
          const breathe = 0.5 + 0.5 * Math.sin(t * 0.62);
          setHighlightOpacities({
            primary: tgt.primary + breathe * 0.05 * motionScale,
            secondary: tgt.secondary + breathe * 0.03 * motionScale,
            tertiary: tgt.tertiary + breathe * 0.02 * motionScale,
            dim: tgt.dim,
          });
        }
      }

      for (const entry of layers.pulseRingEntries) {
        if (!fxActive || motionOff) {
          entry.mat.opacity = motionOff ? entry.baseOpacity * 0.85 : 0;
          continue;
        }
        const wave = 0.5 + 0.5 * Math.sin(t * entry.speed + entry.phase);
        entry.mat.opacity =
          (entry.baseOpacity + wave * entry.peakOpacity) * motionScale;
      }

      for (const entry of layers.hotspotEntries) {
        if (!fxActive) {
          entry.mat.opacity = 0.2;
          entry.mat.size = 0.028;
          continue;
        }
        if (motionOff) {
          entry.mat.opacity = 0.4;
          entry.mat.size = 0.034;
          continue;
        }
        const pulse = 0.5 + 0.5 * Math.sin(t * 1.05 + entry.phase);
        entry.mat.opacity = (0.34 + pulse * 0.2) * motionScale;
        entry.mat.size = 0.03 + pulse * 0.014 * motionScale;
      }

      for (const entry of layers.flowEntries) {
        const base = entry.targetOpacity ?? 0.11;
        if (entry.drawIn && fxActive) {
          const p = Math.min(1, (timeMs - fx.fxStartMs) / STORY_FLOW_DRAW_MS);
          entry.mat.opacity = easeOutCubic(p) * base * (motionOff ? 1 : motionScale);
          if (p >= 1) entry.drawIn = false;
          continue;
        }
        if (!fxActive) {
          entry.mat.opacity = 0.05;
          continue;
        }
        if (motionOff) {
          entry.mat.opacity = base;
          continue;
        }
        const pulse = 0.5 + 0.5 * Math.sin(t * 0.72 + entry.phase);
        entry.mat.opacity = (base * 0.72 + pulse * base * 0.55) * motionScale;
      }

      for (const entry of layers.flowGlowEntries) {
        if (!fxActive || motionOff) {
          entry.mat.opacity = 0;
          continue;
        }
        const progress = (t * entry.speed + entry.phase) % 1;
        const idx = Math.min(
          entry.coords.length - 1,
          Math.floor(progress * (entry.coords.length - 1))
        );
        const [lon, lat] = entry.coords[idx];
        setMeshAtLonLat(entry.mesh, lon, lat, FLOW_RADIUS * 1.003);
        const glowWave = 0.5 + 0.5 * Math.sin(t * 2.2 + entry.phase * 2);
        entry.mat.opacity = (0.3 + glowWave * 0.25) * motionScale;
        entry.mat.size = 0.04 + glowWave * 0.02 * motionScale;
      }

      const anim = layers.orientAnim;
      if (!layers.manualOverride && anim) {
        const p = Math.min(1, (timeMs - anim.startMs) / anim.duration);
        const eased = easeOutCubic(p);
        const delta = shortestYawDelta(anim.fromYaw, anim.toYaw);
        layers.globe.rotation.y = anim.fromYaw + delta * eased;
        if (p >= 1) layers.orientAnim = null;
      }
    },

    layers,
  };

  layers.clearHighlights = () => api.clearHighlights();
  return api;
}

function buildGraticuleGeometry() {
  const lines = [];

  for (let lat = -60; lat <= 60; lat += 15) {
    const coords = [];
    for (let lon = -180; lon <= 180; lon += 4) coords.push([lon, lat]);
    lines.push(coords);
  }

  for (let lon = -180; lon < 180; lon += 30) {
    const coords = [];
    for (let lat = -85; lat <= 85; lat += 4) coords.push([lon, lat]);
    lines.push(coords);
  }

  const major = [];
  {
    const eq = [];
    for (let lon = -180; lon <= 180; lon += 3) eq.push([lon, 0]);
    major.push(eq);
  }
  {
    const mer = [];
    for (let lat = -85; lat <= 85; lat += 3) mer.push([0, lat]);
    major.push(mer);
  }

  return {
    grid: { type: "MultiLineString", coordinates: lines },
    major: { type: "MultiLineString", coordinates: major },
  };
}

/** @type {[number, number][]} lon, lat */
const NETWORK_HUBS = [
  [-74, 40.7],
  [-0.1, 51.5],
  [103.8, 1.3],
  [55.3, 25.2],
];

function lerpArc(lon1, lat1, lon2, lat2, steps = 24) {
  const coords = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    coords.push([lon1 + (lon2 - lon1) * t, lat1 + (lat2 - lat1) * t]);
  }
  return coords;
}

/** Small geographic circle for on-globe pulse rings. */
function circleCoordsAt(lonDeg, latDeg, radiusDeg = 4, segments = 36) {
  const latRad = (latDeg * Math.PI) / 180;
  const cosLat = Math.cos(latRad) || 0.15;
  const coords = [];
  for (let i = 0; i <= segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    coords.push([
      lonDeg + (Math.cos(a) * radiusDeg) / cosLat,
      latDeg + Math.sin(a) * radiusDeg,
    ]);
  }
  return coords;
}

/** @param {number} a @param {number} b @param {number} t */
function lerpNum(a, b, t) {
  return a + (b - a) * t;
}

/** Place a mesh on the globe surface at lon/lat. */
function setMeshAtLonLat(mesh, lonDeg, latDeg, radius) {
  const v = geoToUnitVector(lonDeg, latDeg);
  mesh.position.set(v.x * radius, v.y * radius, v.z * radius);
}

function buildNetworkGeometry() {
  return {
    arcs: {
      type: "MultiLineString",
      coordinates: [
        lerpArc(-74, 40.7, -0.1, 51.5),
        lerpArc(-0.1, 51.5, 103.8, 1.3),
      ],
    },
    hubs: { type: "MultiPoint", coordinates: NETWORK_HUBS },
  };
}

async function createGlobeScene(canvas, countriesGeo) {
  const [THREE, { default: ConicPolygonGeometry }, { default: GeoJsonGeometry }] =
    await Promise.all([
      import("three"),
      import("three-conic-polygon-geometry"),
      import("three-geojson-geometry"),
    ]);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 20);
  camera.position.set(0, 0.05, 2.58);
  camera.lookAt(0, 0, 0);

  const renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: true,
    antialias: true,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.setClearColor(0x000000, 0);

  const ambient = new THREE.AmbientLight(0x1a2d45, 0.55);
  const keyLight = new THREE.DirectionalLight(0x9eb8d4, 0.72);
  keyLight.position.set(5, 3, 6);
  const fillLight = new THREE.DirectionalLight(0x0c1828, 0.35);
  fillLight.position.set(-4, -2, -3);
  const rimLight = new THREE.DirectionalLight(0x3a6a90, 0.22);
  rimLight.position.set(-2, 1, -5);
  scene.add(ambient, keyLight, fillLight, rimLight);

  const rig = new THREE.Group();
  rig.rotation.x = TILT;
  const globe = new THREE.Group();
  globe.rotation.y = INITIAL_YAW;
  rig.add(globe);
  scene.add(rig);

  const disposables = [];

  const atmosphere = new THREE.Group();
  atmosphere.name = "atmosphere";

  const atmosGeo = new THREE.SphereGeometry(ATMOS_RADIUS, 64, 48);
  const atmosMat = new THREE.MeshBasicMaterial({
    color: 0x4a8ab8,
    transparent: true,
    opacity: 0.09,
    side: THREE.BackSide,
    depthWrite: false,
  });
  atmosphere.add(new THREE.Mesh(atmosGeo, atmosMat));
  disposables.push({ geo: atmosGeo, mat: atmosMat });

  globe.add(atmosphere);

  const oceanGeo = new THREE.SphereGeometry(OCEAN_RADIUS, 64, 40);
  const oceanTex = createOceanGradientTexture(THREE);
  const oceanMat = new THREE.MeshPhongMaterial({
    map: oceanTex,
    color: 0x0a1830,
    emissive: 0x020608,
    specular: 0x142840,
    shininess: 18,
    transparent: false,
  });
  const oceanMesh = new THREE.Mesh(oceanGeo, oceanMat);
  oceanMesh.name = "ocean";
  globe.add(oceanMesh);
  disposables.push({ geo: oceanGeo, mat: oceanMat, tex: oceanTex });

  const graticule = buildGraticuleGeometry();
  const gridGeo = new GeoJsonGeometry(graticule.grid, GRID_RADIUS, GRID_RESOLUTION_DEG);
  const majorGeo = new GeoJsonGeometry(graticule.major, GRID_RADIUS, 2);
  const gridMat = new THREE.LineBasicMaterial({
    color: 0x3a6888,
    transparent: true,
    opacity: 0.07,
    depthWrite: false,
  });
  const majorMat = new THREE.LineBasicMaterial({
    color: 0x5a88a8,
    transparent: true,
    opacity: 0.11,
    depthWrite: false,
  });
  const graticuleGroup = new THREE.Group();
  graticuleGroup.name = "graticule";
  graticuleGroup.add(new THREE.LineSegments(gridGeo, gridMat));
  graticuleGroup.add(new THREE.LineSegments(majorGeo, majorMat));
  globe.add(graticuleGroup);
  disposables.push(
    { geo: gridGeo, mat: gridMat },
    { geo: majorGeo, mat: majorMat }
  );

  if (!countriesGeo) throw new Error("countries geometry required");

  const capMat = new THREE.MeshPhongMaterial({
    color: 0x2a5c72,
    emissive: 0x061018,
    specular: 0x1a3040,
    shininess: 6,
    transparent: true,
    opacity: 0.53,
    side: THREE.DoubleSide,
    depthWrite: true,
  });
  const detailMat = new THREE.LineBasicMaterial({
    color: 0x4a8098,
    transparent: true,
    opacity: 0.07,
    depthWrite: false,
  });
  const borderMat = new THREE.LineBasicMaterial({
    color: 0x6a90a8,
    transparent: true,
    opacity: 0.045,
    depthWrite: false,
  });

  const { group: countriesGroup, countryMeshesByIso } = buildCountriesLayer(
    THREE,
    ConicPolygonGeometry,
    GeoJsonGeometry,
    countriesGeo,
    capMat,
    detailMat,
    borderMat,
    disposables
  );
  globe.add(countriesGroup);
  disposables.push(
    { geo: null, mat: capMat },
    { geo: null, mat: detailMat },
    { geo: null, mat: borderMat }
  );

  const network = buildNetworkGeometry();
  const arcGeo = new GeoJsonGeometry(network.arcs, NETWORK_RADIUS, 5);
  const hubGeo = new GeoJsonGeometry(network.hubs, NETWORK_RADIUS, 4);
  const arcMat = new THREE.LineBasicMaterial({
    color: 0x6a98b8,
    transparent: true,
    opacity: 0.06,
    depthWrite: false,
  });
  const hubMat = new THREE.PointsMaterial({
    color: 0x8ab0c8,
    size: 0.022,
    transparent: true,
    opacity: 0.35,
    sizeAttenuation: true,
    depthWrite: false,
  });
  const networkGroup = new THREE.Group();
  networkGroup.name = "network";
  networkGroup.add(new THREE.LineSegments(arcGeo, arcMat));
  networkGroup.add(new THREE.Points(hubGeo, hubMat));
  globe.add(networkGroup);
  disposables.push({ geo: arcGeo, mat: arcMat }, { geo: hubGeo, mat: hubMat });

  const storyOverlay = new THREE.Group();
  storyOverlay.name = "story-overlay";
  globe.add(storyOverlay);

  const highlightCapMat = capMat.clone();
  highlightCapMat.color.setHex(0x3a7088);
  highlightCapMat.emissive.setHex(0x0e2434);
  highlightCapMat.opacity = 0.68;

  const dimCapMat = capMat.clone();
  dimCapMat.color.setHex(0x1a4252);
  dimCapMat.emissive.setHex(0x030608);
  dimCapMat.opacity = 0.26;

  const secondaryCapMat = capMat.clone();
  secondaryCapMat.color.setHex(0x2e5e72);
  secondaryCapMat.emissive.setHex(0x081420);
  secondaryCapMat.specular.setHex(0x1a3040);
  secondaryCapMat.opacity = 0.46;

  const tertiaryCapMat = capMat.clone();
  tertiaryCapMat.color.setHex(0x284e5e);
  tertiaryCapMat.emissive.setHex(0x061018);
  tertiaryCapMat.opacity = 0.4;

  const layers = {
    storyId: null,
    globe,
    ocean: oceanMesh,
    graticule: graticuleGroup,
    countries: countriesGroup,
    network: networkGroup,
    atmosphere,
    storyOverlay,
    storyDisposables: [],
    hotspotEntries: [],
    flowEntries: [],
    flowGlowEntries: [],
    pulseRingEntries: [],
    storySelectFx: null,
    highlightReveal: null,
    highlightOpacityTargets: null,
    reducedMotion: false,
    effectsPaused: false,
    countryMeshesByIso,
    baseCapMat: capMat,
    highlightCapMat,
    secondaryCapMat,
    tertiaryCapMat,
    dimCapMat,
    materials: { capMat, detailMat, borderMat, arcMat, hubMat },
    manualOverride: false,
    orientAnim: null,
  };

  const resize = () => {
    const rect = canvas.getBoundingClientRect();
    const w = Math.max(rect.width, 4);
    const h = Math.max(rect.height, 4);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };

  resize();

  const globeApi = createGlobeHighlightApi(THREE, GeoJsonGeometry, layers);

  return { scene, camera, renderer, globe, rig, resize, disposables, layers, globeApi };
}

export async function bindNewsGlobeThree(visual, _storyId = "inflation") {
  const stage = visual.querySelector("[data-globe-stage]");
  const hit = visual.querySelector("[data-globe-hit]");
  const canvas = stage?.querySelector(".news-globe-canvas");

  if (!stage || !canvas) {
    console.error("[news globe] bind failed — missing stage or canvas");
    return () => {};
  }

  await waitForCanvasSize(canvas);

  const countriesGeo = await loadCountriesGeo();

  let ctx;
  try {
    ctx = await createGlobeScene(canvas, countriesGeo);
  } catch (err) {
    console.error("[news globe] scene init failed:", err);
    return () => {};
  }

  const globeApi = ctx.globeApi;
  visual._globeCanvas = globeApi;
  const activeStoryId = visual.dataset.visual || _storyId || "inflation";
  if (typeof visual._globeFlushPendingStory === "function") {
    visual._globeFlushPendingStory();
  } else {
    globeApi.setStory(activeStoryId, { intent: "select" });
  }
  visual.classList.add("is-interactive");
  visual.dataset.globeBound = "true";

  let raf = 0;
  const loop = () => {
    if (!canvas.isConnected) return;
    raf = requestAnimationFrame(loop);
    globeApi.tick(performance.now());
    ctx.renderer.render(ctx.scene, ctx.camera);
  };
  raf = requestAnimationFrame(loop);

  const target = hit || stage;
  let dragging = false;
  let pointerId = null;
  let lastX = 0;
  let touchAxis = null;
  let startX = 0;
  let startY = 0;

  const applyReducedMotion = () => {
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    ctx.layers.idleRotationEnabled = !reduced;
    ctx.layers.idleRotationSpeed = reduced ? 0 : IDLE_ROTATION_RAD_PER_SEC;
    ctx.layers.reducedMotion = Boolean(reduced);
  };
  applyReducedMotion();
  const motionMq = window.matchMedia?.("(prefers-reduced-motion: reduce)");
  const onMotionChange = () => applyReducedMotion();
  motionMq?.addEventListener?.("change", onMotionChange);

  const pauseIdleRotation = () => {
    ctx.layers.idleRotationPaused = true;
    ctx.layers.effectsPaused = true;
  };
  const resumeIdleRotation = () => {
    if (!dragging) {
      ctx.layers.idleRotationPaused = false;
      ctx.layers.effectsPaused = false;
    }
  };

  const onDown = (e) => {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    pauseIdleRotation();
    pointerId = e.pointerId;
    lastX = e.clientX;
    startX = e.clientX;
    startY = e.clientY;
    touchAxis = null;
    if (e.pointerType !== "touch") {
      dragging = true;
      visual.classList.add("is-dragging");
      target.setPointerCapture(e.pointerId);
    }
  };

  const onMove = (e) => {
    if (e.pointerId !== pointerId) return;
    const dx = e.clientX - lastX;
    if (e.pointerType === "touch" && touchAxis === null) {
      const tdx = e.clientX - startX;
      const tdy = e.clientY - startY;
      if (Math.abs(tdx) > 10 || Math.abs(tdy) > 10) {
        touchAxis = Math.abs(tdx) > Math.abs(tdy) * 1.15 ? "rotate" : "scroll";
        if (touchAxis === "rotate") {
          dragging = true;
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
    if (Math.abs(dx) > 0.5) globeApi.releaseAutoOrientation();
    ctx.globe.rotation.y += dx * DRAG_SENSITIVITY;
    lastX = e.clientX;
  };

  const onUp = (e) => {
    if (e.pointerId !== pointerId) return;
    const wasDragging = dragging;
    if (dragging) {
      dragging = false;
      visual.classList.remove("is-dragging");
      try {
        target.releasePointerCapture(e.pointerId);
      } catch {
        /* ok */
      }
    }
    pointerId = null;
    touchAxis = null;
    resumeIdleRotation();
    if (wasDragging && isGlobeCalibrateMode()) {
      globeApi.logOrientation("drag-end");
    }
  };

  const calibrateKeys = {
    Digit1: "inflation",
    Digit2: "ai",
    Digit3: "europe",
    Digit4: "energy",
  };
  const onCalibrateKey = (e) => {
    if (!isGlobeCalibrateMode()) return;
    const storyId = calibrateKeys[e.code];
    if (!storyId) return;
    e.preventDefault();
    globeApi.captureStoryTarget(storyId);
  };

  if (isGlobeCalibrateMode()) {
    globalThis.__NEWS_GLOBE_CALIBRATE_API__ = {
      logOrientation: (label) => globeApi.logOrientation(label),
      captureStoryTarget: (id) => globeApi.captureStoryTarget(id),
      getOrientationState: () => globeApi.getOrientationState(),
      yawToFaceLonLat,
      centerGeoAtYaw,
    };
    console.info(
      "[news-globe] calibration mode — drag to frame, keys 1-4 capture inflation/ai/europe/energy"
    );
    window.addEventListener("keydown", onCalibrateKey);
  }

  visual.addEventListener("pointerenter", pauseIdleRotation);
  visual.addEventListener("pointerleave", resumeIdleRotation);

  const onResize = () => ctx.resize();
  const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(onResize) : null;
  ro?.observe(stage);

  target.addEventListener("pointerdown", onDown);
  target.addEventListener("pointermove", onMove);
  target.addEventListener("pointerup", onUp);
  target.addEventListener("pointercancel", onUp);
  window.addEventListener("resize", onResize);

  return () => {
    cancelAnimationFrame(raf);
    ctx.renderer.dispose();
    for (const { geo, mat, tex } of ctx.disposables) {
      geo?.dispose();
      mat?.dispose();
      tex?.dispose();
    }
    delete visual._globeCanvas;
    visual.classList.remove("is-interactive", "is-dragging");
    delete visual.dataset.globeBound;
    target.removeEventListener("pointerdown", onDown);
    target.removeEventListener("pointermove", onMove);
    target.removeEventListener("pointerup", onUp);
    target.removeEventListener("pointercancel", onUp);
    visual.removeEventListener("pointerenter", pauseIdleRotation);
    visual.removeEventListener("pointerleave", resumeIdleRotation);
    motionMq?.removeEventListener?.("change", onMotionChange);
    window.removeEventListener("resize", onResize);
    window.removeEventListener("keydown", onCalibrateKey);
    delete globalThis.__NEWS_GLOBE_CALIBRATE_API__;
    ro?.disconnect();
  };
}

export { yawToFaceLonLat, centerGeoAtYaw, STORY_GLOBE_CONFIG, STORY_LAND_REGION };

export const bindNewsGlobeCanvas = bindNewsGlobeThree;

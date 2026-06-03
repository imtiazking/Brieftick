import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js";
import {
  STOCKS,
  EDGES,
  mountChrome,
  mountNarrative,
  narrateFocus,
  narrateLink,
  LAB_NOTE,
} from "/design-lab/move-together/_together-mock.js";

mountChrome("Market Constellation", "01");
const narrative = mountNarrative("narrative");

const stage = document.getElementById("stage");
const canvas = document.createElement("canvas");
canvas.className = "mt-canvas";
stage.appendChild(canvas);

const badge = document.createElement("p");
badge.className = "mt-badge";
badge.textContent = LAB_NOTE;
document.body.appendChild(badge);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight - 48);

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x020208, 0.035);

const camera = new THREE.PerspectiveCamera(52, innerWidth / (innerHeight - 48), 0.1, 200);
camera.position.set(0, 0, 14);

const positions = new Map();
STOCKS.forEach((s, i) => {
  const a = (i / STOCKS.length) * Math.PI * 2;
  const r = 4 + (i % 3) * 0.8;
  positions.set(s.sym, new THREE.Vector3(Math.cos(a) * r, (Math.sin(i * 1.7) * 1.4), Math.sin(a) * r * 0.6));
});

const starGeo = new THREE.BufferGeometry();
const starPos = new Float32Array(STOCKS.length * 3);
STOCKS.forEach((s, i) => {
  const p = positions.get(s.sym);
  starPos[i * 3] = p.x;
  starPos[i * 3 + 1] = p.y;
  starPos[i * 3 + 2] = p.z;
});
starGeo.setAttribute("position", new THREE.BufferAttribute(starPos, 3));
const starMat = new THREE.PointsMaterial({
  size: 0.35,
  color: 0xf0d49a,
  transparent: true,
  opacity: 0.95,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
});
const stars = new THREE.Points(starGeo, starMat);
scene.add(stars);

const glowGeo = new THREE.SphereGeometry(0.22, 16, 16);
const glowMats = new Map();
const glowMeshes = new Map();
STOCKS.forEach((s) => {
  const mat = new THREE.MeshBasicMaterial({
    color: new THREE.Color().setHSL(s.hue / 360, 0.7, 0.62),
    transparent: true,
    opacity: 0.85,
  });
  const mesh = new THREE.Mesh(glowGeo, mat);
  mesh.position.copy(positions.get(s.sym));
  scene.add(mesh);
  glowMats.set(s.sym, mat);
  glowMeshes.set(s.sym, mesh);
});

const beamGroup = new THREE.Group();
scene.add(beamGroup);
const beams = [];

EDGES.forEach((e) => {
  const geo = new THREE.BufferGeometry().setFromPoints([
    positions.get(e.a),
    positions.get(e.b),
  ]);
  const mat = new THREE.LineBasicMaterial({
    color: 0xd4a85a,
    transparent: true,
    opacity: e.r * 0.55,
    blending: THREE.AdditiveBlending,
  });
  const line = new THREE.Line(geo, mat);
  line.userData = { edge: e, phase: Math.random() * Math.PI * 2 };
  beamGroup.add(line);
  beams.push({ line, mat, edge: e });
});

const dust = new THREE.Points(
  new THREE.BufferGeometry().setAttribute(
    "position",
    new THREE.BufferAttribute(
      new Float32Array(
        Array.from({ length: 1200 }, () => [
          (Math.random() - 0.5) * 40,
          (Math.random() - 0.5) * 40,
          (Math.random() - 0.5) * 40,
        ]).flat()
      ),
      3
    )
  ),
  new THREE.PointsMaterial({
    size: 0.04,
    color: 0x8899bb,
    transparent: true,
    opacity: 0.35,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  })
);
scene.add(dust);

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let focus = null;
let camTarget = new THREE.Vector3(0, 0, 14);
let lookTarget = new THREE.Vector3(0, 0, 0);

function pickSym(clientX, clientY) {
  pointer.x = (clientX / innerWidth) * 2 - 1;
  pointer.y = -((clientY - 48) / (innerHeight - 48)) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  let best = null;
  let bestD = Infinity;
  for (const [sym, mesh] of glowMeshes) {
    const d = raycaster.ray.distanceToPoint(mesh.position);
    if (d < 0.55 && d < bestD) {
      bestD = d;
      best = sym;
    }
  }
  return best;
}

function setFocus(sym) {
  focus = sym;
  STOCKS.forEach((s) => {
    const mat = glowMats.get(s.sym);
    const mesh = glowMeshes.get(s.sym);
    const lit = !sym || s.sym === sym || EDGES.some(
      (e) => (e.a === sym && e.b === s.sym) || (e.b === sym && e.a === s.sym)
    );
    mat.opacity = lit ? (s.sym === sym ? 1 : 0.55) : 0.12;
    mesh.scale.setScalar(s.sym === sym ? 1.6 : lit ? 1 : 0.7);
  });
  beams.forEach(({ mat, edge }) => {
    const on = sym && (edge.a === sym || edge.b === sym);
    mat.opacity = on ? edge.r * 0.95 : edge.r * 0.08;
  });
  if (sym) {
    const p = positions.get(sym);
    camTarget = p.clone().add(new THREE.Vector3(0, 0.4, 3.2));
    lookTarget = p.clone();
    narrative.set(sym, narrateFocus(sym));
  } else {
    camTarget = new THREE.Vector3(0, 0, 14);
    lookTarget = new THREE.Vector3(0, 0, 0);
    narrative.set(null, "Drift through the constellation. Each beam is two names that breathe together.");
  }
}

canvas.addEventListener("pointermove", (e) => {
  const sym = pickSym(e.clientX, e.clientY);
  if (sym !== focus) setFocus(sym);
});
canvas.addEventListener("pointerleave", () => setFocus(null));

let t0 = performance.now();
function loop(now) {
  const t = (now - t0) * 0.001;
  beamGroup.rotation.y = t * 0.04;
  dust.rotation.y = t * 0.01;

  beams.forEach(({ mat, edge, line }) => {
    const pulse = 0.45 + Math.sin(t * 2 + line.userData.phase) * 0.25;
    const base = focus && (edge.a === focus || edge.b === focus) ? edge.r * 0.95 : edge.r * 0.12;
    mat.opacity = base * (0.7 + pulse * 0.3);
  });

  camera.position.lerp(camTarget, 0.04);
  const curLook = new THREE.Vector3();
  camera.getWorldDirection(curLook);
  camera.lookAt(lookTarget);

  renderer.render(scene, camera);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

addEventListener("resize", () => {
  const h = innerHeight - 48;
  camera.aspect = innerWidth / h;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, h);
});

setFocus(null);

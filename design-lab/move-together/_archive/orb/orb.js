import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js";
import {
  STOCKS,
  EDGES,
  mountChrome,
  mountNarrative,
  narrateFocus,
  narrateLink,
  LAB_NOTE,
  edgesFor,
  other,
} from "/design-lab/move-together/_together-mock.js";

mountChrome("Living Intelligence Orb", "05");
const narrative = mountNarrative("narrative");

const stage = document.getElementById("stage");
const canvas = document.createElement("canvas");
canvas.className = "mt-canvas";
stage.appendChild(canvas);
document.body.insertAdjacentHTML("beforeend", `<p class="mt-badge">${LAB_NOTE}</p>`);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
camera.position.z = 5.5;

const orbGeo = new THREE.IcosahedronGeometry(1.35, 64);
const orbMat = new THREE.MeshPhysicalMaterial({
  color: 0x1a1a2e,
  metalness: 0.4,
  roughness: 0.15,
  transmission: 0.6,
  thickness: 1.2,
  emissive: 0xd4a85a,
  emissiveIntensity: 0.08,
  transparent: true,
  opacity: 0.92,
});
const orb = new THREE.Mesh(orbGeo, orbMat);
scene.add(orb);

const innerGlow = new THREE.Mesh(
  new THREE.SphereGeometry(1.1, 32, 32),
  new THREE.MeshBasicMaterial({
    color: 0xd4a85a,
    transparent: true,
    opacity: 0.12,
    blending: THREE.AdditiveBlending,
  })
);
scene.add(innerGlow);

const ringGroup = new THREE.Group();
scene.add(ringGroup);

const satellites = [];
const satGeo = new THREE.SphereGeometry(0.08, 12, 12);

STOCKS.slice(0, 10).forEach((s, i) => {
  const mat = new THREE.MeshBasicMaterial({
    color: new THREE.Color().setHSL(s.hue / 360, 0.75, 0.6),
  });
  const mesh = new THREE.Mesh(satGeo, mat);
  mesh.userData = { sym: s.sym, angle: (i / 10) * Math.PI * 2, tier: 1.55 + (i % 3) * 0.12 };
  mesh.visible = false;
  ringGroup.add(mesh);
  satellites.push(mesh);
});

const arcMat = new THREE.LineBasicMaterial({
  color: 0xd4a85a,
  transparent: true,
  opacity: 0.4,
  blending: THREE.AdditiveBlending,
});
const arcs = [];

let focus = null;
let breath = 0;
let morph = 0;

function showOrb(sym) {
  focus = sym;
  morph = 0;
  satellites.forEach((m) => {
    m.visible = Boolean(sym);
  });
  if (!sym) {
    arcs.forEach((a) => ringGroup.remove(a));
    arcs.length = 0;
    narrative.set(null, "The orb breathes with the whole market. Hover to morph.");
    return;
  }
  const links = edgesFor(sym, 0.55).slice(0, 5);
  const focusMesh = satellites.find((m) => m.userData.sym === sym);
  if (focusMesh) focusMesh.visible = true;

  links.forEach((e, i) => {
    const peer = other(sym, e);
    const sat = satellites.find((m) => m.userData.sym === peer);
    if (sat) sat.visible = true;
    const curve = new THREE.QuadraticBezierCurve3(
      new THREE.Vector3(0, 0, 1.4),
      new THREE.Vector3(0.3, 0.3, 1.8),
      new THREE.Vector3(0, 0, 2.1)
    );
    const geo = new THREE.BufferGeometry().setFromPoints(curve.getPoints(24));
    const line = new THREE.Line(geo, arcMat.clone());
    line.material.opacity = e.r * 0.7;
    line.rotation.y = (i / links.length) * Math.PI * 2;
    ringGroup.add(line);
    arcs.push(line);
  });

  narrative.set(sym, narrateFocus(sym));
  if (links[0]) {
    const e0 = links[0];
    narrative.set(sym, `${narrateFocus(sym)} ${narrateLink(sym, other(sym, e0), e0.r)}`);
  }
}

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();

canvas.addEventListener("pointermove", (e) => {
  pointer.x = (e.clientX / innerWidth) * 2 - 1;
  pointer.y = -((e.clientY - 48) / (innerHeight - 48)) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects(satellites.filter((m) => m.visible));
  if (hits.length) showOrb(hits[0].object.userData.sym);
  else if (!focus) showOrb(null);
});

canvas.addEventListener("pointerleave", () => showOrb(null));

function resize() {
  const w = innerWidth;
  const h = innerHeight - 48;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
}

let t0 = performance.now();
function loop(now) {
  const t = (now - t0) * 0.001;
  breath = 1 + Math.sin(t * 1.2) * 0.04;
  orb.scale.setScalar(breath);
  innerGlow.scale.setScalar(breath * 0.95);
  orb.rotation.y = t * 0.15;
  orb.rotation.x = Math.sin(t * 0.3) * 0.1;
  ringGroup.rotation.y = t * 0.25;

  morph = Math.min(1, morph + 0.02);
  satellites.forEach((m) => {
    if (!m.visible) return;
    const a = m.userData.angle + t * 0.5;
    const r = m.userData.tier + (focus ? morph * 0.35 : 0);
    m.position.set(Math.cos(a) * r, Math.sin(a * 2) * 0.2, Math.sin(a) * r);
  });

  arcs.forEach((line, i) => {
    line.rotation.y += 0.008;
    line.material.opacity = 0.25 + Math.sin(t * 2 + i) * 0.15;
  });

  renderer.render(scene, camera);
  requestAnimationFrame(loop);
}

resize();
requestAnimationFrame(loop);
addEventListener("resize", resize);
showOrb(null);

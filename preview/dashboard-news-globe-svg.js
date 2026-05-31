/**
 * Digital Earth SVG for News narrative (preview / design lab).
 * @module preview/dashboard-news-globe-svg
 */

/** @typedef {{ usEu: string, inflation: string, ai: string, energy: string }} FlowArcPaths */

/** Low-poly mesh on landmasses — cyan wireframe, reference style. */
const MESH_AMERICAS = `
  <polygon points="52,78 64,72 72,82 68,94 56,92" fill="rgba(55,140,220,0.12)" stroke="rgba(110,200,255,0.45)" stroke-width="0.5"/>
  <polygon points="64,72 78,74 82,86 72,92 68,82" fill="rgba(55,140,220,0.1)" stroke="rgba(110,200,255,0.42)" stroke-width="0.5"/>
  <polygon points="78,74 90,80 88,92 82,86" fill="rgba(55,140,220,0.08)" stroke="rgba(110,200,255,0.4)" stroke-width="0.5"/>
  <polygon points="56,92 68,94 66,108 58,112 50,102" fill="rgba(55,140,220,0.1)" stroke="rgba(110,200,255,0.44)" stroke-width="0.5"/>
  <polygon points="68,94 80,98 78,112 66,108" fill="rgba(55,140,220,0.09)" stroke="rgba(110,200,255,0.42)" stroke-width="0.5"/>
  <polygon points="50,102 58,112 54,128 46,118" fill="rgba(55,140,220,0.08)" stroke="rgba(110,200,255,0.38)" stroke-width="0.5"/>
  <polygon points="58,112 66,108 68,124 62,136 54,128" fill="rgba(55,140,220,0.1)" stroke="rgba(110,200,255,0.44)" stroke-width="0.5"/>
  <polygon points="66,108 78,112 76,128 68,124" fill="rgba(55,140,220,0.09)" stroke="rgba(110,200,255,0.4)" stroke-width="0.5"/>
  <polygon points="62,136 72,132 74,148 66,154 58,148" fill="rgba(55,140,220,0.1)" stroke="rgba(110,200,255,0.42)" stroke-width="0.5"/>
  <polygon points="72,132 78,124 82,140 74,148" fill="rgba(55,140,220,0.08)" stroke="rgba(110,200,255,0.38)" stroke-width="0.5"/>
  <polygon points="44,88 52,78 56,92 50,102" fill="rgba(55,140,220,0.07)" stroke="rgba(110,200,255,0.36)" stroke-width="0.5"/>
  <polygon points="82,98 92,104 90,116 80,112" fill="rgba(55,140,220,0.08)" stroke="rgba(110,200,255,0.4)" stroke-width="0.5"/>
`;

const MESH_EURO_AF = `
  <polygon points="132,82 144,78 152,88 148,98 136,96" fill="rgba(55,140,220,0.1)" stroke="rgba(110,200,255,0.42)" stroke-width="0.5"/>
  <polygon points="144,78 158,84 160,96 152,88" fill="rgba(55,140,220,0.08)" stroke="rgba(110,200,255,0.4)" stroke-width="0.5"/>
  <polygon points="136,96 148,98 146,112 134,108" fill="rgba(55,140,220,0.09)" stroke="rgba(110,200,255,0.4)" stroke-width="0.5"/>
  <polygon points="134,108 146,112 144,128 132,124" fill="rgba(55,140,220,0.08)" stroke="rgba(110,200,255,0.38)" stroke-width="0.5"/>
  <polygon points="132,124 144,128 140,142 128,136" fill="rgba(55,140,220,0.07)" stroke="rgba(110,200,255,0.36)" stroke-width="0.5"/>
`;

/** Outer data-network shell (extends slightly beyond sphere). */
const NETWORK_SHELL = `
  <circle cx="110" cy="110" r="82" fill="none" stroke="rgba(70,150,230,0.12)" stroke-width="0.75" stroke-dasharray="3 5"/>
  <path d="M 38 110 Q 72 48 110 34 Q 148 48 182 110" fill="none" stroke="rgba(90,175,255,0.2)" stroke-width="0.6"/>
  <path d="M 38 110 Q 72 172 110 186 Q 148 172 182 110" fill="none" stroke="rgba(90,175,255,0.16)" stroke-width="0.6"/>
  <path d="M 34 88 Q 110 28 186 92" fill="none" stroke="rgba(90,175,255,0.14)" stroke-width="0.5" stroke-dasharray="2 4"/>
  <path d="M 34 132 Q 110 192 186 128" fill="none" stroke="rgba(90,175,255,0.14)" stroke-width="0.5" stroke-dasharray="2 4"/>
  <line x1="52" y1="52" x2="168" y2="72" stroke="rgba(100,185,255,0.22)" stroke-width="0.55"/>
  <line x1="48" y1="168" x2="164" y2="148" stroke="rgba(100,185,255,0.18)" stroke-width="0.55"/>
  <line x1="110" y1="28" x2="110" y2="192" stroke="rgba(100,185,255,0.12)" stroke-width="0.5" stroke-dasharray="2 3"/>
  <circle class="news-globe-visual__data-node" cx="52" cy="52" r="2.2" fill="#8ee0ff"/>
  <circle class="news-globe-visual__data-node" cx="168" cy="72" r="2" fill="#7ad4ff"/>
  <circle class="news-globe-visual__data-node" cx="186" cy="110" r="2.3" fill="#9ee8ff"/>
  <circle class="news-globe-visual__data-node" cx="164" cy="148" r="2" fill="#7ad4ff"/>
  <circle class="news-globe-visual__data-node" cx="110" cy="192" r="2.1" fill="#8ee0ff"/>
  <circle class="news-globe-visual__data-node" cx="48" cy="168" r="2" fill="#7ad4ff"/>
  <circle class="news-globe-visual__data-node" cx="34" cy="110" r="2.2" fill="#9ee8ff"/>
  <circle class="news-globe-visual__data-node" cx="110" cy="28" r="2.4" fill="#a8ecff"/>
`;

/**
 * @param {string} storyId
 * @param {FlowArcPaths} arcs
 * @returns {string}
 */
export function renderDigitalGlobeSvg(storyId, arcs) {
  const id = String(storyId).replace(/[^a-z0-9-]/gi, "") || "default";
  const clipId = `newsGlobeClip-${id}`;
  const fillId = `newsGlobeFill-${id}`;
  const shineId = `newsGlobeShine-${id}`;
  const flowId = `newsFlowGrad-${id}`;
  const glowId = `newsArcGlow-${id}`;
  const atmosId = `newsGlobeAtmos-${id}`;

  return `
    <defs>
      <radialGradient id="${fillId}" cx="36%" cy="30%" r="68%">
        <stop offset="0%" stop-color="rgba(72, 130, 210, 0.55)"/>
        <stop offset="42%" stop-color="rgba(18, 38, 72, 0.96)"/>
        <stop offset="100%" stop-color="rgba(4, 8, 18, 1)"/>
      </radialGradient>
      <radialGradient id="${shineId}" cx="30%" cy="26%" r="52%">
        <stop offset="0%" stop-color="rgba(160, 210, 255, 0.35)"/>
        <stop offset="100%" stop-color="rgba(160, 210, 255, 0)"/>
      </radialGradient>
      <linearGradient id="${flowId}" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="rgba(80, 170, 255, 0.2)"/>
        <stop offset="50%" stop-color="rgba(140, 220, 255, 1)"/>
        <stop offset="100%" stop-color="rgba(80, 170, 255, 0.35)"/>
      </linearGradient>
      <filter id="${glowId}" x="-40%" y="-40%" width="180%" height="180%">
        <feGaussianBlur stdDeviation="2.8" result="b"/>
        <feMerge>
          <feMergeNode in="b"/>
          <feMergeNode in="SourceGraphic"/>
        </feMerge>
      </filter>
      <filter id="${atmosId}" x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation="6" result="blur"/>
        <feMerge>
          <feMergeNode in="blur"/>
          <feMergeNode in="SourceGraphic"/>
        </feMerge>
      </filter>
      <clipPath id="${clipId}">
        <circle cx="110" cy="110" r="76"/>
      </clipPath>
    </defs>

    <circle class="news-globe-visual__atmos" cx="110" cy="110" r="94" fill="rgba(40,100,180,0.06)" filter="url(#${atmosId})"/>
    <circle class="news-globe-visual__halo" cx="110" cy="110" r="90" fill="none" stroke="rgba(80, 160, 255, 0.14)" stroke-width="1"/>

    <g class="news-globe-visual__rig" data-globe-rig>
      <g class="news-globe-visual__globe">
        <circle class="news-globe-visual__sphere" cx="110" cy="110" r="76" fill="url(#${fillId})" stroke="rgba(100, 175, 255, 0.22)" stroke-width="1"/>
        <circle class="news-globe-visual__rim" cx="110" cy="110" r="76" fill="none" stroke="rgba(120, 195, 255, 0.35)" stroke-width="1.25"/>

        <g class="news-globe-visual__graticule" clip-path="url(#${clipId})">
          <ellipse cx="110" cy="110" rx="76" ry="20" fill="none" stroke="rgba(90, 165, 255, 0.14)" stroke-width="0.55"/>
          <ellipse cx="110" cy="110" rx="76" ry="36" fill="none" stroke="rgba(90, 165, 255, 0.12)" stroke-width="0.55"/>
          <ellipse cx="110" cy="110" rx="76" ry="52" fill="none" stroke="rgba(90, 165, 255, 0.1)" stroke-width="0.55"/>
          <ellipse cx="110" cy="110" rx="76" ry="66" fill="none" stroke="rgba(90, 165, 255, 0.08)" stroke-width="0.55"/>
          <ellipse cx="110" cy="110" rx="22" ry="76" fill="none" stroke="rgba(90, 165, 255, 0.11)" stroke-width="0.55"/>
          <ellipse cx="110" cy="110" rx="42" ry="76" fill="none" stroke="rgba(90, 165, 255, 0.1)" stroke-width="0.55"/>
          <ellipse cx="110" cy="110" rx="62" ry="76" fill="none" stroke="rgba(90, 165, 255, 0.09)" stroke-width="0.55"/>
          <line x1="110" y1="34" x2="110" y2="186" stroke="rgba(90, 165, 255, 0.1)" stroke-width="0.55"/>
          <line x1="52" y1="110" x2="168" y2="110" stroke="rgba(90, 165, 255, 0.1)" stroke-width="0.55"/>
        </g>

        <g class="news-globe-visual__lands" clip-path="url(#${clipId})">
          <path class="news-globe-visual__land" d="M 44 80 Q 40 100 50 118 Q 64 132 74 126 Q 82 108 78 90 Q 70 76 58 74 Q 46 72 44 80 Z" fill="rgba(35, 95, 165, 0.35)"/>
          <path class="news-globe-visual__land" d="M 56 108 Q 54 124 62 148 Q 72 158 78 142 Q 80 120 74 108 Q 66 102 56 108 Z" fill="rgba(35, 95, 165, 0.32)"/>
          <path class="news-globe-visual__land" d="M 128 80 Q 154 86 162 100 Q 158 116 142 114 Q 130 106 126 92 Q 126 82 128 80 Z" fill="rgba(35, 95, 165, 0.28)"/>
          <path class="news-globe-visual__land" d="M 130 116 Q 148 122 150 140 Q 140 154 128 148 Q 124 132 130 116 Z" fill="rgba(35, 95, 165, 0.24)"/>
        </g>

        <g class="news-globe-visual__mesh" clip-path="url(#${clipId})">
          ${MESH_AMERICAS}
          ${MESH_EURO_AF}
        </g>

        <circle class="news-globe-visual__shine" cx="110" cy="110" r="76" fill="url(#${shineId})" clip-path="url(#${clipId})"/>
      </g>

      <g class="news-globe-visual__network">${NETWORK_SHELL}</g>

      <g class="news-globe-visual__region-glows" clip-path="url(#${clipId})">
        <circle class="news-globe-visual__region-glow news-globe-visual__region-glow--us" cx="68" cy="104" r="24"/>
        <circle class="news-globe-visual__region-glow news-globe-visual__region-glow--eu" cx="154" cy="100" r="22"/>
        <circle class="news-globe-visual__region-glow news-globe-visual__region-glow--gulf" cx="128" cy="114" r="18"/>
      </g>

      <g class="news-globe-visual__flows">
        <g class="news-globe-visual__flow-set news-globe-visual__flow-set--us-eu">
          <path class="news-globe-visual__arc-base" d="${arcs.usEu}" fill="none" stroke="rgba(100,180,255,0.12)" stroke-width="1.5"/>
          <path class="news-globe-visual__arc-glow" d="${arcs.usEu}" fill="none" stroke="rgba(120,200,255,0.5)" stroke-width="5" filter="url(#${glowId})" opacity="0.5"/>
          <path class="news-globe-visual__arc-flow" d="${arcs.usEu}" fill="none" stroke="url(#${flowId})" stroke-width="2" pathLength="100" stroke-dasharray="12 88" stroke-linecap="round"/>
          <circle class="news-globe-visual__particle" r="2.2" fill="#9ee8ff"><animateMotion dur="5s" repeatCount="indefinite" path="${arcs.usEu}"/></circle>
          <circle class="news-globe-visual__particle news-globe-visual__particle--dim" r="1.5" fill="#6ecfff"><animateMotion dur="5s" begin="1.6s" repeatCount="indefinite" path="${arcs.usEu}"/></circle>
        </g>
        <g class="news-globe-visual__flow-set news-globe-visual__flow-set--inflation">
          <path class="news-globe-visual__arc-base" d="${arcs.inflation}" fill="none" stroke="rgba(100,180,255,0.1)" stroke-width="1.5"/>
          <path class="news-globe-visual__arc-flow" d="${arcs.inflation}" fill="none" stroke="url(#${flowId})" stroke-width="2" pathLength="100" stroke-dasharray="10 90" stroke-linecap="round"/>
          <circle class="news-globe-visual__pulse" cx="72" cy="108" r="14" fill="none" stroke="rgba(120,200,255,0.4)" stroke-width="1"/>
          <circle class="news-globe-visual__pulse news-globe-visual__pulse--delay" cx="72" cy="108" r="22" fill="none" stroke="rgba(90,170,255,0.22)" stroke-width="1"/>
        </g>
        <g class="news-globe-visual__flow-set news-globe-visual__flow-set--ai">
          <path class="news-globe-visual__arc-base" d="${arcs.ai}" fill="none" stroke="rgba(100,180,255,0.1)" stroke-width="1.5"/>
          <path class="news-globe-visual__arc-flow" d="${arcs.ai}" fill="none" stroke="url(#${flowId})" stroke-width="2" pathLength="100" stroke-dasharray="10 90" stroke-linecap="round"/>
          <circle class="news-globe-visual__particle" r="2" fill="#9ee8ff"><animateMotion dur="3.5s" repeatCount="indefinite" path="${arcs.ai}"/></circle>
        </g>
        <g class="news-globe-visual__flow-set news-globe-visual__flow-set--energy">
          <path class="news-globe-visual__arc-base" d="${arcs.energy}" fill="none" stroke="rgba(100,180,255,0.1)" stroke-width="1.5"/>
          <path class="news-globe-visual__arc-glow" d="${arcs.energy}" fill="none" stroke="rgba(100,190,255,0.4)" stroke-width="5" filter="url(#${glowId})" opacity="0.45"/>
          <path class="news-globe-visual__arc-flow" d="${arcs.energy}" fill="none" stroke="url(#${flowId})" stroke-width="2" pathLength="100" stroke-dasharray="12 88" stroke-linecap="round"/>
          <circle class="news-globe-visual__particle" r="2" fill="#9ee8ff"><animateMotion dur="4.5s" repeatCount="indefinite" path="${arcs.energy}"/></circle>
        </g>
      </g>

      <circle class="news-globe-visual__node news-globe-visual__node--us" cx="68" cy="104" r="4"/>
      <circle class="news-globe-visual__node news-globe-visual__node--eu" cx="154" cy="100" r="3.5"/>
      <circle class="news-globe-visual__node news-globe-visual__node--gulf" cx="128" cy="114" r="3"/>
    </g>
  `;
}

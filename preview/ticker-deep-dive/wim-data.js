/**
 * WIM narrative + contagion peer data (extracted from index.html).
 * @module preview/ticker-deep-dive/wim-data
 */

/** @typedef {{ name: string, price: string, chg: string, chgColor: string, summary: string, reasons: [string, string, string][], sym: string, trend: number }} WimEntry */

/** @type {Record<string, WimEntry>} */
export const WIM_DB = {
  NVDA: {
    name: "NVIDIA CORP · NASDAQ",
    price: "487.32",
    chg: "−14.86  (−2.96%)",
    chgColor: "#ff5b6e",
    summary: `NVDA is selling off today primarily on <b>renewed concern around AI capex sustainability</b>. A <b>major hyperscaler signalled a pause</b> in next-quarter datacentre orders, which the market read as a leading indicator for the broader AI-infrastructure complex. Compounding this, <b>10Y yields ticked back above 4.42%</b>, increasing duration pressure on long-duration growth names. Sector-wide weakness is showing classic reaction-chain patterns. Historically, similar setups have led to <b>−4 to −7% drawdowns over 5 sessions</b> before stabilising - though outcomes vary materially with macro tone.`,
    reasons: [
      ["AI capex sustainability concerns", "A top-3 hyperscaler signalled a Q3 datacentre order pause; market read this as a leading indicator for the broader AI infrastructure complex.", "42%"],
      ["Rates tailwind reverses", "10Y yields back above 4.42% increases duration pressure on long-duration growth names. Mechanical, not narrative.", "24%"],
      ["Reaction-chain pressure", "AMD, AVGO, MU all weak in sympathy. Once correlated names break key levels, baskets follow.", "18%"],
      ["Risk-off positioning into Friday", "Quiet de-grossing visible in equity/bond and growth/value rotation signatures.", "11%"],
      ["Technical level breach", "Stock broke its 50-day moving average on above-average volume - algos respond.", "5%"],
    ],
    sym: "NVDA",
    trend: -0.4,
  },
  TSLA: {
    name: "TESLA INC · NASDAQ",
    price: "246.18",
    chg: "−3.54  (−1.42%)",
    chgColor: "#ff5b6e",
    summary: `TSLA is trading lower on <b>softer-than-expected European EV registrations</b> data - a leading indicator for global demand. The decline is happening against a backdrop of <b>broader risk-off rotation</b>, with rates rising and AI infrastructure under pressure. Historically, Tesla's beta to its own narrative is high - meaning small demand signals cascade into outsized moves.`,
    reasons: [
      ["EU EV registrations soft", "April registrations -8% YoY - read-through to global EV demand assumptions.", "38%"],
      ["Margin compression narrative", "Sell-side pieces this morning revisited price-cut margin scenarios.", "22%"],
      ["Risk-off broader market", "Negative beta to AI infrastructure weakness; correlation to QQQ elevated.", "19%"],
      ["Options positioning", "Put-skew widened pre-open; market makers hedging gamma into close.", "14%"],
      ["Technical setup", "Failure at 252 resistance triggered short-term momentum reversal.", "7%"],
    ],
    sym: "TSLA",
    trend: -0.25,
  },
  AAPL: {
    name: "APPLE INC · NASDAQ",
    price: "219.84",
    chg: "+0.48  (+0.22%)",
    chgColor: "#3ddc97",
    summary: `AAPL is trading marginally higher in a <b>defensive bid</b> as the broader AI-infrastructure complex weakens. Apple's relative outperformance today reflects its <b>quality-defensive characteristics</b> - strong balance sheet, services moat, lower sensitivity to AI capex narrative. Overall move is small and <b>within typical session noise</b>.`,
    reasons: [
      ["Defensive rotation", "Quality-defensive names bid as AI infra weakens; flows visible from sector ETFs.", "34%"],
      ["Services momentum", "Continued strength in services revenue commentary from sell-side.", "22%"],
      ["Lower AI exposure", "Less direct AI capex linkage means less duration risk in current regime.", "21%"],
      ["Buyback program", "Ongoing repurchases provide consistent bid support.", "15%"],
      ["Technical strength", "Holding above 50-day moving average; constructive base building.", "8%"],
    ],
    sym: "AAPL",
    trend: 0.05,
  },
  META: {
    name: "META PLATFORMS · NASDAQ",
    price: "568.42",
    chg: "−4.82  (−0.84%)",
    chgColor: "#ff5b6e",
    summary: `META is drifting lower on <b>AI capex sympathy</b> with NVDA and the broader hyperscaler narrative. Meta's own AI infrastructure spend has been a market focus, so any sign of capex moderation across the sector reads through to its margins narrative. Move is <b>contained relative to peers</b>, suggesting positioning is less stretched.`,
    reasons: [
      ["AI capex narrative sympathy", "Hyperscaler pause read across to Meta's own AI infra spending plans.", "36%"],
      ["Rates pressure", "Long-duration growth names broadly under pressure on 4.42% 10Y print.", "24%"],
      ["Ad-spend caution", "Quiet sell-side notes flagging Q2 ad pricing softness in display.", "18%"],
      ["Sector correlation", "High beta to QQQ basket weakness today.", "15%"],
      ["Options skew", "Put-skew widening modestly; defensive flows into Friday.", "7%"],
    ],
    sym: "META",
    trend: -0.15,
  },
  SPY: {
    name: "SPDR S&P 500 ETF · NYSE ARCA",
    price: "512.84",
    chg: "+1.74  (+0.34%)",
    chgColor: "#3ddc97",
    summary: `SPY is masking significant <b>internal rotation</b> with a slightly green tape. Beneath the index-level calm, AI infrastructure is selling off hard while energy and defensives bid. <b>Breadth is poor</b> - fewer than 40% of constituents are positive - typical of late-stage rotational regimes.`,
    reasons: [
      ["Rotation, not direction", "AI infra weakness offset by energy + defensive bid; index neutral.", "42%"],
      ["Yields back above 4.42%", "Mechanical pressure on long-duration; financial sector benefits.", "24%"],
      ["Poor breadth", "<40% of constituents positive - masked weakness in equal-weight terms.", "18%"],
      ["Volume light", "Friday low-volume drift; positioning more important than narrative.", "11%"],
      ["VIX elevated", "VIX above 22 suggests hedging activity, not panic.", "5%"],
    ],
    sym: "SPY",
    trend: 0.02,
  },
  GOOGL: {
    name: "ALPHABET INC · NASDAQ",
    price: "182.46",
    chg: "−1.92  (−1.04%)",
    chgColor: "#ff5b6e",
    summary: `GOOGL is trading lower on <b>renewed AI competitive pressure</b> narrative - sell-side notes flagging share-of-search erosion to AI-native interfaces. The decline maps onto broader hyperscaler capex concerns, with Alphabet's own AI infrastructure spend in focus. <b>Cloud growth deceleration whispers</b> are also weighing on multiple.`,
    reasons: [
      ["Search share erosion narrative", "Renewed concern over AI-native search alternatives capturing query share.", "32%"],
      ["Hyperscaler capex sympathy", "Read-through from peer pause signals to Alphabet's own infra trajectory.", "26%"],
      ["Cloud deceleration whispers", "Quiet sell-side notes flagging Q2 cloud growth moderation.", "20%"],
      ["Rates pressure", "Long-duration growth weakness on 10Y back above 4.42%.", "15%"],
      ["Regulatory overhang", "Antitrust case headlines provide steady background pressure.", "7%"],
    ],
    sym: "GOOGL",
    trend: -0.18,
  },
  AMD: {
    name: "ADVANCED MICRO DEVICES · NASDAQ",
    price: "164.28",
    chg: "−5.86  (−3.44%)",
    chgColor: "#ff5b6e",
    summary: `AMD is selling off in <b>direct sympathy with NVDA</b> on AI capex sustainability concerns. As the #2 AI accelerator, AMD has high beta to the AI-infrastructure narrative - when datacentre order pauses surface, AMD typically moves 1.2-1.5x NVDA's magnitude. <b>MI300 ramp expectations</b> are the key sensitivity here.`,
    reasons: [
      ["NVDA sympathy beta", "High correlation to NVDA on AI capex headlines; classic 1.3x magnitude move.", "38%"],
      ["MI300 ramp risk", "Hyperscaler order pause threatens AMD's 2025 AI accelerator ramp story.", "24%"],
      ["Datacenter mix concentration", ">30% revenue exposure to AI-driven datacenter demand makes AMD highly sensitive.", "18%"],
      ["Sector rotation out of semis", "SOX index breaking key support; basket-level selling.", "13%"],
      ["Technical breakdown", "Lost 50-day MA on heavy volume; momentum funds rotating out.", "7%"],
    ],
    sym: "AMD",
    trend: -0.45,
  },
  MSFT: {
    name: "MICROSOFT CORP · NASDAQ",
    price: "412.74",
    chg: "−2.18  (−0.53%)",
    chgColor: "#ff5b6e",
    summary: `MSFT is drifting lower on <b>Azure capex narrative sympathy</b>, with the hyperscaler pause story directly relevant to Microsoft's own AI infrastructure spending plans. The move is <b>contained relative to AMD/NVDA</b>, reflecting MSFT's diversified revenue base and defensive software characteristics that buffer against pure-play AI exposure.`,
    reasons: [
      ["Azure capex focus", "Hyperscaler pause directly relevant to Microsoft's own AI infra spend trajectory.", "30%"],
      ["Copilot monetisation timing", "Sell-side debate on AI revenue ramp vs capex burden in FY25.", "24%"],
      ["Defensive software offset", "Diversified revenue base buffers vs pure-play AI exposure - softer move.", "22%"],
      ["Rates pressure", "Long-duration growth weakness on yields above 4.42%.", "15%"],
      ["Index inclusion flows", "Heavy QQQ weighting means basket-level selling shows up here too.", "9%"],
    ],
    sym: "MSFT",
    trend: -0.1,
  },
  AMZN: {
    name: "AMAZON.COM INC · NASDAQ",
    price: "186.92",
    chg: "−1.46  (−0.77%)",
    chgColor: "#ff5b6e",
    summary: `AMZN is trading lower on <b>AWS capex sympathy</b> with the broader hyperscaler narrative - Amazon Web Services is at the centre of the AI infrastructure pause story. <b>Retail margin commentary</b> from a major peer this morning is also weighing on the consumer side of the business. Move is moderate, reflecting the dual-engine nature of the company.`,
    reasons: [
      ["AWS capex narrative", "AWS is the original hyperscaler - central to AI infra pause story.", "32%"],
      ["Retail margin pressure", "Peer comments on Q2 e-commerce pricing read across.", "22%"],
      ["Advertising secondary read", "Display ad pricing softness whispers from sell-side notes.", "18%"],
      ["Rates headwind", "Duration pressure on long-duration cash flows.", "16%"],
      ["Logistics cost watch", "Diesel + wage inflation chatter into Q2 print.", "12%"],
    ],
    sym: "AMZN",
    trend: -0.12,
  },
  NFLX: {
    name: "NETFLIX INC · NASDAQ",
    price: "682.14",
    chg: "+3.24  (+0.48%)",
    chgColor: "#3ddc97",
    summary: `NFLX is trading marginally higher in a <b>defensive content bid</b> as the AI-infrastructure complex weakens. Netflix's relative outperformance reflects its <b>no-AI-capex profile</b> - pure subscription cash flow story with no exposure to the datacentre order pause narrative. Ad-tier monetisation continues to be the key forward driver.`,
    reasons: [
      ["No AI-capex exposure", "Pure content + subscription model insulates from hyperscaler pause narrative.", "34%"],
      ["Ad-tier ramp narrative", "Continued sell-side optimism on ad-tier ARPU expansion path.", "24%"],
      ["Defensive rotation flows", "Quality-defensive flow as AI infra weakens; visible in sector ETFs.", "20%"],
      ["Subscriber momentum", "Recent quarter beat sub adds - narrative still constructive.", "14%"],
      ["Technical strength", "Holding key support with constructive higher-low pattern.", "8%"],
    ],
    sym: "NFLX",
    trend: 0.08,
  },
  SNDK: {
    name: "SANDISK CORP · NASDAQ",
    price: "48.62",
    chg: "−2.84  (−5.52%)",
    chgColor: "#ff5b6e",
    summary: `SNDK is selling off sharply on <b>NAND pricing pressure concerns</b> - read-through from the AI-capex slowdown narrative is hitting flash storage demand expectations. Recently spun off from Western Digital, SNDK trades with <b>elevated single-name volatility</b> as the float matures and the story is still being built with sell-side. AI datacentre storage demand is the key sensitivity.`,
    reasons: [
      ["NAND pricing pressure", "Hyperscaler capex pause threatens flash storage pricing recovery thesis.", "34%"],
      ["Datacenter storage exposure", "Enterprise SSD demand directly tied to AI infrastructure build-out.", "24%"],
      ["Spinoff float dynamics", "Recent WDC spinoff - elevated vol, sell-side coverage still being built.", "18%"],
      ["Memory cycle correlation", "High beta to MU and SK Hynix on memory cycle concerns.", "16%"],
      ["Technical fragility", "Limited support history as standalone ticker - algos cautious.", "8%"],
    ],
    sym: "SNDK",
    trend: -0.55,
  },
};

export const CONTAGION_PEERS = {
  NVDA: ["AMD", "AVGO", "MU", "MSFT", "META", "QQQ", "SOXX"],
  TSLA: ["F", "GM", "LCID", "RIVN", "NIO", "QQQ", "XLY"],
  AAPL: ["MSFT", "QQQ", "QCOM", "AVGO", "SPY", "HPQ"],
  META: ["GOOGL", "SNAP", "PINS", "NFLX", "QQQ", "NVDA"],
  GOOGL: ["META", "MSFT", "AMZN", "SNAP", "QQQ", "NVDA"],
  AMD: ["NVDA", "AVGO", "MU", "INTC", "SOXX", "TSM", "QQQ"],
  MSFT: ["GOOGL", "AAPL", "AMZN", "META", "QQQ", "NVDA"],
  AMZN: ["MSFT", "GOOGL", "META", "NFLX", "WMT", "QQQ"],
  NFLX: ["DIS", "CMCSA", "META", "GOOGL", "SPOT", "QQQ"],
  SNDK: ["MU", "WDC", "STX", "AMD", "NVDA", "QQQ"],
  SPY: ["QQQ", "DIA", "IWM", "XLE", "XLK", "XLF", "VIX"],
  AVGO: ["NVDA", "AMD", "MU", "QCOM", "TSM", "SOXX", "QQQ"],
  MU: ["NVDA", "AMD", "AVGO", "WDC", "STX", "SOXX", "QQQ"],
  QQQ: ["SPY", "NVDA", "MSFT", "AAPL", "META", "GOOGL", "AMZN"],
  SOXX: ["NVDA", "AMD", "AVGO", "MU", "TSM", "INTC", "QCOM"],
  F: ["GM", "TSLA", "STLA", "TM", "HMC", "XLY"],
  GM: ["F", "TSLA", "STLA", "TM", "HMC", "XLY"],
  INTC: ["AMD", "NVDA", "AVGO", "MU", "TSM", "SOXX"],
  TSM: ["NVDA", "AMD", "AVGO", "INTC", "SOXX", "QCOM"],
  QCOM: ["AVGO", "AMD", "TSM", "INTC", "SOXX", "AAPL"],
  DIS: ["NFLX", "CMCSA", "PARA", "WBD", "SPOT", "META"],
  SNAP: ["META", "PINS", "GOOGL", "NFLX", "SPOT", "QQQ"],
  XLE: ["CVX", "XOM", "COP", "SLB", "EOG", "SPY"],
  XLK: ["NVDA", "MSFT", "AAPL", "AVGO", "META", "SPY"],
};

/**
 * Minimal entry for panels that still read WIM shape (patterns chart) — not NVDA clone.
 * @param {string} key
 * @returns {WimEntry}
 */
function buildSectorStubEntry(key) {
  return {
    name: `${key} · EQUITY`,
    price: "—",
    chg: "—",
    chgColor: "#ffb547",
    summary: "",
    reasons: [],
    sym: key,
    trend: 0,
  };
}

/**
 * Authored WIM rows remain for legacy pattern tag mining; overview/drivers use API intel.
 * @param {string} sym
 */
export function getWimEntry(sym) {
  const key = String(sym || "NVDA").toUpperCase();
  return WIM_DB[key] || buildSectorStubEntry(key);
}

export function getContagionPeers(sym) {
  const key = String(sym || "NVDA").toUpperCase();
  if (CONTAGION_PEERS[key]) return CONTAGION_PEERS[key];
  return CONTAGION_PEERS.QQQ.filter((p) => p !== key).slice(0, 7);
}

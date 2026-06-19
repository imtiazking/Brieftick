/** Wheel System Lab — mock intelligence configs */

const STOCKS = {
  NVDA: { sym: "NVDA", name: "NVIDIA", pct: "+1.98%", role: "AI leader" },
  XOM: { sym: "XOM", name: "Exxon Mobil", pct: "+1.18%", role: "Energy" },
  JPM: { sym: "JPM", name: "JPMorgan", pct: "−0.41%", role: "Banks" },
  AMD: { sym: "AMD", name: "AMD", pct: "+1.12%", role: "Chips" },
  META: { sym: "META", name: "Meta", pct: "+0.94%", role: "Platforms" },
  AVGO: { sym: "AVGO", name: "Broadcom", pct: "+1.34%", role: "AI networking" },
  GS: { sym: "GS", name: "Goldman Sachs", pct: "+0.62%", role: "Wall Street" },
  PLTR: { sym: "PLTR", name: "Palantir", pct: "+2.41%", role: "Gov & enterprise AI" },
  KRE: { sym: "KRE", name: "Regional banks ETF", pct: "−1.05%", role: "Regional lenders" },
  TFC: { sym: "TFC", name: "Truist", pct: "−0.88%", role: "Southeast banks" },
  AAPL: { sym: "AAPL", name: "Apple", pct: "+0.48%", role: "Megacap" },
  MSFT: { sym: "MSFT", name: "Microsoft", pct: "+0.71%", role: "Cloud & AI" },
  AMZN: { sym: "AMZN", name: "Amazon", pct: "+0.55%", role: "E-commerce & cloud" },
};

/** @param {object} o */
function L(o) {
  return {
    layer: o.layer,
    headline: o.headline,
    explanation: o.explanation,
    whyItMatters: o.why,
    sectors: o.sectors,
    stocks: o.stocks,
    reaction: o.reaction,
    watchNext: o.watch,
    dive: o.dive || o.layer,
  };
}

/* ── Archive prototypes (lab only, not flagship) ───────────────── */

export const DASHBOARD_WHEEL = {
  id: "dashboard",
  title: "Dashboard Wheel 2.0",
  subtitle: "Global market picture · macro · mood · regions",
  pulseTag: "Global picture",
  pulseHeadline: "Risk-on session · US leads · Tech & energy firm",
  sections: [
    { id: "mood", label: "Mood" },
    { id: "macro", label: "Macro" },
    { id: "themes", label: "Themes" },
    { id: "regions", label: "Regions" },
    { id: "risks", label: "Risks" },
    { id: "outlook", label: "Outlook" },
  ],
  layers: {
    mood: L({
      layer: "Market mood",
      headline: "Investors are in a risk-on mood",
      explanation:
        "More stocks are rising than falling today. Defensive sectors are not leading.",
      why: "Mood sets the backdrop for everything else on the tape.",
      sectors: [
        { name: "Technology", move: "+1.2%", tone: "up" },
        { name: "Consumer disc.", move: "+0.6%", tone: "up" },
        { name: "Utilities", move: "−0.3%", tone: "dn" },
      ],
      stocks: [STOCKS.NVDA, STOCKS.META],
      reaction: "S&P 500 firm · VIX lower",
      watch: ["Breadth at close"],
      dive: "Mood",
    }),
    macro: L({
      layer: "Macro",
      headline: "AI spend and oil are the macro story",
      explanation: "Markets balance AI infrastructure spend against steady crude.",
      why: "Macro tells you which economic story the market is trading.",
      sectors: [
        { name: "Energy", move: "+0.9%", tone: "up" },
        { name: "Technology", move: "+1.2%", tone: "up" },
      ],
      stocks: [STOCKS.NVDA, STOCKS.XOM],
      reaction: "Growth assets outperform",
      watch: ["Next CPI print"],
      dive: "Macro",
    }),
    themes: L({
      layer: "Themes",
      headline: "Tech and energy are carrying the market",
      explanation: "Technology and Energy lead. Financials lag on rate sensitivity.",
      why: "Themes turn the tape into a few big stories.",
      sectors: [
        { name: "Technology", move: "+1.2%", tone: "up" },
        { name: "Energy", move: "+0.9%", tone: "up" },
      ],
      stocks: [STOCKS.NVDA, STOCKS.XOM, STOCKS.AMD],
      reaction: "Leadership narrow but clear",
      watch: ["Sector rotation"],
      dive: "Themes",
    }),
    regions: L({
      layer: "Regions",
      headline: "The US session is leading global risk",
      explanation: "US equities outperform. Europe mixed. Asia follows US tech supply chain.",
      why: "Region leadership shows where capital flows first.",
      sectors: [
        { name: "US large cap", move: "+0.7%", tone: "up" },
        { name: "Europe STOXX", move: "+0.2%", tone: "up" },
      ],
      stocks: [STOCKS.NVDA, STOCKS.META],
      reaction: "USD firm · US futures positive",
      watch: ["Asia open"],
      dive: "Regions",
    }),
    risks: L({
      layer: "Risks",
      headline: "Rates and positioning are the main risks",
      explanation: "Fed surprises or hawkish tone can reverse sentiment. Tech is crowded.",
      why: "Knowing what could flip the mood helps you plan.",
      sectors: [
        { name: "Financials", move: "−0.3%", tone: "dn" },
        { name: "Technology", move: "+1.2%", tone: "up" },
      ],
      stocks: [STOCKS.JPM],
      reaction: "Rates-sensitive groups soft",
      watch: ["Fed speakers"],
      dive: "Risks",
    }),
    outlook: L({
      layer: "Outlook",
      headline: "Watch AI commentary and Fed speakers",
      explanation: "Next leg depends on AI demand commentary and rates staying range-bound.",
      why: "Outlook turns today's read into a short watchlist.",
      sectors: [
        { name: "Technology", move: "+1.2%", tone: "up" },
        { name: "Energy", move: "+0.9%", tone: "up" },
      ],
      stocks: [STOCKS.NVDA, STOCKS.XOM, STOCKS.JPM],
      reaction: "Base case: constructive tone holds",
      watch: ["NVDA commentary", "Fed speakers"],
      dive: "Outlook",
    }),
  },
};

export const MOVERS_WHEEL = {
  id: "movers",
  title: "Movers Wheel",
  subtitle: "Per-stock intelligence",
  pulseTag: "Movers intelligence",
  pulseHeadline: "NVDA leads · AI narrative drives semis",
  sections: [
    { id: "why", label: "Why" },
    { id: "drivers", label: "Drivers" },
    { id: "reaction", label: "Reaction" },
    { id: "patterns", label: "Patterns" },
    { id: "sentiment", label: "Sentiment" },
  ],
  layers: {
    why: L({
      layer: "Why",
      headline: "NVDA is up because AI demand still looks strong",
      explanation: "Cloud and enterprise customers keep spending on AI chips.",
      why: "The why answers the first question every beginner asks.",
      sectors: [{ name: "Semiconductors", move: "+1.6%", tone: "up" }],
      stocks: [STOCKS.NVDA, STOCKS.AMD],
      reaction: "NVDA leads volume",
      watch: ["Hyperscaler capex headlines"],
      dive: "Why",
    }),
    drivers: L({
      layer: "Drivers",
      headline: "Earnings revisions and supply drive the move",
      explanation: "Estimate revisions and tight advanced-chip supply keep buyers interested.",
      why: "Drivers are the concrete inputs behind the price.",
      sectors: [{ name: "Semiconductors", move: "+1.6%", tone: "up" }],
      stocks: [STOCKS.NVDA],
      reaction: "Revisions trending up",
      watch: ["Next earnings"],
      dive: "Drivers",
    }),
    reaction: L({
      layer: "Reaction",
      headline: "Semis outperform the broad market",
      explanation: "The group moves together when NVDA rises.",
      why: "Reaction shows if the move is isolated or thematic.",
      sectors: [{ name: "Semiconductors", move: "+1.6%", tone: "up" }],
      stocks: [STOCKS.NVDA, STOCKS.AMD, STOCKS.META],
      reaction: "Beta cluster active",
      watch: ["Relative strength vs QQQ"],
      dive: "Reaction",
    }),
    patterns: L({
      layer: "Patterns",
      headline: "This rhymes with prior AI capex waves",
      explanation: "Leaders often run first, then the market narrows as valuations stretch.",
      why: "Patterns add historical context without predicting blindly.",
      sectors: [{ name: "Technology", move: "+1.2%", tone: "up" }],
      stocks: [STOCKS.NVDA],
      reaction: "Leadership concentrated",
      watch: ["Laggard catch-up"],
      dive: "Patterns",
    }),
    sentiment: L({
      layer: "Sentiment",
      headline: "Crowded, but dips are still bought",
      explanation: "AI leaders are heavily owned, yet options still support dips.",
      why: "Sentiment tells you how much conviction is in the trade.",
      sectors: [{ name: "Semiconductors", move: "+1.6%", tone: "up" }],
      stocks: [STOCKS.NVDA, STOCKS.AMD],
      reaction: "Call interest elevated",
      watch: ["Fund flows"],
      dive: "Sentiment",
    }),
  },
};

export const INTELLIGENCE_WHEEL = {
  id: "intelligence",
  title: "Intelligence Wheel",
  subtitle: "Macro → sectors → stocks",
  pulseTag: "Intelligence stack",
  pulseHeadline: "Tech & energy lead · Financials lag",
  sections: [
    { id: "macro", label: "Macro" },
    { id: "sectors", label: "Sectors" },
    { id: "stocks", label: "Stocks" },
    { id: "risks", label: "Risks" },
    { id: "opportunities", label: "Opportunities" },
  ],
  layers: {
    macro: L({
      layer: "Macro",
      headline: "Growth bias, inflation still debated",
      explanation: "The economy is not flashing recession, but rates remain the swing factor.",
      why: "Macro frames every sector and stock call below it.",
      sectors: [
        { name: "Technology", move: "+1.2%", tone: "up" },
        { name: "Energy", move: "+0.9%", tone: "up" },
      ],
      stocks: [STOCKS.JPM, STOCKS.XOM],
      reaction: "Equities firm · Bonds range-bound",
      watch: ["CPI trend"],
      dive: "Macro",
    }),
    sectors: L({
      layer: "Sectors",
      headline: "Growth and commodities lead, banks lag",
      explanation: "Technology and energy are strongest. Financials weaker on rates.",
      why: "Sector view shows where strength and weakness live.",
      sectors: [
        { name: "Technology", move: "+1.2%", tone: "up" },
        { name: "Energy", move: "+0.9%", tone: "up" },
        { name: "Financials", move: "−0.3%", tone: "dn" },
      ],
      stocks: [STOCKS.NVDA, STOCKS.XOM, STOCKS.JPM],
      reaction: "Clear leadership",
      watch: ["Rotation into financials"],
      dive: "Sectors",
    }),
    stocks: L({
      layer: "Stocks",
      headline: "Three names explain much of today's tape",
      explanation: "NVDA reflects AI risk. XOM tracks oil. JPM reflects rates.",
      why: "Stock layer connects macro to tickers you can follow.",
      sectors: [
        { name: "Semiconductors", move: "+1.6%", tone: "up" },
        { name: "Energy", move: "+0.9%", tone: "up" },
      ],
      stocks: [STOCKS.NVDA, STOCKS.XOM, STOCKS.JPM, STOCKS.AMD],
      reaction: "High-beta names drive index",
      watch: ["NVDA volume"],
      dive: "Stocks",
    }),
    risks: L({
      layer: "Risks",
      headline: "Fed surprise, tech positioning, oil reversal",
      explanation: "A hawkish Fed shift or profit-taking in AI could change tone quickly.",
      why: "Risk layer is your pre-mortem.",
      sectors: [
        { name: "Financials", move: "−0.3%", tone: "dn" },
        { name: "Technology", move: "+1.2%", tone: "up" },
      ],
      stocks: [STOCKS.JPM],
      reaction: "Hedges cheap vs history",
      watch: ["Volatility term structure"],
      dive: "Risks",
    }),
    opportunities: L({
      layer: "Opportunities",
      headline: "AI supply chain and energy beta stand out",
      explanation: "Setups cluster around AI infrastructure and energy if oil holds.",
      why: "Opportunities translate the stack into a focus list.",
      sectors: [
        { name: "Technology", move: "+1.2%", tone: "up" },
        { name: "Energy", move: "+0.9%", tone: "up" },
      ],
      stocks: [STOCKS.NVDA, STOCKS.XOM],
      reaction: "Trend-followers active in leaders",
      watch: ["Pullback depth in NVDA"],
      dive: "Opportunities",
    }),
  },
};

/* ── Flagship: FORGENIQ Briefing Wheel (design-lab final) ─────── */

export const BRIEFING_WHEEL = {
  id: "briefing",
  layout: "briefingRail",
  flagship: true,
  title: "FORGENIQ Briefing",
  subtitle: "Today's market briefing · drag the wheel or use arrow keys",
  pulseTag: "Today's market briefing",
  pulseHeadline: "Risk-on close · AI and megacap tech firm · Regional banks weak",
  sections: [
    { id: "today", label: "Today" },
    { id: "why", label: "Why" },
    { id: "winners", label: "Winners" },
    { id: "losers", label: "Losers" },
    { id: "next", label: "Next" },
  ],
  layers: {
    today: L({
      layer: "Today",
      headline: "The market closed higher with broad, calm participation",
      explanation:
        "The S&P 500 gained about 0.6%. Big tech, energy, and the largest banks told most of the index story—NVIDIA led chips, Exxon tracked firm oil, and JPMorgan slipped with the rest of the financials group.",
      why:
        "Start with the headline movers on an up day; they are the shorthand for what the session actually felt like.",
      sectors: [
        { name: "S&P 500", move: "+0.6%", tone: "up" },
        { name: "Technology", move: "+1.2%", tone: "up" },
        { name: "Energy", move: "+0.9%", tone: "up" },
        { name: "Financials", move: "−0.3%", tone: "dn" },
      ],
      stocks: [STOCKS.NVDA, STOCKS.XOM, STOCKS.JPM],
      reaction:
        "Advance/decline line positive · VIX eased · Cash equities closed firm with futures only slightly higher after hours",
      watch: ["Closing breadth vs the index", "After-hours earnings from large caps"],
      dive: "Briefing · Today",
    }),
    why: L({
      layer: "Why",
      headline: "Second-tier chips rallied while Wall Street banks traded the rate story",
      explanation:
        "AMD and Broadcom caught a bid on custom AI silicon and networking demand. Goldman rose with a better capital-markets tone. The move was less about the index heavyweights and more about the supply chain and broker-dealer read-through.",
      why:
        "The why lens names the mechanism—who benefited from the narrative, not just who finished green on the board.",
      sectors: [
        { name: "Semiconductors", move: "+1.6%", tone: "up" },
        { name: "Capital markets", move: "+0.8%", tone: "up" },
        { name: "Custom silicon", move: "+1.1%", tone: "up" },
      ],
      stocks: [STOCKS.AMD, STOCKS.AVGO, STOCKS.GS],
      reaction:
        "Factor rotation into AI infrastructure · Bond yields little changed · No single macro data point dominated the session",
      watch: ["Next hyperscaler capex datapoint", "Investment-banking backlog commentary"],
      dive: "Briefing · Why",
    }),
    winners: L({
      layer: "Winners",
      headline: "AI platforms and defense-tech software led the upside",
      explanation:
        "NVIDIA extended its leadership day. Meta gained on ad resilience and AI product momentum. Palantir surged on government and commercial contract optimism—these three drove a disproportionate share of growth-stock gains.",
      why:
        "Winners answer where risk appetite concentrated, not whether the index printed green.",
      sectors: [
        { name: "Interactive media", move: "+1.4%", tone: "up" },
        { name: "Software — infra", move: "+2.0%", tone: "up" },
        { name: "Aerospace & defense", move: "+0.7%", tone: "up" },
      ],
      stocks: [STOCKS.NVDA, STOCKS.META, STOCKS.PLTR],
      reaction:
        "Growth factor outperformed value · Short interest in high-beta software fell · Volume clustered in the top decile of market cap",
      watch: ["Follow-through in software breadth", "Any profit-taking in extended AI names"],
      dive: "Briefing · Winners",
    }),
    losers: L({
      layer: "Losers",
      headline: "Regional lenders and large money-center banks absorbed the pain",
      explanation:
        "JPMorgan led large-cap banks lower on margin worries. The regional-bank ETF (KRE) fell harder on credit and funding concerns. Truist lagged peers in the Southeast after a cautious outlook on net interest income.",
      why:
        "Losers matter on green days too—they show what the market is willing to sell while chasing growth elsewhere.",
      sectors: [
        { name: "Regional banks", move: "−1.1%", tone: "dn" },
        { name: "Money-center banks", move: "−0.5%", tone: "dn" },
        { name: "REITs", move: "−0.3%", tone: "dn" },
      ],
      stocks: [STOCKS.JPM, STOCKS.KRE, STOCKS.TFC],
      reaction:
        "Yield curve bull-steepening hurt lenders · Credit-default swaps in regionals ticked wider · Defensive utilities flat, not a bid for safety",
      watch: ["Weekly bank loan-officer survey", "FDIC or regional-bank headline risk"],
      dive: "Briefing · Losers",
    }),
    next: L({
      layer: "Next",
      headline: "Megacap earnings and cloud spend set the tone for tomorrow",
      explanation:
        "Apple, Microsoft, and Amazon anchor the next session narrative—device demand, Azure and Copilot traction, and retail plus AWS trends. Traders will treat their guidance as the proxy for consumer and enterprise IT health.",
      why:
        "Next is your forward calendar: what could confirm or break today's story before you need to react.",
      sectors: [
        { name: "Megacap tech", move: "+0.5%", tone: "up" },
        { name: "Cloud computing", move: "+0.8%", tone: "up" },
        { name: "Consumer discretionary", move: "+0.3%", tone: "up" },
      ],
      stocks: [STOCKS.AAPL, STOCKS.MSFT, STOCKS.AMZN],
      reaction:
        "Implied volatility elevated in AAPL and AMZN options · Pre-market focus on megacap guidance, not macro",
      watch: [
        "AAPL — China and services mix in guidance",
        "MSFT — Azure growth and AI monetization comments",
        "AMZN — retail margin and AWS backlog",
        "Pre-market futures after megacap prints",
      ],
      dive: "Briefing · Next",
    }),
  },
};

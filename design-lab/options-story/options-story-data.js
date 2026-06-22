/**
 * Illustrative options flow data for design-lab only.
 * @module design-lab/options-story/options-story-data
 */

export const OPTIONS_STORY = {
  todayStory: {
    eyebrow: "Today's Options Story",
    body:
      "Options traders are leaning cautiously bullish, with call activity ahead of puts. Notable flow is showing up in NVIDIA, SPY and large-cap technology names.",
  },
  overallPositioning: {
    title: "Overall Positioning",
    label: "Slightly Bullish",
    why: "Positioning is constructive, but not at an extreme level versus recent history.",
  },
  flows: [
    {
      id: "bullish-flow",
      label: "Bullish Flow",
      headline: "Technology leaders",
      tone: "buy",
      keyNames: ["NVDA", "AMD", "SPY"],
      why: "Call buying is concentrated in technology leaders.",
      whyItMatters: "See which names are driving upside positioning before you read each print.",
      explore: {
        explanation:
          "Flow favours AI-related names through calls. Breadth is solid but not at prior peak levels.",
      },
      tab: "unusual",
      filterTag: "bullish-flow",
    },
    {
      id: "bearish-flow",
      label: "Bearish Flow",
      headline: "Hedging & protection",
      tone: "sell",
      keyNames: ["QQQ", "IWM", "AAPL"],
      why: "Put activity has picked up in index and mega-cap hedges.",
      whyItMatters: "Helps tell routine hedging apart from directional bearish bets.",
      explore: {
        explanation:
          "Much of this looks like portfolio protection in ETFs and mega-caps, not a broad bearish shift.",
      },
      tab: "unusual",
      filterTag: "bearish-flow",
    },
    {
      id: "unusual-activity",
      label: "Unusual Activity",
      headline: "Elevated volume",
      tone: "mixed",
      keyNames: ["NVDA", "TSLA", "META"],
      why: "Volume is running well above typical open interest in several names.",
      whyItMatters: "Worth checking timing and strike selection before treating any single print as a signal.",
      explore: {
        explanation:
          "A small group of names accounts for most of the unusual volume. Calls and puts are both active.",
      },
      tab: "unusual",
      filterTag: "unusual-activity",
    },
    {
      id: "largest-premium",
      label: "Largest Premium",
      headline: "NVDA block",
      tone: "buy",
      keyNames: ["NVDA"],
      why: "The largest premium print today landed in NVIDIA calls.",
      whyItMatters: "One large trade can stand out — compare its size to typical daily flow in that name.",
      explore: {
        explanation:
          "Big-ticket flow is anchored in NVIDIA today. A single block does not define the whole market.",
      },
      tab: "unusual",
      filterTag: "largest-premium",
    },
  ],
};

export const UNUSUAL_ROWS = [
  {
    id: "u1",
    time: "10:42",
    sym: "NVDA",
    type: "CALL",
    strike: "950",
    expiry: "Jun 20",
    premium: "$4.2M",
    volume: "12,400",
    oi: "3,100",
    volOi: "4.0×",
    iv: "52%",
    spot: "$942",
    sentiment: "bullish",
    tags: ["bullish-flow", "unusual-activity", "largest-premium"],
  },
  {
    id: "u2",
    time: "10:18",
    sym: "AMD",
    type: "CALL",
    strike: "180",
    expiry: "Jun 20",
    premium: "$1.1M",
    volume: "8,200",
    oi: "2,400",
    volOi: "3.4×",
    iv: "48%",
    spot: "$176",
    sentiment: "bullish",
    tags: ["bullish-flow"],
  },
  {
    id: "u3",
    time: "09:55",
    sym: "SPY",
    type: "CALL",
    strike: "540",
    expiry: "Jun 13",
    premium: "$2.8M",
    volume: "22,100",
    oi: "18,000",
    volOi: "1.2×",
    iv: "14%",
    spot: "$538",
    sentiment: "bullish",
    tags: ["bullish-flow"],
  },
  {
    id: "u4",
    time: "09:31",
    sym: "QQQ",
    type: "PUT",
    strike: "480",
    expiry: "Jun 20",
    premium: "$1.6M",
    volume: "9,800",
    oi: "4,200",
    volOi: "2.3×",
    iv: "22%",
    spot: "$492",
    sentiment: "bearish",
    tags: ["bearish-flow"],
  },
  {
    id: "u5",
    time: "09:12",
    sym: "AAPL",
    type: "PUT",
    strike: "210",
    expiry: "Jul 18",
    premium: "$890K",
    volume: "5,400",
    oi: "2,900",
    volOi: "1.9×",
    iv: "26%",
    spot: "$218",
    sentiment: "bearish",
    tags: ["bearish-flow"],
  },
  {
    id: "u6",
    time: "08:47",
    sym: "TSLA",
    type: "CALL",
    strike: "280",
    expiry: "Jun 20",
    premium: "$1.3M",
    volume: "11,200",
    oi: "2,800",
    volOi: "4.0×",
    iv: "58%",
    spot: "$275",
    sentiment: "bullish",
    tags: ["unusual-activity"],
  },
  {
    id: "u7",
    time: "08:22",
    sym: "META",
    type: "PUT",
    strike: "520",
    expiry: "Jun 20",
    premium: "$720K",
    volume: "4,100",
    oi: "1,200",
    volOi: "3.4×",
    iv: "38%",
    spot: "$528",
    sentiment: "bearish",
    tags: ["unusual-activity", "bearish-flow"],
  },
  {
    id: "u8",
    time: "08:05",
    sym: "IWM",
    type: "PUT",
    strike: "210",
    expiry: "Jun 13",
    premium: "$540K",
    volume: "6,700",
    oi: "3,400",
    volOi: "2.0×",
    iv: "19%",
    spot: "$214",
    sentiment: "bearish",
    tags: ["bearish-flow"],
  },
];

export const CHAIN_PLACEHOLDER =
  "Options chain view — illustrative design-lab preview. Production keeps live chain data and filters.";

export const HEATMAP_PLACEHOLDER =
  "Flow heatmap — illustrative design-lab preview. Production keeps sector and expiry heat views.";

export const DARKPOOL_PLACEHOLDER =
  "Dark pool prints — illustrative design-lab preview. Production keeps block trade feed and filters.";

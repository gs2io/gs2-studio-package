import {
  defineOverlayDomainType,
  definePackage,
  defineUiComponent,
  dependencyPackage,
  instance,
  PT,
  UiItem,
} from "gs2-studio-dsl";

import { jaEnField } from "../../../dsl/jaEnField";

import guildRankingSurface from "../../dsl/dependency-surface.json";

import guildDemoSurface from "../../../foundation-social-guild/live-demo/dsl/dependency-surface.json";

import guildSurface from "../../../foundation-social-guild/dsl/dependency-surface.json";

import scheduleDemoSurface from "../../../foundation-economy-schedule/live-demo/dsl/dependency-surface.json";

import scheduleSurface from "../../../foundation-economy-schedule/dsl/dependency-surface.json";

import currencySurface from "../../../foundation-economy-currency/dsl/dependency-surface.json";

const guildRanking = dependencyPackage(guildRankingSurface);

const guild = dependencyPackage(guildSurface);

const guildDemo = dependencyPackage(guildDemoSurface);

const schedule = dependencyPackage(scheduleSurface);

const scheduleDemo = dependencyPackage(scheduleDemoSurface);

const currency = dependencyPackage(currencySurface);

const GuildRanking = guildRanking.type("GuildRanking");

const RANKING = "guild";

const SEASON_EVENT = "guild-season";

const MINIMUM_SCORE = 1;

const MAXIMUM_SCORE = 100;

const WALLET_SLOT = 0;

const TIERS = [
  { thresholdRank: 1, coins: 300 },
  { thresholdRank: 3, coins: 150 },
  { thresholdRank: 10, coins: 50 },
] as const;

const TIER_SUMMARY = TIERS.map(({ thresholdRank, coins }, index) => {
  const from = index === 0 ? 1 : TIERS[index - 1].thresholdRank + 1;
  const ranks =
    from === thresholdRank ? ordinal(from) : `${ordinal(from)}-${ordinal(thresholdRank)}`;
  return `${ranks} ${coins}`;
}).join(", ");

function ordinal(rank: number): string {
  const lastTwo = rank % 100;
  if (lastTwo >= 11 && lastTwo <= 13) return `${rank}th`;
  switch (rank % 10) {
    case 1:
      return `${rank}st`;
    case 2:
      return `${rank}nd`;
    case 3:
      return `${rank}rd`;
    default:
      return `${rank}th`;
  }
}

const GuildRankingReward = defineOverlayDomainType("GuildRankingReward", guildRanking.overlay("GuildRankingReward"), {
  properties: {
    coins: PT.int32().masterData().required(),
  },
  actionPropertyTransforms: [
    { targetProperty: guildRanking.propertyId("GuildRankingReward", "acquireActions"), mode: "append", transformPackageId: currency.packageId, transformId: currency.transformId("DepositFreeCurrency"), arguments: [
          { parameterName: "slot", source: { kind: "static", value: WALLET_SLOT } },
          {
            parameterName: "count",
            source: { kind: "domainProperty", propertyName: "coins" },
          },
        ] },
  ],
  localizedDisplay: {
    ja: {
      label: "ギルドランキング報酬",
      description: "デモのギルドランキング報酬に、報酬コインを足します。",
    },
    en: {
      label: "Guild ranking reward",
      description: "Adds the coins it pays to a demo guild ranking reward tier.",
    },
  },
  localizedProperties: {
      coins: jaEnField(
        "報酬コイン",
        "Reward coins",
        "この順位帯の報酬を受け取ったときに付与するコインの額です。",
        "Coins paid when this tier's reward is received.",
        { ja: "通貨", en: "currency" }
      ),
    },
});

export const microLiveopsGuildRankingDemo = definePackage({
  id: "micro-liveops-guild-ranking-demo",
  version: "0.0.1",
  display: {
    ja: {
      label: "ギルドランキング（デモデータ）",
      description:
        "ライブデモ用に、ギルドごとのランキングと順位帯ごとの報酬コイン、毎日切り替わるシーズンの説明を提供します。報酬は通貨パッケージのウォレットへ入ります。",
    },
    en: {
      label: "Guild Rankings (demo data)",
      description:
        "Supplies the live demo's per-guild ranking, the coins each reward tier pays, and the rule of its daily season. The rewards land in the currency package's wallet.",
    },
  },
  dependencies: {
    [guildRanking.packageId]: "github:gs2io/gs2-studio-package",
    [guild.packageId]: "github:gs2io/gs2-studio-package",
    [guildDemo.packageId]: "github:gs2io/gs2-studio-package",
    [schedule.packageId]: "github:gs2io/gs2-studio-package",
    [scheduleDemo.packageId]: "github:gs2io/gs2-studio-package",
    [currency.packageId]: "github:gs2io/gs2-studio-package",
    "foundation-economy-currency-demo": "github:gs2io/gs2-studio-package",
    "micro-shop-currency": "github:gs2io/gs2-studio-package",
  },
  domainTypes: [GuildRankingReward],
  instances: [
    instance(GuildRanking, RANKING, {
    [guildRanking.propertyId("GuildRanking", "orderDirection")]: "desc",
    [guildRanking.propertyId("GuildRanking", "sum")]: true,
    [guildRanking.propertyId("GuildRanking", "minimumValue")]: MINIMUM_SCORE,
    [guildRanking.propertyId("GuildRanking", "maximumValue")]: MAXIMUM_SCORE,
    [guildRanking.propertyId("GuildRanking", "schedule")]: SEASON_EVENT,
  }),
    ...TIERS.map(({ thresholdRank, coins }) => instance(GuildRankingReward, `${thresholdRank}.${RANKING}`, {
      [guildRanking.propertyId("GuildRankingReward", "ranking")]: RANKING,
      [guildRanking.propertyId("GuildRankingReward", "thresholdRank")]: thresholdRank,
      [guildRanking.propertyId("GuildRankingReward", "acquireActions")]: [],
      coins,
    })),
  ],
  uiComponents: [
    defineUiComponent(GuildRanking, {
  items: [
    UiItem.templateLabel("RuleLabel", `You are ranked within your guild, not guild against guild. Each play adds ${MINIMUM_SCORE} to ${MAXIMUM_SCORE} points to today's season, which turns over at 00:00 UTC. Once a season is over, receive coins by your rank in your guild: ${TIER_SUMMARY}. Advance one day ends the season for you right away; guildmates who did not advance are still in it.`, {}, { name: "GuildRanking" }),
  ],
}),
  ],
});

import { defineOverlayDomainType, definePackage, dependencyPackage, PT } from "~/dsl";

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

/** Derive the rule and deployed rewards from the same tier table so their numbers cannot drift. */
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

const GuildRankingReward = defineOverlayDomainType(
  "GuildRankingReward",
  {
    ...guildRanking.overlay("GuildRankingReward"),
    actionPropertyTransforms: [
      {
        targetProperty: guildRanking.propertyId("GuildRankingReward", "acquireActions"),
        kind: "transformEntries",
        mode: "append",
        entries: [
          {
            transformPackageId: currency.packageId,
            transformName: "DepositFreeCurrency",
            arguments: [
              { parameterName: "slot", source: { kind: "static", value: WALLET_SLOT } },
              {
                parameterName: "count",
                source: { kind: "domainProperty", propertyName: "coins" },
              },
            ],
          },
        ],
      },
    ],
  },
  domainType =>
    domainType
      .property(
        PT.int32("coins")
          .masterData()
          .required()
          .description("Coins this tier deposits when it is received")
      )
      .localizedProperties({
        coins: jaEnField(
          "報酬コイン",
          "Reward coins",
          "この順位帯の報酬を受け取ったときに付与するコインの額です。",
          "Coins paid when this tier's reward is received.",
          { ja: "通貨", en: "currency" }
        ),
      })
);

const withRanking = definePackage("micro-liveops-guild-ranking-demo", "0.0.0")
  .display({
    label: { ja: "ギルドランキング（デモデータ）", en: "Guild Rankings (demo data)" },
    description: {
      ja: "ライブデモ用に、ギルドごとのランキングと順位帯ごとの報酬コイン、毎日切り替わるシーズンの説明を提供します。報酬は通貨パッケージのウォレットへ入ります。",
      en: "Supplies the live demo's per-guild ranking, the coins each reward tier pays, and the rule of its daily season. The rewards land in the currency package's wallet.",
    },
  })
  .displayType(GuildRankingReward, {
    label: { ja: "ギルドランキング報酬", en: "Guild ranking reward" },
    description: {
      ja: "デモのギルドランキング報酬に、報酬コインを足します。",
      en: "Adds the coins it pays to a demo guild ranking reward tier.",
    },
  })
  .dependency(guildRanking.packageId, "github:gs2io/gs2-studio-package")
  .dependency(guild.packageId, "github:gs2io/gs2-studio-package")
  // Reuse the shared guild demo content so this demo cannot replace its kind and roles with a different stack.
  .dependency(guildDemo.packageId, "github:gs2io/gs2-studio-package")
  .dependency(schedule.packageId, "github:gs2io/gs2-studio-package")
  // Reuse the shared schedule content so the season event stays identical across demo deployments.
  .dependency(scheduleDemo.packageId, "github:gs2io/gs2-studio-package")
  // Reuse the currency demo content so the wallet and store products stay identical across demos.
  .dependency(currency.packageId, "github:gs2io/gs2-studio-package")
  .dependency("foundation-economy-currency-demo", "github:gs2io/gs2-studio-package")
  .dependency("micro-shop-currency", "github:gs2io/gs2-studio-package")

  .domainType(GuildRankingReward)

  .instance(GuildRanking, RANKING, {
    [guildRanking.propertyId("GuildRanking", "orderDirection")]: "desc",
    [guildRanking.propertyId("GuildRanking", "sum")]: true,
    [guildRanking.propertyId("GuildRanking", "minimumValue")]: MINIMUM_SCORE,
    [guildRanking.propertyId("GuildRanking", "maximumValue")]: MAXIMUM_SCORE,
    [guildRanking.propertyId("GuildRanking", "schedule")]: SEASON_EVENT,
  });

// Use the local overlay name for its coins property; keep the required acquire slot empty for the appended deposit.
const withTiers = TIERS.reduce(
  (builder, { thresholdRank, coins }) =>
    // Match the composite key order expected by the reward model so these authored ids identify the same tiers.
    builder.instance(GuildRankingReward.typeName, `${thresholdRank}.${RANKING}`, {
      [guildRanking.propertyId("GuildRankingReward", "ranking")]: RANKING,
      [guildRanking.propertyId("GuildRankingReward", "thresholdRank")]: thresholdRank,
      [guildRanking.propertyId("GuildRankingReward", "acquireActions")]: [],
      coins,
    }),
  withRanking
);

export const microLiveopsGuildRankingDemo = withTiers
  .uiComponent(GuildRanking, ui =>
    ui.templateLabel(
      "RuleLabel",
      `You are ranked within your guild, not guild against guild. Each play adds ${MINIMUM_SCORE} to ${MAXIMUM_SCORE} points to today's season, which turns over at 00:00 UTC. Once a season is over, receive coins by your rank in your guild: ${TIER_SUMMARY}. Advance one day ends the season for you right away; guildmates who did not advance are still in it.`,
      {},
      { name: "GuildRanking" }
    )
  )
  .build();

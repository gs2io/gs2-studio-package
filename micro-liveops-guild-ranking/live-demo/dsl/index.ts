/**
 * Live demo content for `micro-liveops-guild-ranking`.
 *
 * A board per guild, on a season every visitor shares. A visitor founds or
 * joins a guild, plays to add points to their total for the day, and sees
 * where they stand among the members of that guild. Once a season is over they
 * receive coins by the rank they finished at in the guild they played for.
 *
 * GS2 ranks the members of a guild against each other; there is no ranking of
 * one guild against another, and the page says so rather than implying one.
 *
 * The feature package is the guild ranking and its reward tiers. This package
 * adds the one ranking, what each tier pays and the rule the page states.
 *
 * **The season is the schedule demo's.** The ranking takes scores while the
 * schedule demo's event `guild-season` is open, and GS2 numbers a season by how
 * many times that event has repeated. It repeats every day at 00:00 UTC, so a
 * guild's members all score into the same season, and yesterday's season is
 * the one that pays.
 *
 * **Playing, the board and receiving are the page's.** Submitting a score,
 * reading a guild's board and receiving for a past season are not actions a
 * package can host, so they are hand-written Unity components, and so is the
 * lobby that founds and joins guilds.
 *
 * The guild, the wallet and the schedule are other packages' and are installed
 * beside this one rather than written out again: their rows live in stacks
 * every demo holding them deploys, and a second author of them would be a
 * second version, and the last deploy would win.
 */

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

/** The one guild ranking on the page. */
const RANKING = "guild";

/** The schedule demo's daily event that numbers the seasons. */
const SEASON_EVENT = "guild-season";

/** The lowest and highest score one play can make, and the ranking accepts. */
const MINIMUM_SCORE = 1;
const MAXIMUM_SCORE = 100;

/** The wallet the page shows and every reward lands in. */
const WALLET_SLOT = 0;

/**
 * The reward tiers, best first. A member receives the tier with the smallest
 * threshold at or below their rank in their guild. A guild holds at most ten
 * members at once, but the scores of members who left stay on its board, so a
 * board can run past ten places, and 11th place or lower receives nothing
 * (GS2 answers noRewards).
 */
const TIERS = [
  { thresholdRank: 1, coins: 300 },
  { thresholdRank: 3, coins: 150 },
  { thresholdRank: 10, coins: 50 },
] as const;

/**
 * What the rule says each tier pays, read off {@link TIERS}. The tiers are not
 * listed from GS2: the coins sit inside the deposit appended to each tier, and
 * nothing reads them back out of it.
 */
const TIER_SUMMARY = TIERS.map(({ thresholdRank, coins }) =>
  thresholdRank === 1 ? `1st ${coins}` : `top ${thresholdRank} ${coins}`
).join(", ");

/**
 * The reward tier, overlaid so it can carry what it pays.
 *
 * `acquireActions` is the slot the feature package leaves open; one deposit is
 * appended to it and `coins` decides how big it is for each tier.
 */
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
          .description("Free currency this tier deposits when it is received")
      )
      .localizedProperties({
        coins: jaEnField(
          "報酬コイン",
          "Reward coins",
          "この順位帯の報酬を受け取ったときに付与する無償通貨の額です。",
          "Free currency paid when this tier's reward is received.",
          { ja: "通貨", en: "currency" }
        ),
      })
);

/**
 * The package up to the ranking. Split here because a builder chain has no
 * room for a loop and the tiers are folded in from {@link TIERS}.
 */
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
  // The guild kind and its roles live in the guild stack this demo deploys
  // too; deployed from here without them, that stack would lose them. The
  // guild demo's rows of the guilds a visitor belongs to come with it.
  .dependency(guildDemo.packageId, "github:gs2io/gs2-studio-package")
  .dependency(schedule.packageId, "github:gs2io/gs2-studio-package")
  // The season's event lives in the schedule stack this demo deploys too.
  .dependency(scheduleDemo.packageId, "github:gs2io/gs2-studio-package")
  // Where the rewards pay.
  .dependency(currency.packageId, "github:gs2io/gs2-studio-package")
  .dependency("foundation-economy-currency-demo", "github:gs2io/gs2-studio-package")
  // The currency demo stocks the currency shop's price table, and an install
  // does not walk a package's own dependencies, so the shop is named too.
  .dependency("micro-shop-currency", "github:gs2io/gs2-studio-package")

  .domainType(GuildRankingReward)

  // Higher is better, and each play adds to the member's total for the day.
  .instance(GuildRanking, RANKING, {
    [guildRanking.propertyId("GuildRanking", "orderDirection")]: "desc",
    [guildRanking.propertyId("GuildRanking", "sum")]: true,
    [guildRanking.propertyId("GuildRanking", "minimumValue")]: MINIMUM_SCORE,
    [guildRanking.propertyId("GuildRanking", "maximumValue")]: MAXIMUM_SCORE,
    [guildRanking.propertyId("GuildRanking", "schedule")]: SEASON_EVENT,
  });

// Authored by type name so the rows reach the overlay this package declares,
// and its properties with it. The acquire slot is authored empty because the
// feature package requires it and the deposit is appended.
const withTiers = TIERS.reduce(
  (builder, { thresholdRank, coins }) =>
    // A reward tier is keyed by its ranking and threshold, and its id is
    // those values as the package orders them.
    builder.instance(GuildRankingReward.typeName, `${thresholdRank}.${RANKING}`, {
      [guildRanking.propertyId("GuildRankingReward", "ranking")]: RANKING,
      [guildRanking.propertyId("GuildRankingReward", "thresholdRank")]: thresholdRank,
      [guildRanking.propertyId("GuildRankingReward", "acquireActions")]: [],
      coins,
    }),
  withRanking
);

export const microLiveopsGuildRankingDemo = withTiers
  // The feature package ships no components: what a title shows of a ranking
  // is the title's decision. The page's section hangs from the one ranking,
  // which is the type here that GS2 holds a row of; the season, the visitor's
  // guild, the presses and the board around the rule are hand-written.
  .uiComponent(GuildRanking, ui =>
    ui.templateLabel(
      "RuleLabel",
      `Each guild has its own board: you are ranked against the other members of your guild, not guild against guild. Each Play adds ${MINIMUM_SCORE} to ${MAXIMUM_SCORE} points to your total for today's season, and seasons turn over every day at 00:00 UTC. Once a season is over, receive coins for it by the rank you finished at in your guild: ${TIER_SUMMARY}. A guild holds at most ten members at once, but the scores of members who left stay on its board, so 11th place or lower earns nothing. A guild of one always finishes 1st, so founding a guild alone pays the top tier. A reward is received once per guild and season, so a player who scores in one guild and then in another, even one they founded again after disbanding the first, receives again for the same season as a different guild. This demo allows both because its coins are play money.`,
      {},
      { name: "GuildRanking" }
    )
  )
  .build();

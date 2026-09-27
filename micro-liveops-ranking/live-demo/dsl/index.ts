/**
 * Live demo content for `micro-liveops-ranking`.
 *
 * A global leaderboard every visitor shares. A visitor opens a contest, plays
 * for a few minutes, and once their contest is over receives coins by the rank
 * they finished at on the shared board.
 *
 * The feature package is the ranking and its reward tiers. This package adds
 * the one ranking, what each tier pays, the contest window and the presses that
 * open and close it.
 *
 * **The window is a trigger.** The ranking takes scores while the schedule
 * demo's relative event `ranking-contest` is open, and that event opens when
 * the visitor pulls its trigger, so every visitor has a window of their own on
 * the one board: the season never moves on, and every visitor's scores meet in
 * it. A client may not pull a trigger itself, so Start contest is a free
 * exchange whose only acquire action pulls it; Finish contest is another whose
 * only consume action clears it. GS2 pays a season's rewards only once the
 * player's own window has closed, so Finish contest is also how a visitor gets
 * to their rewards without waiting.
 *
 * **Playing and the board are the page's.** Submitting a score and reading the
 * board are not actions a package can host, so they are hand-written Unity
 * components.
 *
 * The wallet and the schedule are other packages' and are installed beside
 * this one rather than written out again: their rows live in stacks every demo
 * holding them deploys, and a second author of them would be a second version,
 * and the last deploy would win.
 */

import {
  Arg,
  Bind,
  defineDomainType,
  defineMasterDataResource,
  defineOverlayDomainType,
  definePackage,
  dependencyPackage,
  PT,
  Source,
  transactionSetting,
} from "~/dsl";
import { GS2 } from "~/dsl/gs2";

import { jaEnField } from "../../../dsl/jaEnField";
import rankingSurface from "../../dsl/dependency-surface.json";
import scheduleDemoSurface from "../../../foundation-economy-schedule/live-demo/dsl/dependency-surface.json";
import scheduleSurface from "../../../foundation-economy-schedule/dsl/dependency-surface.json";
import currencySurface from "../../../foundation-economy-currency/dsl/dependency-surface.json";

const ranking = dependencyPackage(rankingSurface);
const schedule = dependencyPackage(scheduleSurface);
const scheduleDemo = dependencyPackage(scheduleDemoSurface);
const currency = dependencyPackage(currencySurface);

const Ranking = ranking.type("Ranking");

/** The one ranking on the page. */
const CONTEST = "contest";

/** The schedule demo's relative event and the trigger that opens it. */
const CONTEST_TRIGGER = "ranking-contest";

/** How long one press of Start contest keeps the window open. */
const CONTEST_SECONDS = 3 * 60;

/** The highest score a play can make, and the highest the ranking accepts. */
const MAXIMUM_SCORE = 1000;

/** The wallet the page shows and every reward lands in. */
const WALLET_SLOT = 0;

/**
 * The reward tiers, best first. A player receives the tier with the smallest
 * threshold at or below their rank; 1001 is GS2's tier for those who scored
 * but finished outside the top 1000.
 */
const TIERS = [
  { id: "first", thresholdRank: 1, coins: 300 },
  { id: "top3", thresholdRank: 3, coins: 150 },
  { id: "top10", thresholdRank: 10, coins: 80 },
  { id: "entrant", thresholdRank: 1001, coins: 30 },
] as const;

/**
 * What the rule says each tier pays, read off {@link TIERS}. The tiers are not
 * listed from GS2: the coins sit inside the deposit appended to each tier, and
 * nothing reads them back out of it.
 */
const TIER_SUMMARY = TIERS.map(({ thresholdRank, coins }) =>
  thresholdRank === 1
    ? `1st ${coins}`
    : thresholdRank === 1001
      ? `anyone else who played ${coins}`
      : `top ${thresholdRank} ${coins}`
).join(", ");

/**
 * The reward tier, overlaid so it can carry what it pays.
 *
 * `acquireActions` is the slot the feature package leaves open; one deposit is
 * appended to it and `coins` decides how big it is for each tier.
 */
const RankingReward = defineOverlayDomainType(
  "RankingReward",
  {
    ...ranking.overlay("RankingReward"),
    actionPropertyTransforms: [
      {
        targetProperty: ranking.propertyId("RankingReward", "acquireActions"),
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
 * The contest: what the page's presses and rule hang from, and what the
 * contest rates are mounted on. It is a type of its own rather than the
 * ranking because a window belongs to a visitor, and the ranking to everyone.
 */
const RankingContest = defineDomainType("RankingContest", dt =>
  dt.singleEntry().localizedProperties({
    id: {
      ja: { label: "コンテスト", description: "ランキングに参加できる数分間の枠です。" },
      en: { label: "Contest", description: "The few minutes in which a visitor can score." },
    },
  })
);

/**
 * Starting the contest, modelled as an exchange that costs nothing: the
 * acquire action pulls the trigger. The rate is named after the contest and
 * mounted on it, because a delegated action on the contest must target a
 * resource that mounts it.
 */
const StartRateModel = defineMasterDataResource(resource =>
  resource
    .model(GS2.exchange.RateModel)
    .mountLocal(RankingContest)
    .bindings({ name: Bind.domainProperty(Source.direct(RankingContest, "id")) })
    .addArrayChild("acquireActions", acquireAction => {
      acquireAction
        .model(GS2.transaction.AcquireAction)
        .mountLocal(RankingContest)
        .bindings({
          action: Bind.transform(schedule.packageId, "PullTrigger", [
            Arg.static("trigger", CONTEST_TRIGGER),
            Arg.static("ttlSeconds", CONTEST_SECONDS),
          ]),
        });
    })
);

/** Finishing the contest early: the consume action clears the trigger. */
const FinishRateModel = defineMasterDataResource(resource =>
  resource
    .model(GS2.exchange.RateModel)
    .mountLocal(RankingContest)
    .bindings({ name: Bind.domainProperty(Source.direct(RankingContest, "id")) })
    .addArrayChild("consumeActions", consumeAction => {
      consumeAction
        .model(GS2.transaction.ConsumeAction)
        .mountLocal(RankingContest)
        .bindings({
          action: Bind.transform(schedule.packageId, "ClearTrigger", [
            Arg.static("trigger", CONTEST_TRIGGER),
          ]),
        });
    })
);

/**
 * One exchange namespace per press: both rates are named after the contest,
 * and sharing a namespace would collide them on their primary key.
 */
function contestExchange(name: string) {
  return {
    name: Bind.static(name),
    ...Bind.nulls(
      "acquireAwaitScript",
      "exchangeScript",
      "incrementalExchangeScript",
      "logSetting"
    ),
    // Run and committed server-side: with auto-run off, `Exchange` only hands
    // back a stamp sheet the client has to execute through the distributor.
    transactionSetting: transactionSetting({
      enableAtomicCommit: Bind.static(true),
      enableAutoRun: Bind.static(true),
    }),
  };
}

/**
 * The package up to the ranking. Split here because a builder chain has no
 * room for a loop and the tiers are folded in from {@link TIERS}.
 */
const withRanking = definePackage("micro-liveops-ranking-demo", "0.0.0")
  .display({
    label: { ja: "ランキング（デモデータ）", en: "Rankings (demo data)" },
    description: {
      ja: "ライブデモ用に、全員で共有するランキングと順位帯ごとの報酬コイン、コンテストの開始・終了の操作を提供します。報酬は通貨パッケージのウォレットへ入ります。",
      en: "Supplies the live demo's shared ranking, the coins each reward tier pays, and the presses that start and finish a contest. The rewards land in the currency package's wallet.",
    },
  })
  .displayType(RankingReward, {
    label: { ja: "ランキング報酬", en: "Ranking reward" },
    description: {
      ja: "デモのランキング報酬に、報酬コインを足します。",
      en: "Adds the coins it pays to a demo ranking reward tier.",
    },
  })
  .displayType(RankingContest, {
    label: { ja: "コンテスト", en: "Contest" },
    description: {
      ja: "コンテストの開始・終了の操作と説明です。",
      en: "The contest's start and finish presses and its rule.",
    },
  })
  .dependency(ranking.packageId, "github:gs2io/gs2-studio-package")
  .dependency(schedule.packageId, "github:gs2io/gs2-studio-package")
  // The contest's event lives in the schedule stack this demo deploys too;
  // deployed from here without it, that stack would lose it.
  .dependency(scheduleDemo.packageId, "github:gs2io/gs2-studio-package")
  // Where the rewards pay.
  .dependency(currency.packageId, "github:gs2io/gs2-studio-package")
  .dependency("foundation-economy-currency-demo", "github:gs2io/gs2-studio-package")
  // The currency demo stocks the currency shop's price table, and an install
  // does not walk a package's own dependencies, so the shop is named too.
  .dependency("micro-shop-currency", "github:gs2io/gs2-studio-package")

  .domainType(RankingReward)
  .domainType(RankingContest)

  // Higher is better, and a new score replaces the last: the page submits a
  // play only when it beats the visitor's standing score.
  .instance(Ranking, CONTEST, {
    [ranking.propertyId("Ranking", "orderDirection")]: "desc",
    [ranking.propertyId("Ranking", "sum")]: false,
    [ranking.propertyId("Ranking", "minimumValue")]: 1,
    [ranking.propertyId("Ranking", "maximumValue")]: MAXIMUM_SCORE,
    [ranking.propertyId("Ranking", "schedule")]: CONTEST_TRIGGER,
  })
  .instance(RankingContest, "rankingcontest", {});

// Authored by type name so the rows reach the overlay this package declares,
// and its properties with it. The acquire slot is authored empty because the
// feature package requires it and the deposit is appended.
const withTiers = TIERS.reduce(
  (builder, { id, thresholdRank, coins }) =>
    builder.instance(RankingReward.typeName, id, {
      [ranking.propertyId("RankingReward", "ranking")]: CONTEST,
      [ranking.propertyId("RankingReward", "thresholdRank")]: thresholdRank,
      [ranking.propertyId("RankingReward", "acquireActions")]: [],
      coins,
    }),
  withRanking
);

export const microLiveopsRankingDemo = withTiers
  .masterDataResource(resource =>
    resource
      .model(GS2.exchange.Namespace)
      .bindings(contestExchange("RankingContestStart"))
      .addChild(StartRateModel)
  )
  .masterDataResource(resource =>
    resource
      .model(GS2.exchange.Namespace)
      .bindings(contestExchange("RankingContestFinish"))
      .addChild(FinishRateModel)
  )

  // The feature package ships no components: what a title shows of a ranking
  // is the title's decision.
  .uiComponent(RankingContest, ui =>
    ui
      .templateLabel(
        "RuleLabel",
        `Start a contest to get ${CONTEST_SECONDS / 60} minutes to play. Each play scores 1 to ${MAXIMUM_SCORE}, and your best counts on the board every visitor shares. Once your contest is over, receive coins by your rank: ${TIER_SUMMARY}. You need to have played. Each visitor receives once, for the rank they hold when they do; later contests only move you on the board.`,
        {},
        { name: "RankingContest" }
      )
      .buttonAction("StartContestButton", "StartContest", undefined, { name: "RankingContest" })
      .buttonAction("FinishContestButton", "FinishContest", undefined, {
        name: "RankingContest",
      })
  )
  .delegatedAction(RankingContest, "StartContest", {
    targetActionKey: "Gs2Exchange:RateModel.Exchange",
    targetResource: StartRateModel,
    parameterOverrides: [{ kind: "static", parameterName: "count", value: 1 }],
  })
  .delegatedAction(RankingContest, "FinishContest", {
    targetActionKey: "Gs2Exchange:RateModel.Exchange",
    targetResource: FinishRateModel,
    parameterOverrides: [{ kind: "static", parameterName: "count", value: 1 }],
  })
  .build();

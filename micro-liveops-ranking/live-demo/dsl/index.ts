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

const CONTEST = "contest";

const CONTEST_TRIGGER = "ranking-contest";

const CONTEST_SECONDS = 3 * 60;

const MAXIMUM_SCORE = 1000;

const WALLET_SLOT = 0;

const TIERS = [
  { thresholdRank: 1, coins: 300 },
  { thresholdRank: 3, coins: 150 },
  { thresholdRank: 10, coins: 80 },
  { thresholdRank: 1001, coins: 30 },
] as const;

/** Derive the rule and deployed rewards from the same tier table so their numbers cannot drift. */
const TIER_SUMMARY = TIERS.map(({ thresholdRank, coins }, index) => {
  if (thresholdRank === 1001) return `anyone else who played ${coins}`;
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

/** Separate the visitor-owned contest window from the ranking shared by all visitors. */
const RankingContest = defineDomainType("RankingContest", dt =>
  dt.singleEntry().localizedProperties({
    id: {
      ja: { label: "コンテスト", description: "ランキングに参加できる数分間の枠です。" },
      en: { label: "Contest", description: "The few minutes in which a visitor can score." },
    },
  })
);

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

/** Separate namespaces because both contest operations derive the same rate name. */
function contestExchange(name: string) {
  return {
    name: Bind.static(name),
    ...Bind.nulls(
      "acquireAwaitScript",
      "exchangeScript",
      "incrementalExchangeScript",
      "logSetting"
    ),
    // Auto-run executes the transaction without a second client request after the exchange.
    transactionSetting: transactionSetting({
      enableAtomicCommit: Bind.static(true),
      enableAutoRun: Bind.static(true),
    }),
  };
}

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
  // Reuse the shared schedule content so the contest event stays identical across demo deployments.
  .dependency(scheduleDemo.packageId, "github:gs2io/gs2-studio-package")
  // Reuse the currency demo content so the wallet and store products stay identical across demos.
  .dependency(currency.packageId, "github:gs2io/gs2-studio-package")
  .dependency("foundation-economy-currency-demo", "github:gs2io/gs2-studio-package")
  .dependency("micro-shop-currency", "github:gs2io/gs2-studio-package")

  .domainType(RankingReward)
  .domainType(RankingContest)

  .instance(Ranking, CONTEST, {
    [ranking.propertyId("Ranking", "orderDirection")]: "desc",
    [ranking.propertyId("Ranking", "sum")]: false,
    [ranking.propertyId("Ranking", "minimumValue")]: 1,
    [ranking.propertyId("Ranking", "maximumValue")]: MAXIMUM_SCORE,
    [ranking.propertyId("Ranking", "schedule")]: CONTEST_TRIGGER,
  })
  .instance(RankingContest, "rankingcontest", {});

// Use the local overlay name for its coins property; keep the required acquire slot empty for the appended deposit.
const withTiers = TIERS.reduce(
  (builder, { thresholdRank, coins }) =>
    // Match the composite key order expected by the reward model so these authored ids identify the same tiers.
    builder.instance(RankingReward.typeName, `${thresholdRank}.${CONTEST}`, {
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

  .uiComponent(RankingContest, ui =>
    ui
      .templateLabel(
        "RuleLabel",
        `Start a contest to get ${CONTEST_SECONDS / 60} minutes to play. Each play scores 1 to ${MAXIMUM_SCORE}, and your best counts on the board every visitor shares. Once your contest is over, receive coins by your rank: ${TIER_SUMMARY}. You receive once, for the rank you hold at that moment.`,
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

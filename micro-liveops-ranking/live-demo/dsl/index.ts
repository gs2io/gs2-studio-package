import {
  ActionProgram,
  Arg,
  Bind,
  defineDomainType,
  defineMasterDataResource,
  defineOverlayDomainType,
  definePackage,
  defineUiComponent,
  dependencyPackage,
  instance,
  PT,
  Source,
  transactionSettingV2,
  UiItem,
} from "gs2-studio-dsl";

import { GS2 } from "gs2-studio-dsl/gs2";

import { jaEnField } from "../../../dsl/jaEnField";
import { liveDemoDependencies } from "../../../dsl/liveDemoDependencies";

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

const RankingReward = defineOverlayDomainType("RankingReward", ranking.overlay("RankingReward"), {
  properties: {
    coins: PT.int32().masterData().required(),
  },
  actionPropertyTransforms: [
    { targetProperty: ranking.propertyId("RankingReward", "acquireActions"), mode: "append", transformPackageId: currency.packageId, transformId: currency.transformId("DepositFreeCurrency"), arguments: [
          { parameterName: "slot", source: { kind: "static", value: WALLET_SLOT } },
          {
            parameterName: "count",
            source: { kind: "domainProperty", propertyName: "coins" },
          },
        ] },
  ],
  localizedDisplay: {
    ja: { label: "ランキング報酬", description: "デモのランキング報酬に、報酬コインを足します。" },
    en: {
      label: "Ranking reward",
      description: "Adds the coins it pays to a demo ranking reward tier.",
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

const RankingContest = defineDomainType("RankingContest", {
  singleEntry: true,
  localizedDisplay: {
    ja: { label: "コンテスト", description: "コンテストの開始・終了の操作と説明です。" },
    en: { label: "Contest", description: "The contest's start and finish presses and its rule." },
  },
  localizedProperties: {
    id: {
      ja: { label: "コンテスト", description: "ランキングに参加できる数分間の枠です。" },
      en: { label: "Contest", description: "The few minutes in which a visitor can score." },
    },
  },
});

const StartRateModel = defineMasterDataResource({
  model: GS2.exchange.RateModel,
  mount: RankingContest,
  bindings: { name: Bind.domainProperty(Source.direct(RankingContest, "id")) },
  arrayChildren: {
    acquireActions: [
      defineMasterDataResource({
  model: GS2.transaction.AcquireAction,
  mount: RankingContest,
  actionProgram: ActionProgram.transform(schedule.packageId, schedule.transformId("PullTrigger"), [
            Arg.static("trigger", CONTEST_TRIGGER),
            Arg.static("ttlSeconds", CONTEST_SECONDS),
          ]),
}),
    ],
  },
});

const FinishRateModel = defineMasterDataResource({
  model: GS2.exchange.RateModel,
  mount: RankingContest,
  bindings: { name: Bind.domainProperty(Source.direct(RankingContest, "id")) },
  arrayChildren: {
    consumeActions: [
      defineMasterDataResource({
  model: GS2.transaction.ConsumeAction,
  mount: RankingContest,
  actionProgram: ActionProgram.transform(schedule.packageId, schedule.transformId("ClearTrigger"), [
            Arg.static("trigger", CONTEST_TRIGGER),
          ]),
}),
    ],
  },
});

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
    transactionSettingV2: transactionSettingV2(),
  };
}

export const microLiveopsRankingDemo = definePackage({
  id: "micro-liveops-ranking-demo",
  version: "0.0.1",
  display: {
    ja: {
      label: "ランキング（デモデータ）",
      description:
        "ライブデモ用に、全員で共有するランキングと順位帯ごとの報酬コイン、コンテストの開始・終了の操作を提供します。報酬は通貨パッケージのウォレットへ入ります。",
    },
    en: {
      label: "Rankings (demo data)",
      description:
        "Supplies the live demo's shared ranking, the coins each reward tier pays, and the presses that start and finish a contest. The rewards land in the currency package's wallet.",
    },
  },
  dependencies: liveDemoDependencies(
    ranking.packageId,
    schedule.packageId,
    scheduleDemo.packageId,
    currency.packageId,
    "foundation-economy-currency-demo",
    "micro-shop-currency"
  ),
  domainTypes: [RankingReward, RankingContest],
  instances: [
    instance(Ranking, CONTEST, {
    [ranking.propertyId("Ranking", "orderDirection")]: "desc",
    [ranking.propertyId("Ranking", "sum")]: false,
    [ranking.propertyId("Ranking", "minimumValue")]: 1,
    [ranking.propertyId("Ranking", "maximumValue")]: MAXIMUM_SCORE,
    [ranking.propertyId("Ranking", "schedule")]: CONTEST_TRIGGER,
  }),
    instance(RankingContest, "rankingcontest", {}),
    ...TIERS.map(({ thresholdRank, coins }) => instance(RankingReward, `${thresholdRank}.${CONTEST}`, {
      [ranking.propertyId("RankingReward", "ranking")]: CONTEST,
      [ranking.propertyId("RankingReward", "thresholdRank")]: thresholdRank,
      [ranking.propertyId("RankingReward", "acquireActions")]: [],
      coins,
    })),
  ],
  delegatedActions: [
    { target: RankingContest, methodName: "StartContest", action: { targetActionKey: "Gs2Exchange:RateModel.Exchange", targetResource: StartRateModel, parameterOverrides: [{ parameterName: "count", source: { kind: "static", value: 1 } }] } },
    { target: RankingContest, methodName: "FinishContest", action: { targetActionKey: "Gs2Exchange:RateModel.Exchange", targetResource: FinishRateModel, parameterOverrides: [{ parameterName: "count", source: { kind: "static", value: 1 } }] } },
  ],
  masterDataResources: [
    defineMasterDataResource({
  model: GS2.exchange.Namespace,
  bindings: contestExchange("RankingContestStart"),
  children: [
    StartRateModel,
  ],
}),
    defineMasterDataResource({
  model: GS2.exchange.Namespace,
  bindings: contestExchange("RankingContestFinish"),
  children: [
    FinishRateModel,
  ],
}),
  ],
  uiComponents: [
    defineUiComponent(RankingContest, {
  items: [
    UiItem.templateLabel("RuleLabel", `Start a contest to get ${CONTEST_SECONDS / 60} minutes to play. Each play scores 1 to ${MAXIMUM_SCORE}, and your best counts on the board every visitor shares. Once your contest is over, receive coins by your rank: ${TIER_SUMMARY}. You receive once, for the rank you hold at that moment.`, {}, { name: "RankingContest" }),
    UiItem.buttonAction("StartContestButton", "StartContest", undefined, { name: "RankingContest" }),
    UiItem.buttonAction("FinishContestButton", "FinishContest", undefined, {
        name: "RankingContest",
      }),
  ],
}),
  ],
});

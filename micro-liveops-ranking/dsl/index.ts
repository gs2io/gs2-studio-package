import {
  ActionProgram,
  Bind,
  defineActionTransform,
  defineDomainType,
  defineMasterDataResource,
  definePackage,
  defineUserDataResource,
  dependencyPackage,
  OutputMap,
  PT,
  Source,
  transactionSettingV2,
} from "gs2-studio-dsl";

import { GS2 } from "gs2-studio-dsl/gs2";

import { jaEnField, jaEnId } from "../../dsl/jaEnField";

import scheduleSurface from "../../foundation-economy-schedule/dsl/dependency-surface.json";

const schedule = dependencyPackage(scheduleSurface);

const Ranking = defineDomainType("Ranking", {
  properties: {
    schedule: PT.string().assetDelivery(),
    orderDirection: PT.enum("asc", "desc").masterData().required(),
    sum: PT.bool().masterData(),
    minimumValue: PT.int64().masterData(),
    maximumValue: PT.int64().masterData(),
    score: PT.int64().userData().required(),
  },
  localizedDisplay: {
    ja: {
      label: "ランキング",
      description: "プレイヤーランキングの集計方法、開催期間、参加条件を設定します。",
    },
    en: {
      label: "Ranking",
      description:
        "Configures scoring, availability, and participation rules for a player ranking.",
    },
  },
  localizedProperties: {
      id: jaEnId("ランキング", "ranking"),
      schedule: jaEnField(
        "開催スケジュール",
        "Entry schedule",
        "ランキングへスコアを登録できる開催スケジュールです。",
        "Schedule during which scores may be submitted."
      ),
      orderDirection: jaEnField(
        "順位方向",
        "Ranking order",
        "高いスコアと低いスコアのどちらを上位にするかを設定します。",
        "Whether higher or lower scores rank first."
      ),
      sum: jaEnField(
        "スコアを合算",
        "Sum scores",
        "複数回送信したスコアを合算するかを設定します。合算しない場合は、最後に送信したスコアで上書きされます。",
        "Whether submitted scores are added up. Otherwise the last score submitted replaces the one before."
      ),
      minimumValue: jaEnField(
        "最小スコア",
        "Minimum score",
        "受け付けるスコアの最小値です。",
        "Lowest score accepted by the ranking."
      ),
      maximumValue: jaEnField(
        "最大スコア",
        "Maximum score",
        "受け付けるスコアの最大値です。",
        "Highest score accepted by the ranking."
      ),
      score: jaEnField(
        "プレイヤースコア",
        "Player score",
        "このランキングにおけるプレイヤーの現在スコアです。",
        "Player's current score in this ranking.",
        { ja: "点", en: "points" }
      ),
    },
});

const RankingReward = defineDomainType("RankingReward", {
  properties: {
    ranking: PT.ref(Ranking).assetDelivery().required(),
    thresholdRank: PT.int32().masterData().required(),
    acquireActions: PT.listOf(PT.acquireAction()).masterData().required(),
  },
  compositeKey: ["ranking", "thresholdRank"],
  localizedDisplay: {
    ja: {
      label: "ランキング報酬",
      description: "ランキングの順位範囲ごとに配布する報酬を設定します。",
    },
    en: {
      label: "Ranking reward",
      description: "Defines rewards distributed for each ranking placement range.",
    },
  },
  localizedProperties: {
      id: jaEnId("ランキング報酬", "ranking reward"),
      ranking: jaEnField(
        "対象ランキング",
        "Ranking",
        "この報酬を配布するランキングです。",
        "Ranking that distributes this reward."
      ),
      thresholdRank: jaEnField(
        "順位しきい値",
        "Rank threshold",
        "この報酬を受け取れる最下位の順位です。1001 は上位 1000 位に入らなかったプレイヤー向けです。",
        "Lowest placement eligible for this reward. 1001 is for players outside the top 1000.",
        { ja: "位", en: "place" }
      ),
      acquireActions: jaEnField(
        "獲得アクション",
        "Acquire actions",
        "順位条件を満たしたプレイヤーへ実行する報酬アクションです。",
        "Reward actions executed for players who meet the placement threshold."
      ),
    },
});

const GlobalRankingModel = defineMasterDataResource({
  model: GS2.ranking2.GlobalRankingModel,
  mount: Ranking,
  bindings: {
      name: Bind.domainProperty(Source.direct(Ranking, "id")),
      metadata: Bind.static(""),
      orderDirection: Bind.domainProperty(Source.direct(Ranking, "orderDirection")),
      sum: Bind.domainProperty(Source.direct(Ranking, "sum")),
      minimumValue: Bind.domainProperty(Source.direct(Ranking, "minimumValue")),
      maximumValue: Bind.domainProperty(Source.direct(Ranking, "maximumValue")),
      // Match reward thresholds to placement rather than score values.
      rewardCalculationIndex: Bind.static("rank"),
      ...Bind.nulls("accessPeriodEventId"),
    },
  grnFieldMounts: [
    { parameterName: "entryPeriodEventId", mountedResource: schedule.resourceId("schedule.Namespace"), keyMappings: [
      { grnKeyName: "namespaceName", sourceKeyName: "namespaceName" },
    ] },
  ],
  grnKeyBindings: [
    { parameterName: "entryPeriodEventId", keyName: "eventName", directive: Bind.domainProperty(Source.direct(Ranking, "schedule")) },
  ],
  arrayChildren: {
    rankingRewards: [
      defineMasterDataResource({
  model: GS2.ranking2.RankingReward,
  mount: RankingReward,
  bindings: {
          thresholdRank: Bind.domainProperty(Source.direct(RankingReward, "thresholdRank")),
          metadata: Bind.static(""),
        },
  arrayChildren: {
    acquireActions: [
      defineMasterDataResource({
  model: GS2.transaction.AcquireAction,
  mount: RankingReward,
  actionProgram: ActionProgram.domainProperty(
                Source.parent(Source.direct(RankingReward, "acquireActions"))
              ),
}),
    ],
  },
}),
    ],
  },
});

const ReceiveRankingRewardTransform = defineActionTransform("ReceiveRankingReward", {
  category: "consume",
  parameters: {
    ranking: { type: PT.ref(Ranking) },
    season: { type: PT.int64() },
  },
  outputs: [
    {
    kind: "direct",
    actionName: "Gs2Ranking2:CreateGlobalRankingReceivedRewardByUserId",
    resource: () => GlobalRankingModel,
    parameterMappings: {
      namespaceName: OutputMap.resourceKey(),
      rankingName: OutputMap.parameter("ranking"),
      userId: OutputMap.placeholder("#{userId}"),
      season: OutputMap.parameter("season"),
    },
  },
  ],
});

const VerifyRankingScoreReachedTransform = defineActionTransform("VerifyRankingScoreReached", {
  category: "verify",
  parameters: {
    ranking: { type: PT.ref(Ranking) },
    season: { type: PT.int64() },
    score: { type: PT.int64() },
  },
  outputs: [
    {
    kind: "direct",
    actionName: "Gs2Ranking2:VerifyGlobalRankingScoreByUserId",
    resource: () => GlobalRankingModel,
    parameterMappings: {
      namespaceName: OutputMap.resourceKey(),
      userId: OutputMap.placeholder("#{userId}"),
      rankingName: OutputMap.parameter("ranking"),
      verifyType: OutputMap.static("greaterEqual"),
      season: OutputMap.parameter("season"),
      score: OutputMap.parameter("score"),
      multiplyValueSpecifyingQuantity: OutputMap.static(false),
    },
  },
  ],
});

export const microLiveopsRanking = definePackage({
  id: "micro-liveops-ranking",
  version: "0.0.1",
  display: {
    ja: {
      label: "ランキング",
      description:
        "全プレイヤーを対象としたランキングです。開催期間をスケジュールで指定し、順位に応じた報酬を配れます。",
    },
    en: {
      label: "Rankings",
      description:
        "A global leaderboard with a scheduled entry period and rewards handed out by rank.",
    },
  },
  dependencies: {
    "foundation-economy-schedule": "github:gs2io/gs2-studio-package",
  },
  domainTypes: [Ranking, RankingReward],
  masterDataResources: [
    defineMasterDataResource({
  model: GS2.ranking2.Namespace,
  bindings: {
        name: Bind.static("Ranking"),
        logSetting: Bind.null(),
        // Auto-run executes the reward transaction; atomic commit keeps the receipt record and payout together.
        transactionSettingV2: transactionSettingV2(),
      },
  children: [
    GlobalRankingModel,
  ],
}),
  ],
  userDataResources: [
    defineUserDataResource({
  model: GS2.ranking2.GlobalRankingScore,
  mount: Ranking,
  linkedMaster: GlobalRankingModel,
  bindings: {
        score: Bind.domainProperties([Source.direct(Ranking, "score")]),
        globalRankingScoreId: Bind.skip(),
        rankingName: Bind.domainProperty(Source.direct(Ranking, "id")),
        season: Bind.skip(),
        metadata: Bind.skip(),
        userId: Bind.skip(),
      },
}),
  ],
  actionTransforms: [ReceiveRankingRewardTransform, VerifyRankingScoreReachedTransform],
});

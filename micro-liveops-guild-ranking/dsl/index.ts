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

const SCHEDULE_NAMESPACE_RESOURCE_ID = schedule.resourceId("schedule.Namespace");

const GuildRanking = defineDomainType("GuildRanking", {
  properties: {
    schedule: PT.string().assetDelivery().required(),
    orderDirection: PT.enum("asc", "desc").masterData().required(),
    sum: PT.bool().masterData(),
    minimumValue: PT.int64().masterData(),
    maximumValue: PT.int64().masterData(),
    score: PT.int64().userData().required(),
  },
  localizedDisplay: {
    ja: {
      label: "ギルドランキング",
      description:
        "ギルドごとにメンバー同士で競うランキングの集計方法、開催期間、参加条件を設定します。",
    },
    en: {
      label: "Guild ranking",
      description:
        "Configures scoring, availability, and participation rules for a ranking of members within each guild.",
    },
  },
  localizedProperties: {
      id: jaEnId("ギルドランキング", "guild ranking"),
      schedule: jaEnField(
        "開催スケジュール",
        "Entry schedule",
        "ギルドランキングへスコアを登録できる開催スケジュールです。",
        "Schedule during which guild-ranking scores may be submitted."
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
        "同じメンバーが複数回送信したスコアを合算するかを設定します。合算しない場合は、最後に送信したスコアで上書きされます。",
        "Whether scores a member submits are added up. Otherwise the member's last score submitted replaces the one before."
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
        "ギルドランキングに対するプレイヤーの現在スコアです。",
        "Player's current contribution to the guild ranking.",
        { ja: "点", en: "points" }
      ),
    },
});

const GuildRankingReward = defineDomainType("GuildRankingReward", {
  properties: {
    ranking: PT.ref(GuildRanking).assetDelivery().required(),
    thresholdRank: PT.int32().masterData().required(),
    acquireActions: PT.listOf(PT.acquireAction()).masterData().required(),
  },
  compositeKey: ["ranking", "thresholdRank"],
  localizedDisplay: {
    ja: {
      label: "ランキング報酬",
      description: "ギルドランキングの順位範囲ごとに配布する報酬を設定します。",
    },
    en: {
      label: "Ranking reward",
      description: "Defines rewards distributed for each guild-ranking placement range.",
    },
  },
  localizedProperties: {
      id: jaEnId("ギルドランキング報酬", "guild ranking reward"),
      ranking: jaEnField(
        "対象ランキング",
        "Guild ranking",
        "この報酬を配布するギルドランキングです。",
        "Guild ranking that distributes this reward."
      ),
      thresholdRank: jaEnField(
        "順位しきい値",
        "Rank threshold",
        "この報酬を受け取れる最下位の順位です。",
        "Lowest placement eligible for this reward.",
        { ja: "位", en: "place" }
      ),
      acquireActions: jaEnField(
        "獲得アクション",
        "Acquire actions",
        "順位条件を満たしたメンバーへ実行する報酬アクションです。",
        "Reward actions executed for members who meet the placement threshold."
      ),
    },
});

const ClusterRankingModel = defineMasterDataResource({
  model: GS2.ranking2.ClusterRankingModel,
  mount: GuildRanking,
  bindings: {
      name: Bind.domainProperty(Source.direct(GuildRanking, "id")),
      metadata: Bind.static(""),
      clusterType: Bind.static("Gs2Guild::Guild"),
      orderDirection: Bind.domainProperty(Source.direct(GuildRanking, "orderDirection")),
      sum: Bind.domainProperty(Source.direct(GuildRanking, "sum")),
      minimumValue: Bind.domainProperty(Source.direct(GuildRanking, "minimumValue")),
      maximumValue: Bind.domainProperty(Source.direct(GuildRanking, "maximumValue")),
      accessPeriodEventId: Bind.null(),
      // Match reward thresholds to placement so tied members receive the same tier.
      rewardCalculationIndex: Bind.static("rank"),
    },
  grnFieldMounts: [
    { parameterName: "entryPeriodEventId", mountedResource: SCHEDULE_NAMESPACE_RESOURCE_ID, keyMappings: [
      { grnKeyName: "namespaceName", sourceKeyName: "namespaceName" },
    ] },
  ],
  grnKeyBindings: [
    { parameterName: "entryPeriodEventId", keyName: "eventName", directive: Bind.domainProperty(Source.direct(GuildRanking, "schedule")) },
  ],
  arrayChildren: {
    rankingRewards: [
      defineMasterDataResource({
  model: GS2.ranking2.RankingReward,
  mount: GuildRankingReward,
  bindings: {
          thresholdRank: Bind.domainProperty(Source.direct(GuildRankingReward, "thresholdRank")),
          metadata: Bind.static(""),
        },
  arrayChildren: {
    acquireActions: [
      defineMasterDataResource({
  model: GS2.transaction.AcquireAction,
  mount: GuildRankingReward,
  actionProgram: ActionProgram.domainProperty(
                Source.parent(Source.direct(GuildRankingReward, "acquireActions"))
              ),
}),
    ],
  },
}),
    ],
  },
});

const ReceiveGuildRankingRewardTransform = defineActionTransform("ReceiveGuildRankingReward", {
  category: "consume",
  parameters: {
    ranking: { type: PT.ref(GuildRanking) },
    guildName: {
        type: PT.string(),
        description:
          "GRN of the guild whose ranking this is: grn:gs2:{region}:{ownerId}:guild:<namespace>:guild:<guild model>:<guild name>",
      },
    season: { type: PT.int64() },
  },
  outputs: [
    {
    kind: "direct",
    actionName: "Gs2Ranking2:CreateClusterRankingReceivedRewardByUserId",
    resource: () => ClusterRankingModel,
    parameterMappings: {
      namespaceName: OutputMap.resourceKey(),
      rankingName: OutputMap.parameter("ranking"),
      clusterName: OutputMap.parameter("guildName"),
      userId: OutputMap.placeholder("#{userId}"),
      season: OutputMap.parameter("season"),
    },
  },
  ],
});

const VerifyGuildRankingScoreReachedTransform = defineActionTransform("VerifyGuildRankingScoreReached", {
  category: "verify",
  parameters: {
    ranking: { type: PT.ref(GuildRanking) },
    guildName: {
        type: PT.string(),
        description:
          "GRN of the guild whose ranking this is: grn:gs2:{region}:{ownerId}:guild:<namespace>:guild:<guild model>:<guild name>",
      },
    season: { type: PT.int64() },
    score: { type: PT.int64() },
  },
  outputs: [
    {
    kind: "direct",
    actionName: "Gs2Ranking2:VerifyClusterRankingScoreByUserId",
    resource: () => ClusterRankingModel,
    parameterMappings: {
      namespaceName: OutputMap.resourceKey(),
      userId: OutputMap.placeholder("#{userId}"),
      rankingName: OutputMap.parameter("ranking"),
      clusterName: OutputMap.parameter("guildName"),
      verifyType: OutputMap.static("greaterEqual"),
      season: OutputMap.parameter("season"),
      score: OutputMap.parameter("score"),
      multiplyValueSpecifyingQuantity: OutputMap.static(false),
    },
  },
  ],
});

export const microLiveopsGuildRanking = definePackage({
  id: "micro-liveops-guild-ranking",
  version: "0.0.1",
  display: {
    ja: {
      label: "ギルドランキング",
      description:
        "ギルド単位で区切られたランキングです。所属ギルド内で競い、順位に応じた報酬を配れます。",
    },
    en: {
      label: "Guild Rankings",
      description:
        "A leaderboard partitioned by guild, so members compete inside their own guild, with rewards by rank.",
    },
  },
  dependencies: {
    "foundation-economy-schedule": "github:gs2io/gs2-studio-package",
    "foundation-social-guild": "github:gs2io/gs2-studio-package",
  },
  domainTypes: [GuildRanking, GuildRankingReward],
  masterDataResources: [
    defineMasterDataResource({
  model: GS2.ranking2.Namespace,
  bindings: {
        name: Bind.static("GuildRanking"),
        logSetting: Bind.null(),
        // Auto-run executes the reward transaction; atomic commit keeps the receipt record and payout together.
        transactionSettingV2: transactionSettingV2(),
      },
  children: [
    ClusterRankingModel,
  ],
}),
  ],
  userDataResources: [
    defineUserDataResource({
  model: GS2.ranking2.ClusterRankingScore,
  mount: GuildRanking,
  linkedMaster: ClusterRankingModel,
  bindings: {
        score: Bind.domainProperties([Source.direct(GuildRanking, "score")]),
        clusterRankingScoreId: Bind.skip(),
        rankingName: Bind.domainProperty(Source.direct(GuildRanking, "id")),
        clusterName: Bind.skip(),
        season: Bind.skip(),
        metadata: Bind.skip(),
        userId: Bind.skip(),
      },
}),
  ],
  actionTransforms: [ReceiveGuildRankingRewardTransform, VerifyGuildRankingScoreReachedTransform],
});

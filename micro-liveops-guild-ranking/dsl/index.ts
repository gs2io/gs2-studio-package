import { Bind, defineDomainType, defineMasterDataResource, definePackage, PT, Source } from "~/dsl";
import { GS2 } from "~/dsl/gs2";

import { jaEnField, jaEnId } from "../../dsl/jaEnField";

const SCHEDULE_NAMESPACE_RESOURCE_ID = "6515e9e9-7c2f-58fa-9fa6-0dd2769a9e7d";

/**
 * A leaderboard scoped to a cluster rather than the whole player base. GS2
 * knows three cluster kinds; this package uses guilds, so members compete
 * within their own guild and guilds are ranked against each other without the
 * project having to partition scores itself.
 */
const GuildRanking = defineDomainType("GuildRanking", dt =>
  dt
    .idDescription("Unique identifier")
    .property(PT.string("schedule").assetDelivery().required())
    .property(
      PT.prop("orderDirection", PT.enum("asc", "desc"))
        .masterData()
        .required()
        .description("Whether a higher or a lower score ranks first")
    )
    .property(
      PT.bool("sum")
        .masterData()
        .description("Accumulate submitted scores instead of keeping the best")
    )
    .property(PT.int64("minimumValue").masterData().description("Lowest score accepted"))
    .property(PT.int64("maximumValue").masterData().description("Highest score accepted"))
    .property(PT.int64("score").userData().required().description("The player's own score"))
    .localizedProperties({
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
        "ギルドメンバーが送信したスコアを合算するかを設定します。",
        "Whether scores submitted by guild members are accumulated."
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
    })
);

/** What the members down to `thresholdRank` receive when the season ends. */
const GuildRankingReward = defineDomainType("GuildRankingReward", dt =>
  dt
    .idDescription("Unique identifier")
    .property(PT.prop("ranking", PT.ref("GuildRanking")).assetDelivery().required())
    .property(
      PT.int32("thresholdRank")
        .masterData()
        .required()
        .description("Best rank that misses this reward tier")
    )
    .property(PT.prop("acquireActions", PT.listOf(PT.acquireAction())).masterData().required())
    .compositeKey("ranking", "thresholdRank")
    .localizedProperties({
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
    })
);

const ClusterRankingModel = defineMasterDataResource(resource =>
  resource
    .model(GS2.ranking2.ClusterRankingModel)
    .mountLocal(GuildRanking)
    .bindings({
      name: Bind.domainProperty(Source.direct(GuildRanking, "id")),
      metadata: Bind.static(""),
      clusterType: Bind.static("Gs2Guild::Guild"),
      orderDirection: Bind.domainProperty(Source.direct(GuildRanking, "orderDirection")),
      sum: Bind.domainProperty(Source.direct(GuildRanking, "sum")),
      minimumValue: Bind.domainProperty(Source.direct(GuildRanking, "minimumValue")),
      maximumValue: Bind.domainProperty(Source.direct(GuildRanking, "maximumValue")),
      accessPeriodEventId: Bind.null(),
      rewardCalculationIndex: Bind.null(),
    })
    .grnFieldMount("entryPeriodEventId", SCHEDULE_NAMESPACE_RESOURCE_ID, [
      { grnKeyName: "namespaceName", sourceKeyName: "namespaceName" },
    ])
    .grnKeyBinding(
      "entryPeriodEventId",
      "eventName",
      Bind.domainProperty(Source.direct(GuildRanking, "schedule"))
    )
    .addArrayChild("rankingRewards", reward => {
      reward
        .model(GS2.ranking2.RankingReward)
        .mountLocal(GuildRankingReward)
        .bindings({
          thresholdRank: Bind.domainProperty(Source.direct(GuildRankingReward, "thresholdRank")),
          metadata: Bind.static(""),
        })
        .addArrayChild("acquireActions", acquireAction => {
          acquireAction
            .model(GS2.transaction.AcquireAction)
            .mountLocal(GuildRankingReward)
            .bindings({
              action: Bind.domainProperty(
                Source.parent(Source.direct(GuildRankingReward, "acquireActions"))
              ),
            });
        });
    })
);

export const microLiveopsGuildRanking = definePackage("micro-liveops-guild-ranking", "0.0.0")
  .display({
    label: { ja: "ギルドランキング", en: "Guild Rankings" },
    description: {
      ja: "ギルド単位で区切られたランキングです。所属ギルド内で競い、順位に応じた報酬を配れます。",
      en: "A leaderboard partitioned by guild, so members compete inside their own guild, with rewards by rank.",
    },
  })
  .displayType(GuildRanking, {
    label: { ja: "ギルドランキング", en: "Guild ranking" },
    description: {
      ja: "ギルド単位で競うランキングの集計方法、開催期間、参加条件を設定します。",
      en: "Configures scoring, availability, and participation rules for a guild ranking.",
    },
  })
  .displayType(GuildRankingReward, {
    label: { ja: "ランキング報酬", en: "Ranking reward" },
    description: {
      ja: "ギルドランキングの順位範囲ごとに配布する報酬を設定します。",
      en: "Defines rewards distributed for each guild-ranking placement range.",
    },
  })
  .dependency("foundation-economy-schedule", "github:gs2io/gs2-studio-package")
  .dependency("foundation-social-guild", "github:gs2io/gs2-studio-package")
  .domainType(GuildRanking)
  .domainType(GuildRankingReward)

  .masterDataResource(r =>
    r
      .model(GS2.ranking2.Namespace)
      .bindings({
        name: Bind.static("GuildRanking"),
        logSetting: Bind.null(),
        transactionSetting: {
          acquireActionUseJobQueue: Bind.static(false),
          commitScriptResultInUseDistributor: Bind.static(false),
          distributorNamespaceId: Bind.static("grn:gs2:{region}:{ownerId}:distributor:default"),
          enableAtomicCommit: Bind.static(false),
          enableAutoRun: Bind.static(false),
          queueNamespaceId: Bind.static("grn:gs2:{region}:{ownerId}:queue:default"),
          transactionUseDistributor: Bind.static(false),
        },
      })
      .addChild(ClusterRankingModel)
  )

  .userDataResource(r =>
    r
      .model(GS2.ranking2.ClusterRankingScore)
      .mountLocal(GuildRanking)
      .linkedMasterResourceId(ClusterRankingModel)
      .bindings({
        score: Bind.domainProperties([Source.direct(GuildRanking, "score")]),
        clusterRankingScoreId: Bind.skip(),
        rankingName: Bind.skip(),
        clusterName: Bind.skip(),
        season: Bind.skip(),
        metadata: Bind.skip(),
        userId: Bind.skip(),
      })
  )

  .actionTransform("ReceiveGuildRankingReward", at =>
    at
      .category("consume")
      .parameter("ranking", { type: PT.ref("GuildRanking") })
      .parameter("guildName", { type: PT.string() })
      .parameter("season", { type: PT.int64() })
      .output("Gs2Ranking2:CreateClusterRankingReceivedRewardByUserId", o =>
        o
          .resourceRef(() => ClusterRankingModel)
          .mapResourceKey("namespaceName")
          .mapParameter("rankingName", "ranking")
          .mapParameter("clusterName", "guildName")
          .mapPlaceholder("userId", "#{userId}")
          .mapParameter("season", "season")
      )
  )
  .actionTransform("VerifyGuildRankingScoreReached", at =>
    at
      .category("verify")
      .parameter("ranking", { type: PT.ref("GuildRanking") })
      .parameter("guildName", { type: PT.string() })
      .parameter("season", { type: PT.int64() })
      .parameter("score", { type: PT.int64() })
      .output("Gs2Ranking2:VerifyClusterRankingScoreByUserId", o =>
        o
          .resourceRef(() => ClusterRankingModel)
          .mapResourceKey("namespaceName")
          .mapPlaceholder("userId", "#{userId}")
          .mapParameter("rankingName", "ranking")
          .mapParameter("clusterName", "guildName")
          .mapStatic("verifyType", "greaterEqual")
          .mapParameter("season", "season")
          .mapParameter("score", "score")
          .mapStatic("multiplyValueSpecifyingQuantity", false)
      )
  )
  .build();

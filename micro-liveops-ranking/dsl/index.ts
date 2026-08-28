import { Bind, defineDomainType, defineMasterDataResource, definePackage, PT, Source } from "~/dsl";
import { GS2 } from "~/dsl/gs2";

/**
 * A global leaderboard: every player is ranked against every other. The entry
 * period comes from a schedule event, so a season is opened and closed by
 * moving the event rather than by editing the ranking.
 */
const Ranking = defineDomainType("Ranking", dt =>
  dt
    .idDescription("Unique identifier")
    .property(PT.string("schedule").assetDelivery())
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
);

/** What the players down to `thresholdRank` receive when the season ends. */
const RankingReward = defineDomainType("RankingReward", dt =>
  dt
    .idDescription("Unique identifier")
    .property(PT.prop("ranking", PT.ref("Ranking")).assetDelivery().required())
    .property(
      PT.int32("thresholdRank")
        .masterData()
        .required()
        .description("Best rank that misses this reward tier")
    )
    .property(PT.prop("acquireActions", PT.listOf(PT.acquireAction())).masterData().required())
    .compositeKey("ranking", "thresholdRank")
);

const GlobalRankingModel = defineMasterDataResource(resource =>
  resource
    .model(GS2.ranking2.GlobalRankingModel)
    .mountLocal(Ranking)
    .bindings({
      name: Bind.domainProperty(Source.direct(Ranking, "id")),
      metadata: Bind.static(""),
      orderDirection: Bind.domainProperty(Source.direct(Ranking, "orderDirection")),
      sum: Bind.domainProperty(Source.direct(Ranking, "sum")),
      minimumValue: Bind.domainProperty(Source.direct(Ranking, "minimumValue")),
      maximumValue: Bind.domainProperty(Source.direct(Ranking, "maximumValue")),
      accessPeriodEventId: Bind.null(),
      rewardCalculationIndex: Bind.null(),
    })
    .grnFieldMount("entryPeriodEventId", "6515e9e9-7c2f-58fa-9fa6-0dd2769a9e7d", [
      { grnKeyName: "namespaceName", sourceKeyName: "namespaceName" },
    ])
    .grnKeyBinding(
      "entryPeriodEventId",
      "eventName",
      Bind.domainProperty(Source.direct(Ranking, "schedule"))
    )
    .addArrayChild("rankingRewards", reward => {
      reward
        .model(GS2.ranking2.RankingReward)
        .mountLocal(RankingReward)
        .bindings({
          thresholdRank: Bind.domainProperty(Source.direct(RankingReward, "thresholdRank")),
          metadata: Bind.static(""),
        })
        .addArrayChild("acquireActions", acquireAction => {
          acquireAction
            .model(GS2.transaction.AcquireAction)
            .mountLocal(RankingReward)
            .bindings({
              action: Bind.domainProperty(
                Source.parent(Source.direct(RankingReward, "acquireActions"))
              ),
            });
        });
    })
);

export const microLiveopsRanking = definePackage("micro-liveops-ranking", "0.0.0")
  .display({
    label: { ja: "ランキング", en: "Rankings" },
    description: {
      ja: "全プレイヤーを対象としたランキングです。開催期間をスケジュールで指定し、順位に応じた報酬を配れます。",
      en: "A global leaderboard with a scheduled entry period and rewards handed out by rank.",
    },
  })
  .displayType(Ranking, {
    label: { ja: "ランキング", en: "Ranking" },
    description: {
      ja: "プレイヤーランキングの集計方法、開催期間、参加条件を設定します。",
      en: "Configures scoring, availability, and participation rules for a player ranking.",
    },
  })
  .displayType(RankingReward, {
    label: { ja: "ランキング報酬", en: "Ranking reward" },
    description: {
      ja: "ランキングの順位範囲ごとに配布する報酬を設定します。",
      en: "Defines rewards distributed for each ranking placement range.",
    },
  })
  .dependency("foundation-economy-schedule", "github:gs2io/gs2-studio-package")
  .domainType(Ranking)
  .domainType(RankingReward)

  .masterDataResource(r =>
    r
      .model(GS2.ranking2.Namespace)
      .bindings({
        name: Bind.static("Ranking"),
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
      .addChild(GlobalRankingModel)
  )

  .userDataResource(r =>
    r
      .model(GS2.ranking2.GlobalRankingScore)
      .mountLocal(Ranking)
      .linkedMasterResourceId(GlobalRankingModel)
      .bindings({
        score: Bind.domainProperties([Source.direct(Ranking, "score")]),
        globalRankingScoreId: Bind.skip(),
        rankingName: Bind.skip(),
        season: Bind.skip(),
        metadata: Bind.skip(),
        userId: Bind.skip(),
      })
  )

  .actionTransform("ReceiveRankingReward", at =>
    at
      .category("consume")
      .parameter("ranking", { type: PT.ref("Ranking") })
      .parameter("season", { type: PT.int64() })
      .output("Gs2Ranking2:CreateGlobalRankingReceivedRewardByUserId", o =>
        o
          .resourceRef(() => GlobalRankingModel)
          .mapResourceKey("namespaceName")
          .mapParameter("rankingName", "ranking")
          .mapPlaceholder("userId", "#{userId}")
          .mapParameter("season", "season")
      )
  )
  .actionTransform("VerifyRankingScoreReached", at =>
    at
      .category("verify")
      .parameter("ranking", { type: PT.ref("Ranking") })
      .parameter("season", { type: PT.int64() })
      .parameter("score", { type: PT.int64() })
      .output("Gs2Ranking2:VerifyGlobalRankingScoreByUserId", o =>
        o
          .resourceRef(() => GlobalRankingModel)
          .mapResourceKey("namespaceName")
          .mapPlaceholder("userId", "#{userId}")
          .mapParameter("rankingName", "ranking")
          .mapStatic("verifyType", "greaterEqual")
          .mapParameter("season", "season")
          .mapParameter("score", "score")
          .mapStatic("multiplyValueSpecifyingQuantity", false)
      )
  )
  .build();

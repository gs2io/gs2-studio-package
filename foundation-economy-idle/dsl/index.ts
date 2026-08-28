import { Bind, defineDomainType, defineMasterDataResource, definePackage, PT, Source } from "~/dsl";
import { GS2 } from "~/dsl/gs2";

const IdleReward = defineDomainType("IdleReward", dt =>
  dt
    .idDescription("Unique identifier")
    .property(PT.prop("acquireActions", PT.listOf(PT.acquireAction())).masterData().required())
);

const IdleStatus = defineDomainType("IdleStatus", dt =>
  dt
    .idDescription("Unique identifier")
    .property(PT.int32("rewardIntervalMinutes").masterData().required())
    .property(PT.int32("defaultMaximumIdleMinutes").masterData().required())
    .property(PT.int32("currentIdleMinutes").userData().required())
    .property(PT.timestamp("nextRewardsAt").userData().required())
    .property(PT.int32("maximumIdleMinutes").userData().required())
    .property(PT.prop("acquireActions", PT.listOf(PT.acquireAction())).userData().required())
);

const CategoryModel = defineMasterDataResource(resource =>
  resource
    .model(GS2.idle.CategoryModel)
    .mountLocal(IdleStatus)
    .bindings({
      defaultMaximumIdleMinutes: Bind.domainProperty(
        Source.direct(IdleStatus, "defaultMaximumIdleMinutes")
      ),
      idlePeriodScheduleId: Bind.null(),
      name: Bind.static("Idle"),
      receivePeriodScheduleId: Bind.null(),
      rewardIntervalMinutes: Bind.domainProperty(
        Source.direct(IdleStatus, "rewardIntervalMinutes")
      ),
    })
    .addArrayChild("acquireActions", acquireActionList => {
      acquireActionList
        .model(GS2.idle.AcquireActionList)
        .mountLocal(IdleReward)
        .bindings({})
        .addArrayChild("acquireActions", transactionAction => {
          transactionAction
            .model(GS2.transaction.AcquireAction)
            .mountLocal(IdleReward)
            .bindings({
              action: Bind.domainProperty(
                Source.parent(Source.direct(IdleReward, "acquireActions"))
              ),
            });
        });
    })
);

export const foundationEconomyIdle = definePackage("foundation-economy-idle", "0.0.0")
  .display({
    label: { ja: "放置報酬", en: "Idle Rewards" },
    description: {
      ja: "遊んでいない間にたまる放置報酬を計算・付与します。",
      en: "Accrues and grants rewards that build up while the player is away.",
    },
  })
  .displayType(IdleReward, {
    label: { ja: "放置報酬", en: "Idle reward" },
    description: {
      ja: "放置時間に応じて付与する報酬アクションを設定します。",
      en: "Defines reward actions granted for accumulated idle time.",
    },
  })
  .displayType(IdleStatus, {
    label: { ja: "放置状況", en: "Idle status" },
    description: {
      ja: "プレイヤーの放置開始時刻と受け取り状況を管理します。",
      en: "Tracks when a player's idle period began and the associated claim state.",
    },
  })
  .domainType(IdleReward)
  .domainType(IdleStatus)

  .masterDataResource(r =>
    r
      .model(GS2.idle.Namespace)
      .bindings({
        logSetting: Bind.null(),
        name: Bind.static("Idle"),
        overrideAcquireActionsScriptId: Bind.null(),
        receiveScript: Bind.null(),
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
      .addChild(CategoryModel)
  )

  .userDataResource(r =>
    r
      .model(GS2.idle.Status)
      .linkedMasterResourceId(CategoryModel)
      .bindings({
        categoryName: Bind.skip(),
        idleMinutes: Bind.domainProperties([Source.direct(IdleStatus, "currentIdleMinutes")]),
        maximumIdleMinutes: Bind.domainProperties([
          Source.direct(IdleStatus, "maximumIdleMinutes"),
        ]),
        nextRewardsAt: Bind.domainProperties([Source.direct(IdleStatus, "nextRewardsAt")]),
        statusId: Bind.skip(),
        userId: Bind.skip(),
      })
  )

  .build();

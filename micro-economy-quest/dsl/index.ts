import { Bind, defineDomainType, defineMasterDataResource, definePackage, PT, Source } from "~/dsl";
import { GS2 } from "~/dsl/gs2";

import { jaEnField, jaEnId } from "../../dsl/jaEnField";

/** The schedule type this package points its quest groups at. */
const SCHEDULE_EVENT_TYPE_ID = "dt_55N8HND2SNZV1ZMCJS4NA2BTFD";

/** One reward line of an in-flight quest run. */
const ProgressReward = defineDomainType("ProgressReward", dt =>
  dt
    .idDescription("Unique identifier")
    .property(PT.string("itemId").userData().required())
    .property(PT.int32("value").userData().required())
    .localizedProperties({
      id: jaEnId("クエスト報酬", "quest reward"),
      itemId: jaEnField(
        "報酬アイテムID",
        "Reward item ID",
        "進行中のクエストで獲得した報酬アイテムの識別子です。",
        "Identifier of a reward item earned during the quest."
      ),
      value: jaEnField(
        "報酬数",
        "Reward quantity",
        "獲得した報酬アイテムの数量です。",
        "Quantity of the reward item earned.",
        { ja: "個", en: "items" }
      ),
    })
);

/** The quest run a player currently has open. */
const Progress = defineDomainType("Progress", dt =>
  dt
    .idDescription("Unique identifier")
    .property(PT.prop("quest", PT.ref("Quest")).userData().required())
    .property(PT.prop("rewards", PT.listOf(PT.inline("ProgressReward"))).userData())
    .localizedProperties({
      id: jaEnId("クエスト進行", "quest progress"),
      quest: jaEnField(
        "進行中のクエスト",
        "Active quest",
        "プレイヤーが現在進行しているクエストです。",
        "Quest currently in progress for the player."
      ),
      rewards: jaEnField(
        "獲得済み報酬",
        "Earned rewards",
        "クエスト進行中に獲得した報酬の一覧です。",
        "Rewards earned during the active quest."
      ),
    })
);

/** A group of quests, optionally limited to a schedule event. */
const QuestCollection = defineDomainType("QuestCollection", dt =>
  dt
    .idDescription("Unique identifier")
    .property(PT.prop("schedule", PT.ref(SCHEDULE_EVENT_TYPE_ID)).masterData())
    .localizedProperties({
      id: jaEnId("クエストグループ", "quest group"),
      schedule: jaEnField(
        "開催スケジュール",
        "Availability schedule",
        "このクエストグループを開催するスケジュールです。",
        "Schedule during which this quest group is available."
      ),
    })
);

const Quest = defineDomainType("Quest", dt =>
  dt
    .idDescription("Unique identifier")
    .property(PT.prop("collection", PT.ref("QuestCollection")).assetDelivery().required())
    .property(PT.prop("consumeActions", PT.listOf(PT.consumeAction())).masterData().required())
    .property(
      PT.prop("firstCompleteAcquireActions", PT.listOf(PT.acquireAction())).masterData().required()
    )
    .property(
      PT.prop("completeAcquireActions", PT.listOf(PT.acquireAction())).masterData().required()
    )
    .property(
      PT.prop("failedAcquireActions", PT.listOf(PT.acquireAction())).masterData().required()
    )
    .property(PT.bool("completed").userData().required())
    .localizedProperties({
      id: jaEnId("クエスト", "quest"),
      collection: jaEnField(
        "クエストグループ",
        "Quest group",
        "このクエストが属するグループです。",
        "Quest group this quest belongs to."
      ),
      consumeActions: jaEnField(
        "開始時消費",
        "Start costs",
        "クエスト開始時に実行する消費アクションです。",
        "Consume actions executed when the quest starts."
      ),
      firstCompleteAcquireActions: jaEnField(
        "初回クリア報酬",
        "First-clear rewards",
        "初回クリア時に実行する獲得アクションです。",
        "Acquire actions executed on the first completion."
      ),
      completeAcquireActions: jaEnField(
        "通常クリア報酬",
        "Completion rewards",
        "クリア時に毎回実行する獲得アクションです。",
        "Acquire actions executed on each completion."
      ),
      failedAcquireActions: jaEnField(
        "失敗時アクション",
        "Failure actions",
        "クエスト失敗時に実行する獲得アクションです。",
        "Acquire actions executed when the quest fails."
      ),
      completed: jaEnField(
        "クリア済み",
        "Completed",
        "プレイヤーがこのクエストをクリア済みかを示します。",
        "Whether the player has completed this quest."
      ),
    })
);

const QuestModel = defineMasterDataResource(resource =>
  resource
    .model(GS2.quest.QuestModel)
    .mountLocal(Quest)
    .bindings({
      name: Bind.domainProperty(Source.direct(Quest, "id")),
      challengePeriodEventId: Bind.null(),
    })
    .addArrayChild("contents", contents => {
      contents
        .model(GS2.quest.Contents)
        .bindings({})
        .addArrayChild("completeAcquireActions", acquireAction => {
          acquireAction
            .model(GS2.transaction.AcquireAction)
            .mountLocal(Quest)
            .bindings({
              action: Bind.domainProperty(
                Source.parent(Source.parent(Source.direct(Quest, "completeAcquireActions")))
              ),
            });
        });
    })
    .addArrayChild("consumeActions", consumeAction => {
      consumeAction
        .model(GS2.transaction.ConsumeAction)
        .mountLocal(Quest)
        .bindings({
          action: Bind.domainProperty(Source.parent(Source.direct(Quest, "consumeActions"))),
        });
    })
    .addArrayChild("failedAcquireActions", acquireAction => {
      acquireAction
        .model(GS2.transaction.AcquireAction)
        .mountLocal(Quest)
        .bindings({
          action: Bind.domainProperty(Source.parent(Source.direct(Quest, "failedAcquireActions"))),
        });
    })
    .addArrayChild("firstCompleteAcquireActions", acquireAction => {
      acquireAction
        .model(GS2.transaction.AcquireAction)
        .mountLocal(Quest)
        .bindings({
          action: Bind.domainProperty(
            Source.parent(Source.direct(Quest, "firstCompleteAcquireActions"))
          ),
        });
    })
);

const QuestGroupModel = defineMasterDataResource(resource =>
  resource
    .model(GS2.quest.QuestGroupModel)
    .mountLocal(QuestCollection)
    .bindings({
      name: Bind.domainProperty(Source.direct(QuestCollection, "id")),
    })
    .grnFieldMount("challengePeriodEventId", "6515e9e9-7c2f-58fa-9fa6-0dd2769a9e7d", [
      { grnKeyName: "namespaceName", sourceKeyName: "namespaceName" },
    ])
    .grnKeyBinding(
      "challengePeriodEventId",
      "eventName",
      Bind.domainProperty(Source.direct(QuestCollection, "schedule"))
    )
    .addArrayChild("quests", QuestModel)
);

export const microEconomyQuest = definePackage("micro-economy-quest", "0.0.0")
  .display({
    label: { ja: "クエスト", en: "Quests" },
    description: {
      ja: "プレイヤーが進行させるクエストと、達成時の進捗・報酬を管理します。",
      en: "Manages quests players progress through, along with their progress and completion rewards.",
    },
  })
  .displayType(ProgressReward, {
    label: { ja: "クエスト報酬", en: "Quest reward" },
    description: {
      ja: "クエスト進行中の達成段階ごとに付与する報酬を設定します。",
      en: "Defines rewards granted at milestones during quest progress.",
    },
  })
  .displayType(Progress, {
    label: { ja: "クエスト進行", en: "Quest progress" },
    description: {
      ja: "プレイヤーのクエスト進行状況、達成値、報酬受取状態を管理します。",
      en: "Tracks a player's quest progress, completion value, and reward claims.",
    },
  })
  .displayType(QuestCollection, {
    label: { ja: "クエストグループ", en: "Quest group" },
    description: {
      ja: "関連するクエストをまとめ、公開順序と進行単位を設定します。",
      en: "Groups related quests and defines their order and progression unit.",
    },
  })
  .displayType(Quest, {
    label: { ja: "クエスト", en: "Quest" },
    description: {
      ja: "開始時の消費、初回・通常クリア報酬、失敗時アクションを設定します。",
      en: "Defines start costs, first-clear and repeat-clear rewards, and failure actions.",
    },
  })
  .dependency("foundation-economy-schedule", "github:gs2io/gs2-studio-package")
  .domainType(ProgressReward)
  .domainType(Progress)
  .domainType(QuestCollection)
  .domainType(Quest)

  .masterDataResource(r =>
    r
      .model(GS2.quest.Namespace)
      .bindings({
        name: Bind.static("Quest"),
        startQuestScript: Bind.null(),
        completeQuestScript: Bind.null(),
        failedQuestScript: Bind.null(),
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
      .addChild(QuestGroupModel)
  )

  .userDataResource(r =>
    r
      .model(GS2.quest.CompletedQuestList)
      .linkedMasterResourceId(QuestGroupModel)
      .bindings({
        completedQuestListId: Bind.skip(),
        questGroupName: Bind.skip(),
        userId: Bind.skip(),
      })
      .arrayMembershipMapping("completeQuestNames", Quest, "id", "completed")
  )

  .userDataResource(r =>
    r
      .model(GS2.quest.Progress)
      .mountLocal(Progress)
      .linkedMasterResourceId(QuestModel)
      .bindings({
        progressId: Bind.domainProperties([Source.direct(Progress, "id")]),
        questModelId: Bind.domainProperties([Source.direct(Progress, "quest")]),
        randomSeed: Bind.skip(),
        transactionId: Bind.skip(),
        userId: Bind.skip(),
      })
      .modelArrayDecodeBinding("rewards", Progress, "rewards", [
        { fieldName: "itemId", targetPropertyName: "itemId" },
        { fieldName: "value", targetPropertyName: "value" },
      ])
  )
  .build();

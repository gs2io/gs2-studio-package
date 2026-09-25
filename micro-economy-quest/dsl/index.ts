import {
  Bind,
  defineDomainType,
  defineMasterDataResource,
  definePackage,
  defineUserDataResource,
  dependencyPackage,
  PT,
  Source,
  transactionSetting,
} from "~/dsl";
import { GS2 } from "~/dsl/gs2";

import { jaEnField, jaEnId } from "../../dsl/jaEnField";

import scheduleSurface from "../../foundation-economy-schedule/dsl/dependency-surface.json";

// Addressed by name against the identities the dependency publishes, so a
// mistake is a compile error rather than an id that resolves to nothing.
const schedule = dependencyPackage(scheduleSurface);

/** The schedule type this package points its quest groups at. */
const SCHEDULE_EVENT_TYPE_ID = schedule.typeId("Schedule");

/** One reward the open quest run grants when it is completed. */
const ProgressReward = defineDomainType("ProgressReward", dt =>
  dt
    .property(PT.string("itemId").userData().required())
    .property(PT.int32("value").userData().required())
    .localizedProperties({
      id: jaEnId("クエスト報酬", "quest reward"),
      itemId: jaEnField(
        "報酬アイテムID",
        "Reward item ID",
        "クリア時に付与される報酬リソースの GRN です。",
        "GRN of the resource granted as a reward when the quest is completed."
      ),
      value: jaEnField(
        "報酬数",
        "Reward quantity",
        "クリア時に付与される報酬の数量です。",
        "Quantity of the reward granted when the quest is completed.",
        { ja: "個", en: "items" }
      ),
    })
);

/**
 * The quest run a player currently has open. GS2 keeps at most one per player,
 * so the type is single-entry; `inProgress` is false while there is none.
 *
 * `quest` and `questCollection` are filled from the progress's quest model GRN
 * (see `ProgressResource`), which is what lets a screen show which quest is
 * running.
 */
const Progress = defineDomainType("Progress", dt =>
  dt
    .singleEntry()
    .property(PT.bool("inProgress").userData().required())
    .property(PT.prop("quest", PT.ref("Quest")).userData().required())
    .property(PT.prop("questCollection", PT.ref("QuestCollection")).userData().required())
    .property(PT.prop("rewards", PT.listOf(PT.inline("ProgressReward"))).userData())
    .localizedProperties({
      id: jaEnId("クエスト進行", "quest progress"),
      inProgress: jaEnField(
        "進行中",
        "In progress",
        "プレイヤーが進行中のクエストを持っているかを示します。",
        "Whether the player has a quest in progress."
      ),
      quest: jaEnField(
        "進行中のクエスト",
        "Active quest",
        "プレイヤーが現在進行しているクエストです。",
        "Quest currently in progress for the player."
      ),
      questCollection: jaEnField(
        "進行中のクエストグループ",
        "Active quest group",
        "進行中のクエストが属するクエストグループです。",
        "Quest group of the quest currently in progress."
      ),
      rewards: jaEnField(
        "クリア報酬",
        "Completion rewards",
        "進行中のクエストをクリアしたときに付与される報酬の一覧です。開始時に決まります。",
        "Rewards granted when the quest in progress is completed; decided when it starts."
      ),
    })
);

/** A group of quests, optionally limited to a schedule event. */
const QuestCollection = defineDomainType("QuestCollection", dt =>
  dt
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
    .grnFieldMount("challengePeriodEventId", schedule.resourceId("schedule.Namespace"), [
      { grnKeyName: "namespaceName", sourceKeyName: "namespaceName" },
    ])
    .grnKeyBinding(
      "challengePeriodEventId",
      "eventName",
      Bind.domainProperty(Source.direct(QuestCollection, "schedule"))
    )
    .addArrayChild("quests", QuestModel)
);

/** GRN format of `Progress.questModelId`, as the catalog declares it. */
const QUEST_MODEL_GRN_FORMAT =
  "grn:gs2:{region}:{ownerId}:quest:{namespaceName}:group:{questGroupName}:quest:{questName}";

/**
 * The player's open quest run. GS2 answers NotFound when there is none, which
 * `inProgress` reads as absent. The progress's own GRN is not the row's id —
 * the single row is always `progress` — so it is not bound.
 */
const ProgressResource = defineUserDataResource(resource =>
  resource
    .model(GS2.quest.Progress)
    .mountLocal(Progress)
    .linkedMasterResourceId(QuestModel)
    .existenceProperty("inProgress")
    .bindings({
      progressId: Bind.skip(),
      randomSeed: Bind.skip(),
      transactionId: Bind.skip(),
      userId: Bind.skip(),
    })
    .grnRefBinding("questModelId", QUEST_MODEL_GRN_FORMAT, [
      { extractedKeyName: "questName", target: Quest, targetKeyPropertyName: "id" },
      {
        extractedKeyName: "questGroupName",
        target: QuestCollection,
        targetKeyPropertyName: "id",
      },
    ])
    .modelArrayDecodeBinding("rewards", Progress, "rewards", [
      { fieldName: "itemId", targetPropertyName: "itemId" },
      { fieldName: "value", targetPropertyName: "value" },
    ])
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
      ja: "進行中のクエストをクリアしたときに付与される報酬です。",
      en: "A reward the quest in progress grants when it is completed.",
    },
  })
  .displayType(Progress, {
    label: { ja: "クエスト進行", en: "Quest progress" },
    description: {
      ja: "プレイヤーが進行中のクエストと、クリア時に付与される報酬を管理します。",
      en: "Tracks the quest a player has in progress and the rewards completing it grants.",
    },
  })
  .displayType(QuestCollection, {
    label: { ja: "クエストグループ", en: "Quest group" },
    description: {
      ja: "関連するクエストをまとめ、開催スケジュールを設定します。",
      en: "Groups related quests and sets the schedule they are available on.",
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
        ...Bind.nulls("startQuestScript", "completeQuestScript", "failedQuestScript", "logSetting"),
        transactionSetting: transactionSetting(),
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

  .userDataResource(ProgressResource)

  // `force` is pinned to false: a run left open (the app closed mid-quest) is
  // resumed from the progress panel, whereas `true` would silently discard it
  // and spend the start cost again.
  .delegatedAction(Quest, "Start", {
    targetActionKey: "Gs2Quest:QuestModel.Start",
    targetResource: QuestModel,
    parameterOverrides: [{ kind: "static", parameterName: "force", value: false }],
  })
  // Rewards are left out, so GS2 grants the ones the run drew at start. A type
  // takes one delegated action per target action, so there is no separate
  // give-up (`isComplete: false`) alongside this.
  .delegatedAction(Progress, "Complete", {
    targetActionKey: "Gs2Quest:Progress.End",
    targetResource: ProgressResource,
    parameterOverrides: [{ kind: "static", parameterName: "isComplete", value: true }],
  })
  .build();

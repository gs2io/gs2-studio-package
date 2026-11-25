import {
  ActionProgram,
  Bind,
  defineDomainType,
  defineMasterDataResource,
  definePackage,
  defineUiComponent,
  defineUserDataResource,
  dependencyPackage,
  PT,
  Source,
  transactionSettingV2,
  UiCond,
  UiItem,
  UiSource,
} from "gs2-studio-dsl";

import { GS2 } from "gs2-studio-dsl/gs2";

import { jaEnField, jaEnId } from "../../dsl/jaEnField";

import scheduleSurface from "../../foundation-economy-schedule/dsl/dependency-surface.json";

const schedule = dependencyPackage(scheduleSurface);

const Schedule = schedule.type("Schedule");

const ProgressReward = defineDomainType("ProgressReward", {
  properties: {
    itemId: PT.string().userData().required(),
    value: PT.int32().userData().required(),
  },
  localizedDisplay: {
    ja: {
      label: "クエスト報酬",
      description: "進行中のクエストをクリアしたときに付与される報酬です。",
    },
    en: {
      label: "Quest reward",
      description: "A reward the quest in progress grants when it is completed.",
    },
  },
  localizedProperties: {
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
    },
});

const Progress = defineDomainType("Progress", {
  singleEntry: true,
  properties: {
    inProgress: PT.bool().userData().required(),
    quest: PT.ref(() => Quest).userData().required(),
    questCollection: PT.ref(() => QuestCollection).userData().required(),
    rewards: PT.listOf(PT.inline(ProgressReward)).userData(),
  },
  localizedDisplay: {
    ja: {
      label: "クエスト進行",
      description: "プレイヤーが進行中のクエストと、クリア時に付与される報酬を管理します。",
    },
    en: {
      label: "Quest progress",
      description:
        "Tracks the quest a player has in progress and the rewards completing it grants.",
    },
  },
  localizedProperties: {
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
    },
});

const QuestCollection = defineDomainType("QuestCollection", {
  properties: {
    schedule: PT.ref(Schedule).masterData(),
  },
  localizedDisplay: {
    ja: {
      label: "クエストグループ",
      description: "関連するクエストをまとめ、開催スケジュールを設定します。",
    },
    en: {
      label: "Quest group",
      description: "Groups related quests and sets the schedule they are available on.",
    },
  },
  localizedProperties: {
      id: jaEnId("クエストグループ", "quest group"),
      schedule: jaEnField(
        "開催スケジュール",
        "Availability schedule",
        "このクエストグループを開催するスケジュールです。",
        "Schedule during which this quest group is available."
      ),
    },
});

const Quest = defineDomainType("Quest", {
  properties: {
    collection: PT.ref(QuestCollection).assetDelivery().required(),
    consumeActions: PT.listOf(PT.consumeAction()).masterData().required(),
    firstCompleteAcquireActions: PT.listOf(PT.acquireAction()).masterData().required(),
    completeAcquireActions: PT.listOf(PT.acquireAction()).masterData().required(),
    failedAcquireActions: PT.listOf(PT.acquireAction()).masterData().required(),
    completed: PT.bool().userData().required(),
  },
  localizedDisplay: {
    ja: {
      label: "クエスト",
      description: "開始時の消費、初回・通常クリア報酬、失敗時アクションを設定します。",
    },
    en: {
      label: "Quest",
      description:
        "Defines start costs, first-clear and repeat-clear rewards, and failure actions.",
    },
  },
  localizedProperties: {
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
        "初回クリア時にだけ、通常クリア報酬に加えて実行する獲得アクションです。",
        "Acquire actions executed only on the first completion, in addition to the completion rewards."
      ),
      completeAcquireActions: jaEnField(
        "通常クリア報酬",
        "Completion rewards",
        "初回を含め、クリアのたびに実行する獲得アクションです。",
        "Acquire actions executed on every completion, the first one included."
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
    },
});

const QuestModel = defineMasterDataResource({
  model: GS2.quest.QuestModel,
  mount: Quest,
  bindings: {
      name: Bind.domainProperty(Source.direct(Quest, "id")),
      challengePeriodEventId: Bind.null(),
    },
  arrayChildren: {
    contents: [
      defineMasterDataResource({
  model: GS2.quest.Contents,
  bindings: {},
  arrayChildren: {
    completeAcquireActions: [
      defineMasterDataResource({
  model: GS2.transaction.AcquireAction,
  mount: Quest,
  actionProgram: ActionProgram.domainProperty(
                Source.parent(Source.parent(Source.direct(Quest, "completeAcquireActions")))
              ),
}),
    ],
  },
}),
    ],
    consumeActions: [
      defineMasterDataResource({
  model: GS2.transaction.ConsumeAction,
  mount: Quest,
  actionProgram: ActionProgram.domainProperty(Source.parent(Source.direct(Quest, "consumeActions"))),
}),
    ],
    failedAcquireActions: [
      defineMasterDataResource({
  model: GS2.transaction.AcquireAction,
  mount: Quest,
  actionProgram: ActionProgram.domainProperty(Source.parent(Source.direct(Quest, "failedAcquireActions"))),
}),
    ],
    firstCompleteAcquireActions: [
      defineMasterDataResource({
  model: GS2.transaction.AcquireAction,
  mount: Quest,
  actionProgram: ActionProgram.domainProperty(
            Source.parent(Source.direct(Quest, "firstCompleteAcquireActions"))
          ),
}),
    ],
  },
});

const QuestGroupModel = defineMasterDataResource({
  model: GS2.quest.QuestGroupModel,
  mount: QuestCollection,
  bindings: {
      name: Bind.domainProperty(Source.direct(QuestCollection, "id")),
    },
  grnFieldMounts: [
    { parameterName: "challengePeriodEventId", mountedResource: schedule.resourceId("schedule.Namespace"), keyMappings: [
      { grnKeyName: "namespaceName", sourceKeyName: "namespaceName" },
    ] },
  ],
  grnKeyBindings: [
    { parameterName: "challengePeriodEventId", keyName: "eventName", directive: Bind.domainProperty(Source.direct(QuestCollection, "schedule")) },
  ],
  arrayChildren: {
    quests: [
      QuestModel,
    ],
  },
});

const QUEST_MODEL_GRN_FORMAT =
  "grn:gs2:{region}:{ownerId}:quest:{namespaceName}:group:{questGroupName}:quest:{questName}";

const ProgressResource = defineUserDataResource({
  model: GS2.quest.Progress,
  mount: Progress,
  linkedMaster: QuestModel,
  existenceProperty: "inProgress",
  bindings: {
      progressId: Bind.skip(),
      randomSeed: Bind.skip(),
      transactionId: Bind.skip(),
      userId: Bind.skip(),
    },
  grnRefBindings: [
    { parameterName: "questModelId", grnFormat: QUEST_MODEL_GRN_FORMAT, keyMappings: [{ extractedKeyName: "questName", target: Quest, targetKeyProperty: "id" }, { extractedKeyName: "questGroupName", target: QuestCollection, targetKeyProperty: "id" }] },
  ],
  modelArrayDecodeBindings: [
    { parameterName: "rewards", target: Progress, targetListProperty: "rewards", fieldMappings: [{ fieldName: "itemId", targetProperty: "itemId" }, { fieldName: "value", targetProperty: "value" }] },
  ],
});

export const microEconomyQuest = definePackage({
  id: "micro-economy-quest",
  version: "0.0.1",
  display: {
    ja: {
      label: "クエスト",
      description: "プレイヤーが進めるクエストと、その進行状況・クリア報酬を管理します。",
    },
    en: {
      label: "Quests",
      description: "Manages quests players take on, their progress and their clear rewards.",
    },
  },
  dependencies: {
    "foundation-economy-schedule": "github:gs2io/gs2-studio-package",
  },
  domainTypes: [ProgressReward, Progress, QuestCollection, Quest],
  delegatedActions: [
    { target: Quest, methodName: "Start", action: { targetActionKey: "Gs2Quest:QuestModel.Start", targetResource: QuestModel, parameterOverrides: [{ parameterName: "force", source: { kind: "static", value: false } }] } },
    { target: Progress, methodName: "Complete", action: { targetActionKey: "Gs2Quest:Progress.End", targetResource: ProgressResource, parameterOverrides: [{ parameterName: "isComplete", source: { kind: "static", value: true } }] } },
  ],
  masterDataResources: [
    defineMasterDataResource({
  model: GS2.quest.Namespace,
  bindings: {
        name: Bind.static("Quest"),
        ...Bind.nulls("startQuestScript", "completeQuestScript", "failedQuestScript", "logSetting"),
        transactionSettingV2: transactionSettingV2(),
      },
  children: [
    QuestGroupModel,
  ],
}),
  ],
  userDataResources: [
    defineUserDataResource({
  model: GS2.quest.CompletedQuestList,
  linkedMaster: QuestGroupModel,
  bindings: {
        completedQuestListId: Bind.skip(),
        questGroupName: Bind.skip(),
        userId: Bind.skip(),
      },
  arrayMembershipMappings: [
    { parameterName: "completeQuestNames", child: Quest, targetKeyProperty: "id", targetProperty: "completed" },
  ],
}),
    ProgressResource,
  ],
  uiComponents: [
    defineUiComponent(Progress, {
  items: [
    UiItem.buttonAction("CompleteButton", "Complete", undefined, { name: "Progress" }),
    // GS2 holds one progress per player, so Start fails with alreadyExists while a quest runs: wire the idle
    // toggle to the quest list (its Start buttons or their container) and the running toggle to what shows the run.
    UiItem.activeToggle("IdleActiveToggle", UiCond.not(UiCond.truthy(UiSource.prop("inProgress"))), {
        name: "Progress",
      }),
    UiItem.activeToggle("RunningActiveToggle", UiCond.truthy(UiSource.prop("inProgress")), {
        name: "Progress",
      }),
  ],
}),
    defineUiComponent(Quest, {
  items: [
    UiItem.buttonAction("StartButton", "Start", undefined, { name: "Quest" }),
  ],
}),
  ],
});

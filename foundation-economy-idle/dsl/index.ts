import {
  ActionProgram,
  Bind,
  defineDomainType,
  defineMasterDataResource,
  definePackage,
  defineUserDataResource,
  PT,
  Source,
  transactionSettingV2,
} from "gs2-studio-dsl";

import { GS2 } from "gs2-studio-dsl/gs2";

import { jaEnField, jaEnId } from "../../dsl/jaEnField";

const IdleReward = defineDomainType("IdleReward", {
  properties: {
    acquireActions: PT.listOf(PT.acquireAction()).masterData().required(),
  },
  localizedDisplay: {
    ja: { label: "放置報酬", description: "放置時間に応じて付与する報酬アクションを設定します。" },
    en: {
      label: "Idle reward",
      description: "Defines reward actions granted for accumulated idle time.",
    },
  },
  localizedProperties: {
      id: jaEnId("放置報酬", "idle reward"),
      acquireActions: jaEnField(
        "獲得アクション",
        "Acquire actions",
        "放置報酬として実行する獲得アクションです。",
        "Acquire actions executed as idle rewards."
      ),
    },
});

const IdleStatus = defineDomainType("IdleStatus", {
  singleEntry: true,
  properties: {
    rewardIntervalMinutes: PT.int32().masterData().required(),
    defaultMaximumIdleMinutes: PT.int32().masterData().required(),
    currentIdleMinutes: PT.int32().userData().required(),
    nextRewardsAt: PT.timestamp().userData().required(),
    maximumIdleMinutes: PT.int32().userData().required(),
  },
  localizedDisplay: {
    ja: { label: "放置状況", description: "プレイヤーの放置開始時刻と受け取り状況を管理します。" },
    en: {
      label: "Idle status",
      description: "Tracks when a player's idle period began and the associated claim state.",
    },
  },
  localizedProperties: {
      id: jaEnId("放置状況", "idle status"),
      rewardIntervalMinutes: jaEnField(
        "報酬間隔",
        "Reward interval",
        "放置報酬を積み上げる間隔です。",
        "Interval at which idle rewards accumulate.",
        { ja: "分", en: "minutes" }
      ),
      defaultMaximumIdleMinutes: jaEnField(
        "初期放置上限",
        "Initial idle limit",
        "新規プレイヤーに適用する放置時間の上限です。",
        "Initial maximum idle duration for a new player.",
        { ja: "分", en: "minutes" }
      ),
      currentIdleMinutes: jaEnField(
        "現在の放置時間",
        "Current idle duration",
        "現在までに蓄積した放置時間です。",
        "Idle duration accumulated so far.",
        { ja: "分", en: "minutes" }
      ),
      nextRewardsAt: jaEnField(
        "次回報酬日時",
        "Next reward time",
        "次の放置報酬が確定する日時です。",
        "Time when the next idle reward becomes available."
      ),
      maximumIdleMinutes: jaEnField(
        "現在の放置上限",
        "Current idle limit",
        "プレイヤーに適用されている放置時間の上限です。",
        "Current maximum idle duration applied to the player.",
        { ja: "分", en: "minutes" }
      ),
    },
});

const CategoryModel = defineMasterDataResource({
  model: GS2.idle.CategoryModel,
  mount: IdleStatus,
  bindings: {
      defaultMaximumIdleMinutes: Bind.domainProperty(
        Source.direct(IdleStatus, "defaultMaximumIdleMinutes")
      ),
      idlePeriodScheduleId: Bind.null(),
      name: Bind.static("Idle"),
      receivePeriodScheduleId: Bind.null(),
      rewardIntervalMinutes: Bind.domainProperty(
        Source.direct(IdleStatus, "rewardIntervalMinutes")
      ),
    },
  arrayChildren: {
    acquireActions: [
      defineMasterDataResource({
  model: GS2.idle.AcquireActionList,
  mount: IdleReward,
  bindings: {},
  arrayChildren: {
    acquireActions: [
      defineMasterDataResource({
  model: GS2.transaction.AcquireAction,
  mount: IdleReward,
  actionProgram: ActionProgram.domainProperty(
                Source.parent(Source.direct(IdleReward, "acquireActions"))
              ),
}),
    ],
  },
}),
    ],
  },
});

export const foundationEconomyIdle = definePackage({
  id: "foundation-economy-idle",
  version: "0.0.1",
  display: {
    ja: { label: "放置報酬", description: "遊んでいない間にたまる放置報酬を計算・付与します。" },
    en: {
      label: "Idle Rewards",
      description: "Accrues and grants rewards that build up while the player is away.",
    },
  },
  domainTypes: [IdleReward, IdleStatus],
  delegatedActions: [
    { target: IdleStatus, methodName: "Receive", action: { targetActionKey: "Gs2Idle:CategoryModel.Receive", targetResource: CategoryModel } },
  ],
  masterDataResources: [
    defineMasterDataResource({
  model: GS2.idle.Namespace,
  bindings: {
        logSetting: Bind.null(),
        name: Bind.static("Idle"),
        ...Bind.nulls("overrideAcquireActionsScriptId", "receiveScript"),
        // Auto-run executes the reward transaction; atomic commit keeps the idle reset and payout together.
        transactionSettingV2: transactionSettingV2(),
      },
  children: [
    CategoryModel,
  ],
}),
  ],
  userDataResources: [
    defineUserDataResource({
  model: GS2.idle.Status,
  linkedMaster: CategoryModel,
  bindings: {
        categoryName: Bind.skip(),
        idleMinutes: Bind.domainProperties([Source.direct(IdleStatus, "currentIdleMinutes")]),
        maximumIdleMinutes: Bind.domainProperties([
          Source.direct(IdleStatus, "maximumIdleMinutes"),
        ]),
        nextRewardsAt: Bind.domainProperties([Source.direct(IdleStatus, "nextRewardsAt")]),
        statusId: Bind.skip(),
        userId: Bind.skip(),
      },
}),
  ],
});

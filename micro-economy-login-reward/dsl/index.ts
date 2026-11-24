import {
  ActionProgram,
  Bind,
  Cond,
  defineActionTransform,
  defineDomainType,
  defineMasterDataResource,
  defineOverlayDomainType,
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

const LoginRewardCollection = defineDomainType("LoginRewardCollection", {
  properties: {
    mode: PT.enum("schedule", "streaming").masterData().required(),
    schedule: PT.ref(() => Schedule).assetDelivery().requiredWhen(Cond.eq("mode", "schedule")),
    resetHour: PT.int32().masterData().requiredWhen(Cond.eq("mode", "streaming")),
    repeat: PT.enum("enabled", "disabled").masterData().requiredWhen(Cond.eq("mode", "streaming")),
    missedReceiveRelief: PT.enum("enabled", "disabled").masterData(),
    missedReceiveReliefConsumeActions: PT.listOf(PT.consumeAction()).masterData(),
    receivedSteps: PT.listOf(PT.bool()).userData(),
    lastReceivedAt: PT.timestamp().userData(),
  },
  localizedDisplay: {
    ja: {
      label: "ログインボーナスグループ",
      description: "ログインボーナスをまとめるグループと開催スケジュールを設定します。",
    },
    en: {
      label: "Login reward group",
      description: "Groups login rewards and associates them with an availability schedule.",
    },
  },
  localizedProperties: {
      id: jaEnId("ログインボーナスグループ", "login reward group"),
      mode: jaEnField(
        "進行モード",
        "Progress mode",
        "schedule は開催開始からの日数で、streaming は受け取った日数で段階を決めます。",
        "schedule picks the step by days since the schedule started; streaming by days claimed."
      ),
      schedule: jaEnField(
        "開催スケジュール",
        "Availability schedule",
        "このログインボーナスを開催するスケジュールです。",
        "Schedule during which this login reward is available."
      ),
      resetHour: jaEnField(
        "日付更新時刻",
        "Daily reset hour",
        "streaming で受け取り日を次の日へ進めるUTC時刻です。開催スケジュールを指定したときは使われません。",
        "UTC hour when streaming moves on to the next day. Not used when a schedule is set.",
        { ja: "時", en: "hour" }
      ),
      repeat: jaEnField(
        "繰り返し",
        "Repeat",
        "streaming で最後の段階まで受け取った後、最初の段階へ戻るかどうかです。有効にすると取り逃し救済は使えません。",
        "Whether streaming returns to the first step after the last one is claimed. Missed-receive relief is unavailable while it is enabled."
      ),
      missedReceiveRelief: jaEnField(
        "取り逃し救済",
        "Missed-receive relief",
        "受け取り損ねた段階を、救済の消費アクションと引き換えに受け取れるようにします。schedule では受け取る段階の指定が必要です。",
        "Lets a player claim a missed step in exchange for the relief consume actions. In schedule mode the step to claim must be given."
      ),
      missedReceiveReliefConsumeActions: jaEnField(
        "救済の消費アクション",
        "Relief consume actions",
        "取り逃した段階を受け取るときに実行する消費アクションです。",
        "Consume actions executed when claiming a missed step."
      ),
      receivedSteps: jaEnField(
        "受取済み段階",
        "Received steps",
        "プレイヤーが受け取り済みの段階を、先頭から順に示します。",
        "Steps the player has claimed, in step order."
      ),
      lastReceivedAt: jaEnField(
        "最終受取日時",
        "Last received at",
        "プレイヤーが最後に報酬を受け取った日時です。",
        "When the player last claimed a reward."
      ),
    },
});

const LoginReward = defineDomainType("LoginReward", {
  properties: {
    loginRewardCollection: PT.ref(LoginRewardCollection).assetDelivery().required(),
    acquireActions: PT.listOf(PT.acquireAction()).masterData().required(),
  },
  localizedDisplay: {
    ja: {
      label: "ログインボーナス",
      description: "ログイン日数ごとに付与する報酬内容を設定します。",
    },
    en: { label: "Login reward", description: "Defines the rewards granted for each login day." },
  },
  localizedProperties: {
      id: jaEnId("ログインボーナス", "login reward"),
      loginRewardCollection: jaEnField(
        "ボーナスグループ",
        "Reward group",
        "この報酬が属するログインボーナスグループです。",
        "Login reward group this reward belongs to."
      ),
      acquireActions: jaEnField(
        "獲得アクション",
        "Acquire actions",
        "このログイン段階で実行する報酬アクションです。",
        "Reward actions executed for this login step."
      ),
    },
});

const Schedule = defineOverlayDomainType("Schedule", schedule.overlay("Schedule"), {
  localizedDisplay: {
    ja: {
      label: "スケジュール",
      description: "ログインボーナスを利用できる開催期間を参照します。",
    },
    en: {
      label: "Schedule",
      description: "References the period during which a login reward campaign is available.",
    },
  },
});

const BonusModel = defineMasterDataResource({
  model: GS2.loginReward.BonusModel,
  mount: LoginRewardCollection,
  bindings: {
      mode: Bind.domainProperty(Source.direct(LoginRewardCollection, "mode")),
      repeat: Bind.domainProperty(Source.direct(LoginRewardCollection, "repeat")),
      missedReceiveRelief: Bind.domainProperty(
        Source.direct(LoginRewardCollection, "missedReceiveRelief")
      ),
      name: Bind.domainProperty(Source.direct(LoginRewardCollection, "id")),
      resetHour: Bind.domainProperty(Source.direct(LoginRewardCollection, "resetHour")),
    },
  grnKeyBindings: [
    { parameterName: "periodEventId", keyName: "namespaceName", directive: Bind.static("Schedule") },
    { parameterName: "periodEventId", keyName: "eventName", directive: Bind.domainProperty(Source.direct(LoginRewardCollection, "schedule")) },
  ],
  arrayChildren: {
    rewards: [
      defineMasterDataResource({
  model: GS2.loginReward.Reward,
  mount: LoginReward,
  bindings: {},
  arrayChildren: {
    acquireActions: [
      defineMasterDataResource({
  model: GS2.transaction.AcquireAction,
  mount: LoginReward,
  actionProgram: ActionProgram.domainProperty(
                Source.parent(Source.direct(LoginReward, "acquireActions"))
              ),
}),
    ],
  },
}),
    ],
    missedReceiveReliefConsumeActions: [
      defineMasterDataResource({
  model: GS2.transaction.ConsumeAction,
  mount: LoginRewardCollection,
  actionProgram: ActionProgram.domainProperty(
            Source.parent(Source.direct(LoginRewardCollection, "missedReceiveReliefConsumeActions"))
          ),
}),
    ],
  },
});

const ReceiveStatus = defineUserDataResource({
  model: GS2.loginReward.ReceiveStatus,
  mount: LoginRewardCollection,
  linkedMaster: BonusModel,
  bindings: {
      bonusModelName: Bind.domainProperty(Source.direct(LoginRewardCollection, "id")),
      receiveStatusId: Bind.skip(),
      lastReceivedAt: Bind.domainProperty(Source.direct(LoginRewardCollection, "lastReceivedAt")),
      receivedSteps: Bind.domainProperties([Source.direct(LoginRewardCollection, "receivedSteps")]),
      userId: Bind.skip(),
    },
});

const ResetReceiveStatusTransform = defineActionTransform("ResetReceiveStatus", {
  category: "acquire",
  parameters: {
    loginRewardCollection: { type: PT.ref(LoginRewardCollection) },
  },
  outputs: [
    {
    kind: "direct",
    actionName: "Gs2LoginReward:DeleteReceiveStatusByUserId",
    resource: () => BonusModel,
    parameterMappings: {
      namespaceName: OutputMap.resourceKey(),
      bonusModelName: OutputMap.parameter("loginRewardCollection"),
      userId: OutputMap.placeholder("#{userId}"),
    },
  },
  ],
});

export const microEconomyLoginReward = definePackage({
  id: "micro-economy-login-reward",
  version: "0.0.1",
  display: {
    ja: {
      label: "ログインボーナス",
      description: "毎日・連続ログインなどに応じて報酬を配布します。",
    },
    en: {
      label: "Login Rewards",
      description: "Grants rewards for daily or consecutive-day logins.",
    },
  },
  dependencies: {
    "foundation-economy-schedule": "github:gs2io/gs2-studio-package",
  },
  domainTypes: [LoginRewardCollection, LoginReward, Schedule],
  delegatedActions: [
    { target: LoginRewardCollection, methodName: "Receive", action: { targetActionKey: "Gs2LoginReward:ReceiveStatus.Receive", targetResource: ReceiveStatus } },
    { target: LoginRewardCollection, methodName: "MissedReceive", action: { targetActionKey: "Gs2LoginReward:ReceiveStatus.MissedReceive", targetResource: ReceiveStatus } },
  ],
  masterDataResources: [
    defineMasterDataResource({
  model: GS2.loginReward.Namespace,
  bindings: {
        logSetting: Bind.null(),
        name: Bind.static("LoginReward"),
        receiveScript: Bind.null(),
        transactionSettingV2: transactionSettingV2(),
      },
  children: [
    BonusModel,
  ],
}),
  ],
  userDataResources: [
    ReceiveStatus,
  ],
  actionTransforms: [ResetReceiveStatusTransform],
});

import {
  ActionProgram,
  Bind,
  defineActionTransform,
  defineDomainType,
  defineMasterDataResource,
  definePackage,
  defineUiComponent,
  defineUserDataResource,
  dependencyPackage,
  OutputMap,
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

const MissionSetting = defineDomainType("MissionSetting", {
  singleEntry: true,
  properties: {
    resetDayOfWeek: PT.enum("sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday").masterData().required(),
    resetDayOfMonth: PT.int32().masterData().required(),
    resetHour: PT.int32().masterData().required(),
  },
  localizedDisplay: {
    ja: {
      label: "ミッション設定",
      description: "ミッションカウンターのリセット方法や共通動作を設定します。",
    },
    en: {
      label: "Mission setting",
      description: "Configures counter reset rules and shared mission behavior.",
    },
  },
  localizedProperties: {
      id: jaEnId("ミッション設定", "mission settings"),
      resetDayOfWeek: jaEnField(
        "週次リセット曜日",
        "Weekly reset day",
        "週次ミッションをリセットする曜日です。",
        "Weekday when weekly missions reset."
      ),
      resetDayOfMonth: jaEnField(
        "月次リセット日",
        "Monthly reset day",
        "月次ミッションをリセットする日です。",
        "Day of the month when monthly missions reset.",
        { ja: "日", en: "day" }
      ),
      resetHour: jaEnField(
        "リセット時刻",
        "Reset hour",
        "ミッションをリセットするUTC時刻です。",
        "UTC hour when missions reset.",
        { ja: "時", en: "hour" }
      ),
    },
});

const MissionCounter = defineDomainType("MissionCounter", {
  properties: {
    todayValue: PT.int64().userData().required(),
    weeklyValue: PT.int64().userData().required(),
    monthlyValue: PT.int64().userData().required(),
    totalValue: PT.int64().userData().required(),
  },
  localizedDisplay: {
    ja: {
      label: "ミッションカウンター",
      description: "ミッション達成条件に使用するプレイヤーごとの進捗値を管理します。",
    },
    en: {
      label: "Mission counter",
      description: "Tracks per-player progress values used by mission completion conditions.",
    },
  },
  localizedProperties: {
      id: jaEnId("ミッションカウンター", "mission counter"),
      todayValue: jaEnField(
        "本日の値",
        "Daily value",
        "当日のリセット期間で蓄積した進捗値です。",
        "Progress accumulated in the current daily reset period."
      ),
      weeklyValue: jaEnField(
        "今週の値",
        "Weekly value",
        "当週のリセット期間で蓄積した進捗値です。",
        "Progress accumulated in the current weekly reset period."
      ),
      monthlyValue: jaEnField(
        "今月の値",
        "Monthly value",
        "当月のリセット期間で蓄積した進捗値です。",
        "Progress accumulated in the current monthly reset period."
      ),
      totalValue: jaEnField(
        "累計値",
        "Total value",
        "リセットされない累計の進捗値です。",
        "All-time progress value that is not reset."
      ),
    },
});

const MissionCollection = defineDomainType("MissionCollection", {
  properties: {
    schedule: PT.ref(Schedule).assetDelivery(),
    scope: PT.enum("daily", "weekly", "monthly", "notReset").masterData().required(),
  },
  localizedDisplay: {
    ja: {
      label: "ミッショングループ",
      description: "ミッションの公開範囲と開催スケジュールをまとめて設定します。",
    },
    en: {
      label: "Mission group",
      description: "Groups missions by scope and availability schedule.",
    },
  },
  localizedProperties: {
      id: jaEnId("ミッショングループ", "mission group"),
      schedule: jaEnField(
        "開催スケジュール",
        "Availability schedule",
        "このミッショングループを開催するスケジュールです。",
        "Schedule during which this mission group is available."
      ),
      scope: jaEnField(
        "リセット単位",
        "Reset scope",
        "グループ内ミッションの進捗をリセットする単位です。",
        "Reset cadence used by missions in this group."
      ),
    },
});

const Mission = defineDomainType("Mission", {
  properties: {
    missionCollection: PT.ref(MissionCollection).masterData().required(),
    completeAcquireActions: PT.listOf(PT.acquireAction()).masterData().required(),
    counter: PT.ref(MissionCounter).masterData().required(),
    targetValue: PT.int64().masterData().required(),
    completed: PT.bool().userData().required(),
    received: PT.bool().userData().required(),
  },
  localizedDisplay: {
    ja: {
      label: "ミッション",
      description: "達成カウンター、目標値、完了報酬と受取状態を設定・管理します。",
    },
    en: {
      label: "Mission",
      description:
        "Defines a mission's counter, target value, completion rewards, and claim state.",
    },
  },
  localizedProperties: {
      id: jaEnId("ミッション", "mission"),
      missionCollection: jaEnField(
        "ミッショングループ",
        "Mission group",
        "このミッションが属するグループです。",
        "Mission group this mission belongs to."
      ),
      completeAcquireActions: jaEnField(
        "完了報酬",
        "Completion rewards",
        "ミッション完了時に実行する獲得アクションです。",
        "Acquire actions executed when the mission is completed."
      ),
      counter: jaEnField(
        "進捗カウンター",
        "Progress counter",
        "達成判定に使用するミッションカウンターです。",
        "Mission counter used to determine completion."
      ),
      targetValue: jaEnField(
        "目標値",
        "Target value",
        "ミッションを完了するために必要なカウンター値です。",
        "Counter value required to complete the mission."
      ),
      completed: jaEnField(
        "完了済み",
        "Completed",
        "プレイヤーがこのミッションを完了したかを示します。",
        "Whether the player has completed this mission."
      ),
      received: jaEnField(
        "報酬受取済み",
        "Reward claimed",
        "プレイヤーが完了報酬を受け取ったかを示します。",
        "Whether the player has claimed the completion reward."
      ),
    },
});

const CounterModel = defineMasterDataResource({
  model: GS2.mission.CounterModel,
  mount: MissionCounter,
  bindings: {
    name: Bind.domainProperty(Source.direct(MissionCounter, "id")),
    challengePeriodEventId: Bind.null(),
  },
  arrayChildren: {
    scopes: [
      defineMasterDataResource({
        model: GS2.mission.CounterScopeModel,
        mount: MissionCounter,
        bindings: {
          scopeType: Bind.static("resetTiming"),
          resetType: Bind.static("daily"),
          resetHour: Bind.domainProperty(
            Source.parent(Source.parent(Source.direct(MissionSetting, "resetHour")))
          ),
        },
      }),
      defineMasterDataResource({
        model: GS2.mission.CounterScopeModel,
        mount: MissionCounter,
        bindings: {
          scopeType: Bind.static("resetTiming"),
          resetType: Bind.static("weekly"),
          resetDayOfWeek: Bind.domainProperty(
            Source.parent(Source.parent(Source.direct(MissionSetting, "resetDayOfWeek")))
          ),
          resetHour: Bind.domainProperty(
            Source.parent(Source.parent(Source.direct(MissionSetting, "resetHour")))
          ),
        },
      }),
      defineMasterDataResource({
        model: GS2.mission.CounterScopeModel,
        mount: MissionCounter,
        bindings: {
          scopeType: Bind.static("resetTiming"),
          resetType: Bind.static("monthly"),
          resetDayOfMonth: Bind.domainProperty(
            Source.parent(Source.parent(Source.direct(MissionSetting, "resetDayOfMonth")))
          ),
          resetHour: Bind.domainProperty(
            Source.parent(Source.parent(Source.direct(MissionSetting, "resetHour")))
          ),
        },
      }),
      defineMasterDataResource({
        model: GS2.mission.CounterScopeModel,
        mount: MissionCounter,
        bindings: {
          scopeType: Bind.static("resetTiming"),
          resetType: Bind.static("notReset"),
        },
      }),
    ],
  },
});

const MissionTaskModel = defineMasterDataResource({
  model: GS2.mission.MissionTaskModel,
  mount: Mission,
  bindings: {
      name: Bind.domainProperty(Source.direct(Mission, "id")),
      verifyCompleteType: Bind.static("counter"),
      targetCounter: {
        conditionName: Bind.static(""),
        counterName: Bind.domainProperty(
          Source.idRef(Mission, [{ refPropertyName: "counter", target: MissionCounter }], "id")
        ),
        resetType: Bind.static("notReset"),
        scopeType: Bind.null(),
        value: Bind.domainProperty(Source.direct(Mission, "targetValue")),
      },
    },
  grnFieldMounts: [
    { parameterName: "challengePeriodEventId", mountedResource: schedule.resourceId("schedule.Namespace"), keyMappings: [
      { grnKeyName: "namespaceName", sourceKeyName: "namespaceName" },
    ] },
  ],
  grnKeyBindings: [
    { parameterName: "challengePeriodEventId", keyName: "eventName", directive: Bind.domainProperty(Source.parent(Source.direct(MissionCollection, "schedule"))) },
  ],
  arrayChildren: {
    completeAcquireActions: [
      defineMasterDataResource({
  model: GS2.transaction.AcquireAction,
  mount: Mission,
  actionProgram: ActionProgram.domainProperty(
            Source.parent(Source.direct(Mission, "completeAcquireActions"))
          ),
}),
    ],
  },
});

const MissionGroupModel = defineMasterDataResource({
  model: GS2.mission.MissionGroupModel,
  mount: MissionCollection,
  bindings: {
      name: Bind.domainProperty(Source.direct(MissionCollection, "id")),
      completeNotificationNamespaceId: Bind.null(),
      resetType: Bind.domainProperty(Source.direct(MissionCollection, "scope")),
      resetDayOfMonth: Bind.domainProperty(
        Source.parent(Source.direct(MissionSetting, "resetDayOfMonth"))
      ),
      resetDayOfWeek: Bind.domainProperty(
        Source.parent(Source.direct(MissionSetting, "resetDayOfWeek"))
      ),
      resetHour: Bind.domainProperty(Source.parent(Source.direct(MissionSetting, "resetHour"))),
    },
  arrayChildren: {
    tasks: [
      MissionTaskModel,
    ],
  },
});

const IncreaseMissionCounterTransform = defineActionTransform("IncreaseMissionCounter", {
  category: "acquire",
  parameters: {
    counter: { type: PT.ref(MissionCounter) },
    value: { type: PT.int32() },
  },
  outputs: [
    {
    kind: "direct",
    actionName: "Gs2Mission:IncreaseCounterByUserId",
    resource: () => CounterModel,
    parameterMappings: {
      namespaceName: OutputMap.mountedResourceProperty(() => CounterModel),
      counterName: OutputMap.parameter("counter"),
      userId: OutputMap.placeholder("#{userId}"),
      value: OutputMap.parameter("value"),
    },
  },
  ],
});

export const microEconomyMission = definePackage({
  id: "micro-economy-mission",
  version: "0.0.1",
  display: {
    ja: {
      label: "ミッション",
      description: "日次・週次・月次・リセットなしのミッションと、その達成条件・報酬を管理します。",
    },
    en: {
      label: "Missions",
      description:
        "Manages missions that reset daily, weekly, monthly or never, along with their conditions and rewards.",
    },
  },
  dependencies: {
    "foundation-economy-schedule": "github:gs2io/gs2-studio-package",
  },
  domainTypes: [MissionCollection, MissionCounter, MissionSetting, Mission],
  delegatedActions: [
    { target: MissionCollection, methodName: "Receive", action: { targetActionKey: "Gs2Mission:MissionGroupModel.BatchComplete", targetResource: MissionGroupModel, parameterOverrides: [] } },
    { target: Mission, methodName: "Receive", action: { targetActionKey: "Gs2Mission:MissionTaskModel.Complete", targetResource: MissionTaskModel, parameterOverrides: [] } },
  ],
  masterDataResources: [
    defineMasterDataResource({
  model: GS2.mission.Namespace,
  mount: MissionSetting,
  bindings: {
        name: Bind.static("Mission"),
        ...Bind.nulls(
          "counterIncrementScript",
          "missionCompleteScript",
          "receiveRewardsScript",
          "logSetting"
        ),
        completeNotification: {
          enable: Bind.static("Enabled"),
          enableTransferMobileNotification: Bind.static(false),
          gatewayNamespaceId: Bind.static("grn:gs2:{region}:{ownerId}:gateway:default"),
          sound: Bind.static(""),
        },
        transactionSettingV2: transactionSettingV2(),
      },
  children: [
    CounterModel,
    MissionGroupModel,
  ],
}),
  ],
  userDataResources: [
    defineUserDataResource({
  model: GS2.mission.Complete,
  mount: MissionCollection,
  linkedMaster: MissionGroupModel,
  bindings: {
        completeId: Bind.skip(),
        missionGroupName: Bind.skip(),
        userId: Bind.skip(),
      },
  arrayMembershipMappings: [
    { parameterName: "completedMissionTaskNames", child: Mission, targetKeyProperty: "id", targetProperty: "completed" },
    { parameterName: "receivedMissionTaskNames", child: Mission, targetKeyProperty: "id", targetProperty: "received" },
  ],
}),
    defineUserDataResource({
  model: GS2.mission.Counter,
  linkedMaster: CounterModel,
  bindings: {
        counterId: Bind.skip(),
        name: Bind.skip(),
        userId: Bind.skip(),
      },
  elementProjectionBindings: [
    { parameterName: "values", target: MissionCounter, entries: [
        {
          selectors: [
            { fieldName: "scopeType", value: "resetTiming" },
            { fieldName: "resetType", value: "daily" },
          ],
          projections: [{ fieldName: "value", targetProperty: "todayValue" }],
        },
        {
          selectors: [
            { fieldName: "scopeType", value: "resetTiming" },
            { fieldName: "resetType", value: "weekly" },
          ],
          projections: [{ fieldName: "value", targetProperty: "weeklyValue" }],
        },
        {
          selectors: [
            { fieldName: "scopeType", value: "resetTiming" },
            { fieldName: "resetType", value: "monthly" },
          ],
          projections: [{ fieldName: "value", targetProperty: "monthlyValue" }],
        },
        {
          selectors: [
            { fieldName: "scopeType", value: "resetTiming" },
            { fieldName: "resetType", value: "notReset" },
          ],
          projections: [{ fieldName: "value", targetProperty: "totalValue" }],
        },
      ] },
  ],
}),
  ],
  actionTransforms: [IncreaseMissionCounterTransform],
  uiComponents: [
    defineUiComponent(Mission, {
  items: [
    UiItem.activeToggle("CompletedActiveToggle", UiCond.truthy(UiSource.prop("completed")), {
        name: "Mission",
      }),
    UiItem.activeToggle("ReceivedActiveToggle", UiCond.truthy(UiSource.prop("received")), { name: "Mission" }),
  ],
}),
    defineUiComponent(MissionCounter, {
  items: [
    UiItem.label("TodayValueLabel", UiSource.prop("todayValue"), { name: "MissionCounter" }),
    UiItem.label("WeeklyValueLabel", UiSource.prop("weeklyValue"), { name: "MissionCounter" }),
    UiItem.label("MonthlyValueLabel", UiSource.prop("monthlyValue"), { name: "MissionCounter" }),
    UiItem.label("TotalValueLabel", UiSource.prop("totalValue"), { name: "MissionCounter" }),
  ],
}),
  ],
});

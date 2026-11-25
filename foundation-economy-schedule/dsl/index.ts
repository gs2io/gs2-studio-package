import {
  Bind,
  Cond,
  defineActionTransform,
  defineDomainType,
  defineMasterDataResource,
  definePackage,
  defineUiComponent,
  defineUserDataResource,
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

const dayOfWeekEnum = PT.enum(
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday"
);

const isDaily = Cond.eq("repeatType", "daily");

const isWeekly = Cond.eq("repeatType", "weekly");

const isMonthly = Cond.eq("repeatType", "monthly");

const isCustom = Cond.eq("repeatType", "custom");

const isDailyWeeklyOrMonthly = Cond.or(isDaily, isWeekly, isMonthly);

const Schedule = defineDomainType("Schedule", {
  properties: {
    scheduleType: PT.enum("absolute", "relative").masterData().required(),
    startAt: PT.timestamp().masterData().requiredWhen(Cond.eq("scheduleType", "absolute")),
    endAt: PT.timestamp().masterData().requiredWhen(Cond.eq("scheduleType", "absolute")),
    trigger: PT.string().assetDelivery().requiredWhen(Cond.eq("scheduleType", "relative")),
    triggerFired: PT.bool().userData(),
    relativeStartAt: PT.timestamp().userData(),
    relativeEndAt: PT.timestamp().userData(),
    repeatType: PT.enum("always", "daily", "weekly", "monthly", "custom").masterData().required(),
    beginHour: PT.int32().masterData().requiredWhen(isDailyWeeklyOrMonthly),
    endHour: PT.int32().masterData().requiredWhen(isDailyWeeklyOrMonthly),
    beginDayOfWeek: dayOfWeekEnum.masterData().requiredWhen(isWeekly),
    endDayOfWeek: dayOfWeekEnum.masterData().requiredWhen(isWeekly),
    beginDayOfMonth: PT.int32().masterData().requiredWhen(isMonthly),
    endDayOfMonth: PT.int32().masterData().requiredWhen(isMonthly),
    anchorTimestamp: PT.timestamp().masterData().requiredWhen(isCustom),
    activeDays: PT.int32().masterData().requiredWhen(isCustom),
    inactiveDays: PT.int32().masterData().requiredWhen(isCustom),
  },
  localizedDisplay: {
    ja: {
      label: "スケジュール",
      description: "イベントや機能を有効にする開始・終了日時と繰り返し条件を設定します。",
    },
    en: {
      label: "Schedule",
      description: "Defines start and end times and recurrence rules for events or features.",
    },
  },
  localizedProperties: {
      id: jaEnId("スケジュール", "schedule"),
      scheduleType: jaEnField(
        "スケジュール方式",
        "Schedule type",
        "絶対日時またはトリガー基準の相対日時を選択します。",
        "Whether the schedule uses absolute times or times relative to a trigger."
      ),
      startAt: jaEnField(
        "開始日時",
        "Start time",
        "絶対日時方式で機能を開始する日時です。UTC の ISO 8601 形式（末尾 Z）で指定します（例: 2026-11-30T15:00:00Z）。+09:00 などのオフセットは使えません。",
        "Start time for an absolute schedule, as a UTC ISO 8601 timestamp ending in Z (e.g. 2026-11-30T15:00:00Z); offsets such as +09:00 are not accepted."
      ),
      endAt: jaEnField(
        "終了日時",
        "End time",
        "絶対日時方式で機能を終了する日時です。UTC の ISO 8601 形式（末尾 Z）で指定し、+09:00 などのオフセットは使えません。この時刻自体が期間に含まれるかは GS2 のドキュメントに記載がないため、期間内に含めたい最後の時刻を指定します（例: 2026-12-31T14:59:59Z）。",
        "End time for an absolute schedule, as a UTC ISO 8601 timestamp ending in Z; offsets such as +09:00 are not accepted. GS2's documentation does not say whether this instant is inside the period, so give the last moment that must be inside (e.g. 2026-12-31T14:59:59Z)."
      ),
      trigger: jaEnField(
        "基準トリガー",
        "Reference trigger",
        "相対日時方式の基準にするトリガーです。",
        "Trigger used as the reference for a relative schedule."
      ),
      triggerFired: jaEnField(
        "トリガー発火済み",
        "Trigger fired",
        "このプレイヤーに対して基準トリガーが発火済みかを示します。",
        "Whether the reference trigger has fired for this player."
      ),
      relativeStartAt: jaEnField(
        "相対開始日時",
        "Relative start time",
        "相対日時方式で、このプレイヤーの開催期間が始まった日時です。基準トリガーの発火日時と一致します。",
        "When this player's relative schedule opened. Equals the reference trigger's fire time."
      ),
      relativeEndAt: jaEnField(
        "相対終了日時",
        "Relative end time",
        "相対日時方式で、このプレイヤーの開催期間が終わる日時です。基準トリガーの有効期限と一致します。",
        "When this player's relative schedule closes. Equals the reference trigger's expiration."
      ),
      repeatType: jaEnField(
        "繰り返し方式",
        "Repeat type",
        "スケジュールを繰り返す周期の種類です。",
        "Cadence used to repeat the schedule."
      ),
      beginHour: jaEnField(
        "開始時刻",
        "Start hour",
        "日次・週次・月次の有効時間帯が始まる時刻です。",
        "Hour when the active period begins for daily, weekly, or monthly repetition.",
        { ja: "時", en: "hour" }
      ),
      endHour: jaEnField(
        "終了時刻",
        "End hour",
        "日次・週次・月次の有効時間帯が終わる時刻です。",
        "Hour when the active period ends for daily, weekly, or monthly repetition.",
        { ja: "時", en: "hour" }
      ),
      beginDayOfWeek: jaEnField(
        "開始曜日",
        "Start weekday",
        "週次スケジュールの有効期間が始まる曜日です。",
        "Weekday when a weekly active period begins."
      ),
      endDayOfWeek: jaEnField(
        "終了曜日",
        "End weekday",
        "週次スケジュールの有効期間が終わる曜日です。",
        "Weekday when a weekly active period ends."
      ),
      beginDayOfMonth: jaEnField(
        "開始日",
        "Start day of month",
        "月次スケジュールの有効期間が始まる日です。",
        "Day of the month when a monthly active period begins.",
        { ja: "日", en: "day" }
      ),
      endDayOfMonth: jaEnField(
        "終了日",
        "End day of month",
        "月次スケジュールの有効期間が終わる日です。",
        "Day of the month when a monthly active period ends.",
        { ja: "日", en: "day" }
      ),
      anchorTimestamp: jaEnField(
        "基準日時",
        "Anchor time",
        "カスタム周期を数える基準日時です。",
        "Reference time used to calculate a custom cycle."
      ),
      activeDays: jaEnField(
        "有効日数",
        "Active days",
        "カスタム周期で機能を有効にする日数です。",
        "Number of active days in a custom cycle.",
        { ja: "日", en: "days" }
      ),
      inactiveDays: jaEnField(
        "無効日数",
        "Inactive days",
        "カスタム周期で機能を無効にする日数です。",
        "Number of inactive days in a custom cycle.",
        { ja: "日", en: "days" }
      ),
    },
});

const Trigger = defineDomainType("Trigger", {
  properties: {
    triggered: PT.bool().userData().required(),
    triggeredAt: PT.timestamp().userData().required(),
    expiresAt: PT.timestamp().userData().required(),
  },
  localizedDisplay: {
    ja: {
      label: "トリガー",
      description: "プレイヤーごとのトリガー発火状態と有効期限を管理します。",
    },
    en: {
      label: "Trigger",
      description: "Tracks each player's trigger state, trigger time, and expiration.",
    },
  },
  localizedProperties: {
      id: jaEnId("トリガー", "trigger"),
      triggered: jaEnField(
        "発火済み",
        "Triggered",
        "このトリガーがプレイヤーに対して発火済みかを示します。",
        "Whether this trigger has fired for the player."
      ),
      triggeredAt: jaEnField(
        "発火日時",
        "Triggered at",
        "トリガーが発火した日時です。",
        "Time when the trigger fired."
      ),
      expiresAt: jaEnField(
        "有効期限",
        "Expiration time",
        "トリガー状態が有効な期限です。",
        "Time until which the trigger state remains valid."
      ),
    },
});

const Namespace = defineMasterDataResource({
  model: GS2.schedule.Namespace,
  bindings: {
      name: Bind.static("Schedule"),
      logSetting: Bind.null(),
      transactionSettingV2: transactionSettingV2(),
    },
  children: [
    defineMasterDataResource({
  model: GS2.schedule.Event,
  mount: Schedule,
  bindings: {
          name: Bind.domainProperty(Source.direct(Schedule, "id")),
          metadata: Bind.static(""),
          scheduleType: Bind.domainProperty(Source.direct(Schedule, "scheduleType")),
          absoluteBegin: Bind.domainProperty(Source.direct(Schedule, "startAt")),
          absoluteEnd: Bind.domainProperty(Source.direct(Schedule, "endAt")),
          relativeTriggerName: Bind.domainProperty(Source.direct(Schedule, "trigger")),
          repeatSetting: {
            repeatType: Bind.domainProperty(Source.direct(Schedule, "repeatType")),
            beginHour: Bind.domainProperty(Source.direct(Schedule, "beginHour")),
            endHour: Bind.domainProperty(Source.direct(Schedule, "endHour")),
            beginDayOfWeek: Bind.domainProperty(Source.direct(Schedule, "beginDayOfWeek")),
            endDayOfWeek: Bind.domainProperty(Source.direct(Schedule, "endDayOfWeek")),
            beginDayOfMonth: Bind.domainProperty(Source.direct(Schedule, "beginDayOfMonth")),
            endDayOfMonth: Bind.domainProperty(Source.direct(Schedule, "endDayOfMonth")),
            anchorTimestamp: Bind.domainProperty(Source.direct(Schedule, "anchorTimestamp")),
            activeDays: Bind.domainProperty(Source.direct(Schedule, "activeDays")),
            inactiveDays: Bind.domainProperty(Source.direct(Schedule, "inactiveDays")),
          },
        },
}),
  ],
});

const PullTriggerTransform = defineActionTransform("PullTrigger", {
  category: "acquire",
  parameters: {
    trigger: { type: PT.ref(Trigger) },
    ttlSeconds: { type: PT.int32() },
  },
  outputs: [
    {
    kind: "direct",
    actionName: "Gs2Schedule:TriggerByUserId",
    resource: () => Namespace,
    parameterMappings: {
      namespaceName: OutputMap.resourceKey(),
      triggerName: OutputMap.parameter("trigger"),
      userId: OutputMap.placeholder("#{userId}"),
      triggerStrategy: OutputMap.static("renew"),
      ttl: OutputMap.parameter("ttlSeconds"),
      eventId: OutputMap.static(null),
    },
  },
  ],
});

const ClearTriggerTransform = defineActionTransform("ClearTrigger", {
  category: "consume",
  parameters: {
    trigger: { type: PT.ref(Trigger) },
  },
  outputs: [
    {
    kind: "direct",
    actionName: "Gs2Schedule:DeleteTriggerByUserId",
    resource: () => Namespace,
    parameterMappings: {
      namespaceName: OutputMap.resourceKey(),
      triggerName: OutputMap.parameter("trigger"),
      userId: OutputMap.placeholder("#{userId}"),
    },
  },
  ],
});

const TriggerScheduleTransform = defineActionTransform("TriggerSchedule", {
  category: "acquire",
  parameters: {
    trigger: { type: PT.ref(Trigger) },
    extendSeconds: { type: PT.int32() },
  },
  outputs: [
    {
    kind: "direct",
    actionName: "Gs2Schedule:ExtendTriggerByUserId",
    resource: () => Namespace,
    parameterMappings: {
      namespaceName: OutputMap.resourceKey(),
      triggerName: OutputMap.parameter("trigger"),
      userId: OutputMap.placeholder("#{userId}"),
      extendSeconds: OutputMap.parameter("extendSeconds"),
    },
  },
  ],
});

export const foundationEconomySchedule = definePackage({
  id: "foundation-economy-schedule",
  version: "0.0.1",
  display: {
    ja: {
      label: "スケジュール基盤",
      description: "期間限定イベントなど、他の機能が使う日程とトリガーを共通基盤として提供します。",
    },
    en: {
      label: "Scheduling",
      description: "Shared date-range and trigger infrastructure other features build on.",
    },
  },
  domainTypes: [Schedule, Trigger],
  masterDataResources: [
    Namespace,
  ],
  userDataResources: [
    defineUserDataResource({
  model: GS2.schedule.Trigger,
  mount: Trigger,
  existenceProperty: "triggered",
  bindings: {
        name: Bind.domainProperty(Source.direct(Trigger, "id")),
        triggeredAt: Bind.domainProperties([Source.direct(Trigger, "triggeredAt")]),
        expiresAt: Bind.domainProperties([Source.direct(Trigger, "expiresAt")]),
        triggerId: Bind.skip(),
        userId: Bind.skip(),
      },
}),
    defineUserDataResource({
  model: GS2.schedule.Trigger,
  mount: Schedule,
  existenceProperty: "triggerFired",
  bindings: {
        name: Bind.domainProperty(Source.direct(Schedule, "trigger")),
        triggeredAt: Bind.domainProperties([Source.direct(Schedule, "relativeStartAt")]),
        expiresAt: Bind.domainProperties([Source.direct(Schedule, "relativeEndAt")]),
        triggerId: Bind.skip(),
        userId: Bind.skip(),
      },
}),
  ],
  actionTransforms: [PullTriggerTransform, ClearTriggerTransform, TriggerScheduleTransform],
  uiComponents: [
    defineUiComponent(Schedule, {
  items: [
    UiItem.templateLabel("PeriodLabel", "{startAt} - {endAt}", { startAt: UiSource.prop("startAt"), endAt: UiSource.prop("endAt") }, { name: "Schedule" }),
    UiItem.value("EndAtValue", UiSource.prop("endAt"), { name: "Schedule" }),
    UiItem.value("StartAtValue", UiSource.prop("startAt"), { name: "Schedule" }),
    UiItem.templateLabel("RelativeWindowLabel", "{relativeStartAt} - {relativeEndAt}", {
          relativeStartAt: UiSource.prop("relativeStartAt"),
          relativeEndAt: UiSource.prop("relativeEndAt"),
        }, { name: "Schedule" }),
    UiItem.value("RelativeEndAtValue", UiSource.prop("relativeEndAt"), { name: "Schedule" }),
    UiItem.activeToggle("RelativeActiveToggle", UiCond.eq(UiSource.prop("scheduleType"), UiSource.lit("relative")), { name: "Schedule" }),
    UiItem.activeToggle("AbsoluteActiveToggle", UiCond.eq(UiSource.prop("scheduleType"), UiSource.lit("absolute")), { name: "Schedule" }),
  ],
}),
    defineUiComponent(Trigger, {
  items: [
    UiItem.templateLabel("NameLabel", "{id}", { id: UiSource.prop("id") }, { name: "Trigger" }),
    UiItem.templateLabel("WindowLabel", "{triggeredAt} - {expiresAt}", { triggeredAt: UiSource.prop("triggeredAt"), expiresAt: UiSource.prop("expiresAt") }, { name: "Trigger" }),
    UiItem.value("ExpiresAtValue", UiSource.prop("expiresAt"), { name: "Trigger" }),
    UiItem.activeToggle("TriggeredActiveToggle", UiCond.truthy(UiSource.prop("triggered")), {
        name: "Trigger",
      }),
    UiItem.interactable("TriggeredInteractable", UiCond.truthy(UiSource.prop("triggered")), {
        name: "Trigger",
      }),
  ],
}),
  ],
});

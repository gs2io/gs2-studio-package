import {
  Bind,
  Cond,
  defineDomainType,
  defineMasterDataResource,
  definePackage,
  PT,
  Source,
} from "~/dsl";
import { GS2 } from "~/dsl/gs2";

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

// Conditions for repeatType-dependent properties
const isDaily = Cond.eq("repeatType", "daily");
const isWeekly = Cond.eq("repeatType", "weekly");
const isMonthly = Cond.eq("repeatType", "monthly");
const isCustom = Cond.eq("repeatType", "custom");
const isDailyWeeklyOrMonthly = Cond.or(isDaily, isWeekly, isMonthly);

const Schedule = defineDomainType("Schedule", dt =>
  dt
    .idDescription("Unique identifier")
    // --- Schedule type discriminator ---
    .property(PT.prop("scheduleType", PT.enum("absolute", "relative")).masterData().required())
    // --- Absolute schedule properties ---
    .property(
      PT.timestamp("startAt").masterData().requiredWhen(Cond.eq("scheduleType", "absolute"))
    )
    .property(PT.timestamp("endAt").masterData().requiredWhen(Cond.eq("scheduleType", "absolute")))
    // --- Relative schedule properties ---
    .property(
      PT.string("trigger").assetDelivery().requiredWhen(Cond.eq("scheduleType", "relative"))
    )
    // --- Repeat type discriminator ---
    .property(
      PT.prop("repeatType", PT.enum("always", "daily", "weekly", "monthly", "custom"))
        .masterData()
        .required()
    )
    // --- Daily/Weekly/Monthly: beginHour, endHour ---
    .property(PT.int32("beginHour").masterData().requiredWhen(isDailyWeeklyOrMonthly))
    .property(PT.int32("endHour").masterData().requiredWhen(isDailyWeeklyOrMonthly))
    // --- Weekly: beginDayOfWeek, endDayOfWeek ---
    .property(PT.prop("beginDayOfWeek", dayOfWeekEnum).masterData().requiredWhen(isWeekly))
    .property(PT.prop("endDayOfWeek", dayOfWeekEnum).masterData().requiredWhen(isWeekly))
    // --- Monthly: beginDayOfMonth, endDayOfMonth ---
    .property(PT.int32("beginDayOfMonth").masterData().requiredWhen(isMonthly))
    .property(PT.int32("endDayOfMonth").masterData().requiredWhen(isMonthly))
    // --- Custom: anchorTimestamp, activeDays, inactiveDays ---
    .property(PT.timestamp("anchorTimestamp").masterData().requiredWhen(isCustom))
    .property(PT.int32("activeDays").masterData().requiredWhen(isCustom))
    .property(PT.int32("inactiveDays").masterData().requiredWhen(isCustom))
    .localizedProperties({
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
        "絶対日時方式で機能を開始する日時です。",
        "Start time for an absolute schedule."
      ),
      endAt: jaEnField(
        "終了日時",
        "End time",
        "絶対日時方式で機能を終了する日時です。",
        "End time for an absolute schedule."
      ),
      trigger: jaEnField(
        "基準トリガー",
        "Reference trigger",
        "相対日時方式の基準にするトリガーです。",
        "Trigger used as the reference for a relative schedule."
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
    })
);

const Trigger = defineDomainType("Trigger", dt =>
  dt
    .idDescription("Unique identifier")
    .property(PT.bool("triggered").userData().required())
    .property(PT.timestamp("triggeredAt").userData().required())
    .property(PT.timestamp("expiresAt").userData().required())
    .localizedProperties({
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
    })
);

const Namespace = defineMasterDataResource(resource =>
  resource
    .model(GS2.schedule.Namespace)
    .bindings({
      name: Bind.static("Schedule"),
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
    .addChild(child => {
      child
        .model(GS2.schedule.Event)
        .mountLocal(Schedule)
        .bindings({
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
        });
    })
);

export const foundationEconomySchedule = definePackage("foundation-economy-schedule", "0.0.0")
  .display({
    label: { ja: "スケジュール基盤", en: "Scheduling" },
    description: {
      ja: "期間限定イベントなど、他の機能が使う日程・トリガーの共通基盤です。",
      en: "Shared date-range and trigger infrastructure other features build on.",
    },
  })
  .displayType(Schedule, {
    label: { ja: "スケジュール", en: "Schedule" },
    description: {
      ja: "イベントや機能を有効にする開始・終了日時と繰り返し条件を設定します。",
      en: "Defines start and end times and recurrence rules for events or features.",
    },
  })
  .displayType(Trigger, {
    label: { ja: "トリガー", en: "Trigger" },
    description: {
      ja: "プレイヤーごとのトリガー発火状態と有効期限を管理します。",
      en: "Tracks each player's trigger state, trigger time, and expiration.",
    },
  })
  .domainType(Schedule)
  .domainType(Trigger)

  .masterDataResource(Namespace)

  .userDataResource(r =>
    r
      .model(GS2.schedule.Trigger)
      .mountLocal(Trigger)
      .existenceProperty("triggered")
      .bindings({
        name: Bind.domainProperty(Source.direct(Trigger, "id")),
        triggeredAt: Bind.domainProperties([Source.direct(Trigger, "triggeredAt")]),
        expiresAt: Bind.domainProperties([Source.direct(Trigger, "expiresAt")]),
        triggerId: Bind.skip(),
        userId: Bind.skip(),
      })
  )

  .actionTransform("TriggerSchedule", at =>
    at
      .category("acquire")
      .parameter("trigger", { type: PT.ref("Trigger") })
      .parameter("extendSeconds", { type: PT.int32() })
      .output("Gs2Schedule:ExtendTriggerByUserId", o =>
        o
          .resourceRef(() => Namespace)
          .mapResourceKey("namespaceName")
          .mapParameter("triggerName", "trigger")
          .mapPlaceholder("userId", "#{userId}")
          .mapParameter("extendSeconds", "extendSeconds")
      )
  )
  .build();

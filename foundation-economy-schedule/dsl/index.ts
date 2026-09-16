import {
  Bind,
  Cond,
  defineDomainType,
  defineMasterDataResource,
  definePackage,
  PT,
  Source,
  transactionSetting,
  UiCond,
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
    // A relative schedule has no window until its trigger fires, and then the
    // window is the trigger's own: it runs from when the trigger fired until
    // the trigger expires. Reading it per player is the only way the schedule
    // can say when it closes, because `startAt` / `endAt` above are the
    // absolute schedule's times and every player shares them.
    .property(PT.bool("triggerFired").userData())
    .property(PT.timestamp("relativeStartAt").userData())
    .property(PT.timestamp("relativeEndAt").userData())
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
    })
);

const Trigger = defineDomainType("Trigger", dt =>
  dt
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
      transactionSetting: transactionSetting(),
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

  // The same GS2 record read from the schedule that names it. Each schedule
  // row keys this by its own `trigger`, so the window it reports is that
  // player's window for that schedule — and because the binder subscribes to
  // the record, pulling, extending or clearing the trigger moves the
  // schedule's window with it. A schedule whose trigger has never fired has
  // no record at all, which is what `triggerFired` reports.
  .userDataResource(r =>
    r
      .model(GS2.schedule.Trigger)
      .mountLocal(Schedule)
      .existenceProperty("triggerFired")
      .bindings({
        name: Bind.domainProperty(Source.direct(Schedule, "trigger")),
        triggeredAt: Bind.domainProperties([Source.direct(Schedule, "relativeStartAt")]),
        expiresAt: Bind.domainProperties([Source.direct(Schedule, "relativeEndAt")]),
        triggerId: Bind.skip(),
        userId: Bind.skip(),
      })
  )

  // Pulling a trigger is what brings it into existence; extending one only
  // works on a trigger that is already running, and clearing one is how a
  // player gets back to the state they started in. A package that models the
  // trigger has to offer all three or the other two are unreachable.
  .actionTransform("PullTrigger", at =>
    at
      .category("acquire")
      .parameter("trigger", { type: PT.ref("Trigger") })
      .parameter("ttlSeconds", { type: PT.int32() })
      .output("Gs2Schedule:TriggerByUserId", o =>
        o
          .resourceRef(() => Namespace)
          .mapResourceKey("namespaceName")
          .mapParameter("triggerName", "trigger")
          .mapPlaceholder("userId", "#{userId}")
          // Pulling an already-running trigger starts its window over rather
          // than adding to it: extending is what `TriggerSchedule` is for, and
          // one press should not quietly do the other one's job.
          .mapStatic("triggerStrategy", "renew")
          // GS2 reads `ttl` as seconds, not minutes — a five that meant five
          // minutes bought five seconds, and the window was over before the
          // press that opened it had finished redrawing.
          .mapParameter("ttl", "ttlSeconds")
          .mapStatic("eventId", null)
      )
  )
  .actionTransform("ClearTrigger", at =>
    at
      .category("consume")
      .parameter("trigger", { type: PT.ref("Trigger") })
      .output("Gs2Schedule:DeleteTriggerByUserId", o =>
        o
          .resourceRef(() => Namespace)
          .mapResourceKey("namespaceName")
          .mapParameter("triggerName", "trigger")
          .mapPlaceholder("userId", "#{userId}")
      )
  )

  // When a window opens and closes is the whole of what a schedule says, so
  // it ships with the model rather than being rebuilt per screen. An absolute
  // window carries both ends; a relative one carries neither, because its ends
  // are whenever the player pulled the trigger and whenever that runs out.
  .uiComponent(Schedule, ui =>
    ui
      .templateLabel(
        "PeriodLabel",
        "{startAt} - {endAt}",
        { startAt: ui.prop("startAt"), endAt: ui.prop("endAt") },
        { name: "Schedule" }
      )
      // Handed over typed so a screen can count down to it rather than print
      // it. Which of the two a title shows is a question about the title.
      .value("EndAtValue", ui.prop("endAt"), { name: "Schedule" })
      .value("StartAtValue", ui.prop("startAt"), { name: "Schedule" })
      // The same two readings for the relative case, where the window is the
      // one this player's trigger opened. A screen that shows both kinds of
      // schedule in one list reads whichever pair the row has.
      .templateLabel(
        "RelativeWindowLabel",
        "{relativeStartAt} - {relativeEndAt}",
        {
          relativeStartAt: ui.prop("relativeStartAt"),
          relativeEndAt: ui.prop("relativeEndAt"),
        },
        { name: "Schedule" }
      )
      .value("RelativeEndAtValue", ui.prop("relativeEndAt"), { name: "Schedule" })
      // Each kind of schedule carries one of the two windows and nothing for
      // the other, so a page that shows both readings shows one of them empty
      // on every row. Each toggle names the kind that makes its rows
      // meaningless: hang the absolute readings off the relative one, and the
      // relative readings off the absolute one.
      .activeToggle(
        "RelativeActiveToggle",
        UiCond.eq(ui.prop("scheduleType"), ui.lit("relative")),
        { name: "Schedule" }
      )
      .activeToggle(
        "AbsoluteActiveToggle",
        UiCond.eq(ui.prop("scheduleType"), ui.lit("absolute")),
        { name: "Schedule" }
      )
  )

  // What a trigger is worth knowing about: whether it is running, and until
  // when. Both are the same reading in every title that pulls one.
  .uiComponent(Trigger, ui =>
    ui
      .templateLabel("NameLabel", "{id}", { id: ui.prop("id") }, { name: "Trigger" })
      // When it was pulled and when it runs out, as the server reported them.
      // A countdown answers "how long left"; this answers "is the server
      // saying what I think it is", which is the question when it is not.
      .templateLabel(
        "WindowLabel",
        "{triggeredAt} - {expiresAt}",
        { triggeredAt: ui.prop("triggeredAt"), expiresAt: ui.prop("expiresAt") },
        { name: "Trigger" }
      )
      .value("ExpiresAtValue", ui.prop("expiresAt"), { name: "Trigger" })
      // A trigger that has never been pulled has no window to show, and one
      // that is running has nothing to say about not being pulled.
      .activeToggle("TriggeredActiveToggle", UiCond.truthy(ui.prop("triggered")), {
        name: "Trigger",
      })
      .interactable("TriggeredInteractable", UiCond.truthy(ui.prop("triggered")), {
        name: "Trigger",
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

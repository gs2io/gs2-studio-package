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
);

const Trigger = defineDomainType("Trigger", dt =>
  dt
    .idDescription("Unique identifier")
    .property(PT.bool("triggered").userData().required())
    .property(PT.timestamp("triggeredAt").userData().required())
    .property(PT.timestamp("expiresAt").userData().required())
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
  .displayType(Schedule, { label: { ja: "スケジュール", en: "Schedule" } })
  .displayType(Trigger, { label: { ja: "トリガー", en: "Trigger" } })
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

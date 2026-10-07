import {
  Arg,
  Bind,
  defineDomainType,
  defineMasterDataResource,
  definePackage,
  dependencyPackage,
  PT,
  Source,
  transactionSetting,
} from "~/dsl";
import { GS2 } from "~/dsl/gs2";

import scheduleSurface from "../../dsl/dependency-surface.json";

const schedule = dependencyPackage(scheduleSurface);

const Schedule = schedule.type("Schedule");
const Trigger = schedule.type("Trigger");

/** Author a separate pull row so the trigger can be started before any user-data trigger exists. */
const TriggerPull = defineDomainType("TriggerPull", domainType =>
  domainType
    .property(
      PT.prop("trigger", PT.ref(schedule.typeId("Trigger")))
        .masterData()
        .required()
    )
    .localizedProperties({
      id: {
        ja: { label: "トリガー発火", description: "デモでトリガーを 1 つ引きます。" },
        en: { label: "Pull", description: "Pulls one trigger in the demo." },
      },
      trigger: {
        ja: { label: "トリガー", description: "この行が引くトリガーです。" },
        en: { label: "Trigger", description: "The trigger this row pulls." },
      },
    })
);

const TTL_SECONDS = 300;

const EXTEND_SECONDS = 60;

/** Separate namespaces because pull, extend and clear derive the same rate name from the trigger id. */
const PullRateModel = defineMasterDataResource(resource =>
  resource
    .model(GS2.exchange.RateModel)
    .mountLocal(TriggerPull)
    .bindings({ name: Bind.domainProperty(Source.direct(TriggerPull, "id")) })
    .addArrayChild("acquireActions", acquireAction => {
      acquireAction
        .model(GS2.transaction.AcquireAction)
        .mountLocal(TriggerPull)
        .bindings({
          action: Bind.transform(schedule.packageId, "PullTrigger", [
            Arg.domainProperty("trigger", Source.parent(Source.direct(TriggerPull, "trigger"))),
            Arg.static("ttlSeconds", TTL_SECONDS),
          ]),
        });
    })
);

const ExtendRateModel = defineMasterDataResource(resource =>
  resource
    .model(GS2.exchange.RateModel)
    .mountLocal(Trigger)
    .bindings({ name: Bind.domainProperty(Source.direct("Trigger", "id")) })
    .addArrayChild("acquireActions", acquireAction => {
      acquireAction
        .model(GS2.transaction.AcquireAction)
        .mountLocal(Trigger)
        .bindings({
          action: Bind.transform(schedule.packageId, "TriggerSchedule", [
            Arg.domainProperty("trigger", Source.direct("Trigger", "id")),
            Arg.static("extendSeconds", EXTEND_SECONDS),
          ]),
        });
    })
);

const ClearRateModel = defineMasterDataResource(resource =>
  resource
    .model(GS2.exchange.RateModel)
    .mountLocal(Trigger)
    .bindings({ name: Bind.domainProperty(Source.direct("Trigger", "id")) })
    .addArrayChild("consumeActions", consumeAction => {
      consumeAction
        .model(GS2.transaction.ConsumeAction)
        .mountLocal(Trigger)
        .bindings({
          action: Bind.transform(schedule.packageId, "ClearTrigger", [
            Arg.domainProperty("trigger", Source.direct("Trigger", "id")),
          ]),
        });
    })
);

export const foundationEconomyScheduleDemo = definePackage(
  "foundation-economy-schedule-demo",
  "0.0.0"
)
  .display({
    label: { ja: "スケジュール基盤（デモデータ）", en: "Scheduling (demo data)" },
    description: {
      ja: "ライブデモ用のイベント日程と、トリガーの発火・延長・解除の操作を提供します。",
      en: "Supplies the event windows used by the live demo, and the presses that pull, extend and clear a trigger.",
    },
  })
  .dependency(schedule.packageId, "github:gs2io/gs2-studio-package")
  .domainType(TriggerPull)

  // Keep the open fixture valid for years so routine demo use does not outlive a short event window.
  .instance(Schedule, "open-season", {
    [schedule.propertyId("Schedule", "scheduleType")]: "absolute",
    [schedule.propertyId("Schedule", "startAt")]: 1789064562011,
    [schedule.propertyId("Schedule", "endAt")]: 1924992000000,
    [schedule.propertyId("Schedule", "repeatType")]: "always",
  })
  .instance(Schedule, "closed-season", {
    [schedule.propertyId("Schedule", "scheduleType")]: "absolute",
    [schedule.propertyId("Schedule", "startAt")]: 1786904562011,
    [schedule.propertyId("Schedule", "endAt")]: 1789237362011,
    [schedule.propertyId("Schedule", "repeatType")]: "always",
  })

  .instance(Schedule, "happy-hour", {
    [schedule.propertyId("Schedule", "scheduleType")]: "relative",
    [schedule.propertyId("Schedule", "trigger")]: "happy-hour",
    [schedule.propertyId("Schedule", "repeatType")]: "always",
  })

  // Own ranking schedules here so every demo deploys the same shared schedule stack.
  .instance(Schedule, "ranking-contest", {
    [schedule.propertyId("Schedule", "scheduleType")]: "relative",
    [schedule.propertyId("Schedule", "trigger")]: "ranking-contest",
    [schedule.propertyId("Schedule", "repeatType")]: "always",
  })

  // Share an absolute daily season across guild members; align the start to UTC midnight for its daily boundaries.
  .instance(Schedule, "guild-season", {
    [schedule.propertyId("Schedule", "scheduleType")]: "absolute",
    [schedule.propertyId("Schedule", "startAt")]: 1788220800000,
    [schedule.propertyId("Schedule", "endAt")]: 1924992000000,
    [schedule.propertyId("Schedule", "repeatType")]: "daily",
    [schedule.propertyId("Schedule", "beginHour")]: 0,
    [schedule.propertyId("Schedule", "endHour")]: 0,
  })

  // Author the empty trigger row to supply the identity used to name its extend and clear rates.
  .instance(Trigger, "happy-hour", {})

  .instance("TriggerPull", "happy-hour", { trigger: "happy-hour" })

  .masterDataResource(resource =>
    resource
      .model(GS2.exchange.Namespace)
      .bindings({
        name: Bind.static("TriggerPull"),
        ...Bind.nulls(
          "acquireAwaitScript",
          "exchangeScript",
          "incrementalExchangeScript",
          "logSetting"
        ),
        // Auto-run executes the transaction without a second client request after the exchange.
        transactionSetting: transactionSetting({
          enableAtomicCommit: Bind.static(true),
          enableAutoRun: Bind.static(true),
        }),
      })
      .addChild(PullRateModel)
  )

  .masterDataResource(resource =>
    resource
      .model(GS2.exchange.Namespace)
      .bindings({
        name: Bind.static("TriggerExtend"),
        ...Bind.nulls(
          "acquireAwaitScript",
          "exchangeScript",
          "incrementalExchangeScript",
          "logSetting"
        ),
        transactionSetting: transactionSetting({
          enableAtomicCommit: Bind.static(true),
          enableAutoRun: Bind.static(true),
        }),
      })
      .addChild(ExtendRateModel)
  )

  .masterDataResource(resource =>
    resource
      .model(GS2.exchange.Namespace)
      .bindings({
        name: Bind.static("TriggerClear"),
        ...Bind.nulls(
          "acquireAwaitScript",
          "exchangeScript",
          "incrementalExchangeScript",
          "logSetting"
        ),
        transactionSetting: transactionSetting({
          enableAtomicCommit: Bind.static(true),
          enableAutoRun: Bind.static(true),
        }),
      })
      .addChild(ClearRateModel)
  )

  .uiComponent(TriggerPull, ui =>
    ui
      .templateLabel("NameLabel", "{id}", { id: ui.prop("id") }, { name: "TriggerPull" })
      .buttonAction("PullButton", "Pull", undefined, { name: "TriggerPull" })
  )

  // Name these readings as remaining durations because the page renders countdowns rather than timestamps.
  .uiComponent(Trigger, ui =>
    ui
      .value("ExpiresInValue", ui.prop("expiresAt"), { name: "Trigger" })
      .buttonAction("ExtendButton", "Extend", undefined, { name: "Trigger" })
      .buttonAction("ClearButton", "Clear", undefined, { name: "Trigger" })
  )

  .uiComponent(Schedule, ui =>
    ui
      .templateLabel(
        "WindowLabel",
        "{id} ({scheduleType})",
        {
          id: ui.prop("id"),
          scheduleType: ui.prop("scheduleType"),
        },
        { name: "Schedule" }
      )
      .value("EndsInValue", ui.prop("endAt"), { name: "Schedule" })
      .value("ClosesInValue", ui.prop("relativeEndAt"), { name: "Schedule" })
  )

  .delegatedAction(TriggerPull, "Pull", {
    targetActionKey: "Gs2Exchange:RateModel.Exchange",
    targetResource: PullRateModel,
    parameterOverrides: [{ kind: "static", parameterName: "count", value: 1 }],
  })
  .delegatedAction(Trigger, "Extend", {
    targetActionKey: "Gs2Exchange:RateModel.Exchange",
    targetResource: ExtendRateModel,
    parameterOverrides: [{ kind: "static", parameterName: "count", value: 1 }],
  })
  .delegatedAction(Trigger, "Clear", {
    targetActionKey: "Gs2Exchange:RateModel.Exchange",
    targetResource: ClearRateModel,
    parameterOverrides: [{ kind: "static", parameterName: "count", value: 1 }],
  })
  .build();

/**
 * Live demo content for `foundation-economy-schedule`.
 *
 * The feature package is infrastructure: six other packages ask it whether
 * something is open right now. It ships no schedules of its own, because when
 * a title's events run is the title's decision.
 *
 * Two halves are worth seeing. An absolute schedule is a window on the clock,
 * fixed when the title is built — so the demo authors one that is open and one
 * that has closed, and they read the same whoever is looking. A relative
 * schedule starts when a player pulls its trigger, so its window is different
 * for everyone, and the presses below are how a visitor moves theirs.
 */

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

/**
 * Something to press before a trigger exists.
 *
 * A trigger is user data and nothing else — there is no catalogue of triggers,
 * so a list of them is empty until someone has pulled one, and the button that
 * would pull it would have no row to sit on. A row that names the trigger it
 * pulls is a model of its own, and it is also what the exchange hands to
 * `PullTrigger`.
 */
const TriggerPull = defineDomainType("TriggerPull", domainType =>
  domainType
    .property(
      PT.prop("trigger", PT.ref(schedule.typeId("Trigger")))
        .masterData()
        .required()
    )
    .localizedProperties({
      id: {
        ja: { label: "トリガー発火", description: "デモでトリガーを1つ引きます。" },
        en: { label: "Pull", description: "Pulls one trigger in the demo." },
      },
      trigger: {
        ja: { label: "トリガー", description: "この行が引くトリガーです。" },
        en: { label: "Trigger", description: "The trigger this row pulls." },
      },
    })
);

/** The window a pulled trigger stays open for. GS2 counts this in seconds. */
const TTL_SECONDS = 300;

/** What one press of Extend adds. */
const EXTEND_SECONDS = 60;

/**
 * Pulling the trigger, modelled as an exchange that costs nothing.
 *
 * The rate is named after the trigger because a delegated action on `Trigger`
 * must target a resource that mounts `Trigger` — that is how the generated
 * loader learns which rate to exchange.
 *
 * Each press gets its own exchange namespace: all three rates are named after
 * the same trigger, and sharing a namespace collides the `rateModels` array on
 * its primary key and drops the whole `CurrentRateMaster` from the template.
 */
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

/** Adding to a window that is already open. */
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

/** Putting a visitor back where they started. */
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

  // Two absolute windows a visitor can compare: one that is open, and one that
  // closed and is therefore not listed at all. Both are fixed on the clock, so
  // every visitor sees the same two.
  //
  // The open one ends in 2031 rather than in a few days. This demo is left
  // standing for months at a time, and a window pinned near the day it was
  // authored quietly falls out of its own period and stops demonstrating
  // anything. The countdown beside it reads in days, which is the honest
  // reading for a window that runs for years.
  .instance(Schedule, "open-season", {
    [schedule.propertyId("Schedule", "scheduleType")]: "absolute",
    [schedule.propertyId("Schedule", "startAt")]: 1789064562011, // 2026-09-10, already open
    [schedule.propertyId("Schedule", "endAt")]: 1924992000000, // 2031-01-01
    [schedule.propertyId("Schedule", "repeatType")]: "always",
  })
  // The closed one needs no such care: a window that has already ended stays
  // ended, and its whole point is not appearing in the list.
  .instance(Schedule, "closed-season", {
    [schedule.propertyId("Schedule", "scheduleType")]: "absolute",
    [schedule.propertyId("Schedule", "startAt")]: 1786904562011, // 2026-08-16
    [schedule.propertyId("Schedule", "endAt")]: 1789237362011, // 2026-09-12, closed
    [schedule.propertyId("Schedule", "repeatType")]: "always",
  })

  // The relative one: its window does not exist until a visitor pulls the
  // trigger it names, and then it belongs to them alone.
  .instance(Schedule, "happy-hour", {
    [schedule.propertyId("Schedule", "scheduleType")]: "relative",
    [schedule.propertyId("Schedule", "trigger")]: "happy-hour",
    [schedule.propertyId("Schedule", "repeatType")]: "always",
  })

  // The trigger itself. It has no master data — a trigger is something a
  // player has or has not pulled — but naming it here is what lets the extend
  // and clear rates be named after it.
  .instance(Trigger, "happy-hour", {})

  // The row a visitor presses to start their window.
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
        // The demo runs the transaction server-side and commits it atomically.
        // With auto-run off, `Exchange` only hands back a stamp sheet the
        // client has to execute through the distributor — an extra round trip
        // that can leave the window half-opened if the page is closed mid-way.
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

  // The readings come from the feature package; the demo adds the presses.
  .uiComponent(TriggerPull, ui =>
    ui
      .templateLabel("NameLabel", "{id}", { id: ui.prop("id") }, { name: "TriggerPull" })
      .buttonAction("PullButton", "Pull", undefined, { name: "TriggerPull" })
  )

  .uiComponent(Trigger, ui =>
    ui
      .buttonAction("ExtendButton", "Extend", undefined, { name: "Trigger" })
      .buttonAction("ClearButton", "Clear", undefined, { name: "Trigger" })
  )

  // A schedule row says what it is and when its window runs.
  .uiComponent(Schedule, ui =>
    ui.templateLabel(
      "WindowLabel",
      "{id} ({scheduleType})",
      {
        id: ui.prop("id"),
        // A dependency's declared properties are not visible by name at
        // single-package build time, so this one is named by its published id.
        scheduleType: ui.inheritedProp(schedule.propertyId("Schedule", "scheduleType")),
      },
      { name: "Schedule" }
    )
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

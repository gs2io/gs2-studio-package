import {
  ActionProgram,
  Arg,
  Bind,
  defineDomainType,
  defineMasterDataResource,
  definePackage,
  defineUiComponent,
  dependencyPackage,
  instance,
  PT,
  Source,
  transactionSettingV2,
  UiItem,
  UiSource,
} from "gs2-studio-dsl";

import { GS2 } from "gs2-studio-dsl/gs2";

import scheduleSurface from "../../dsl/dependency-surface.json";

const schedule = dependencyPackage(scheduleSurface);

const Schedule = schedule.type("Schedule");

const Trigger = schedule.type("Trigger");

const TriggerPull = defineDomainType("TriggerPull", {
  properties: {
    trigger: PT.ref(schedule.type("Trigger")).masterData().required(),
  },
  localizedProperties: {
      id: {
        ja: { label: "トリガー発火", description: "デモでトリガーを 1 つ引きます。" },
        en: { label: "Pull", description: "Pulls one trigger in the demo." },
      },
      trigger: {
        ja: { label: "トリガー", description: "この行が引くトリガーです。" },
        en: { label: "Trigger", description: "The trigger this row pulls." },
      },
    },
});

const TTL_SECONDS = 300;

const EXTEND_SECONDS = 60;

const PullRateModel = defineMasterDataResource({
  model: GS2.exchange.RateModel,
  mount: TriggerPull,
  bindings: { name: Bind.domainProperty(Source.direct(TriggerPull, "id")) },
  arrayChildren: {
    acquireActions: [
      defineMasterDataResource({
  model: GS2.transaction.AcquireAction,
  mount: TriggerPull,
  actionProgram: ActionProgram.transform(schedule.packageId, schedule.transformId("PullTrigger"), [
            Arg.domainProperty("trigger", Source.parent(Source.direct(TriggerPull, "trigger"))),
            Arg.static("ttlSeconds", TTL_SECONDS),
          ]),
}),
    ],
  },
});

const ExtendRateModel = defineMasterDataResource({
  model: GS2.exchange.RateModel,
  mount: Trigger,
  bindings: { name: Bind.domainProperty(Source.direct(Trigger, "id")) },
  arrayChildren: {
    acquireActions: [
      defineMasterDataResource({
  model: GS2.transaction.AcquireAction,
  mount: Trigger,
  actionProgram: ActionProgram.transform(schedule.packageId, schedule.transformId("TriggerSchedule"), [
            Arg.domainProperty("trigger", Source.direct(Trigger, "id")),
            Arg.static("extendSeconds", EXTEND_SECONDS),
          ]),
}),
    ],
  },
});

const ClearRateModel = defineMasterDataResource({
  model: GS2.exchange.RateModel,
  mount: Trigger,
  bindings: { name: Bind.domainProperty(Source.direct(Trigger, "id")) },
  arrayChildren: {
    consumeActions: [
      defineMasterDataResource({
  model: GS2.transaction.ConsumeAction,
  mount: Trigger,
  actionProgram: ActionProgram.transform(schedule.packageId, schedule.transformId("ClearTrigger"), [
            Arg.domainProperty("trigger", Source.direct(Trigger, "id")),
          ]),
}),
    ],
  },
});

export const foundationEconomyScheduleDemo = definePackage({
  id: "foundation-economy-schedule-demo",
  version: "0.0.1",
  display: {
    ja: {
      label: "スケジュール基盤（デモデータ）",
      description: "ライブデモ用のイベント日程と、トリガーの発火・延長・解除の操作を提供します。",
    },
    en: {
      label: "Scheduling (demo data)",
      description:
        "Supplies the event windows used by the live demo, and the presses that pull, extend and clear a trigger.",
    },
  },
  dependencies: {
    [schedule.packageId]: "github:gs2io/gs2-studio-package",
  },
  domainTypes: [TriggerPull],
  instances: [
    instance(Schedule, "open-season", {
    [schedule.propertyId("Schedule", "scheduleType")]: "absolute",
    [schedule.propertyId("Schedule", "startAt")]: "2026-09-10T18:22:42.011Z",
    [schedule.propertyId("Schedule", "endAt")]: "2031-01-01T00:00:00.000Z",
    [schedule.propertyId("Schedule", "repeatType")]: "always",
  }),
    instance(Schedule, "closed-season", {
    [schedule.propertyId("Schedule", "scheduleType")]: "absolute",
    [schedule.propertyId("Schedule", "startAt")]: "2026-08-16T18:22:42.011Z",
    [schedule.propertyId("Schedule", "endAt")]: "2026-09-12T18:22:42.011Z",
    [schedule.propertyId("Schedule", "repeatType")]: "always",
  }),
    instance(Schedule, "happy-hour", {
    [schedule.propertyId("Schedule", "scheduleType")]: "relative",
    [schedule.propertyId("Schedule", "trigger")]: "happy-hour",
    [schedule.propertyId("Schedule", "repeatType")]: "always",
  }),
    instance(Schedule, "ranking-contest", {
    [schedule.propertyId("Schedule", "scheduleType")]: "relative",
    [schedule.propertyId("Schedule", "trigger")]: "ranking-contest",
    [schedule.propertyId("Schedule", "repeatType")]: "always",
  }),
    instance(Schedule, "guild-season", {
    [schedule.propertyId("Schedule", "scheduleType")]: "absolute",
    [schedule.propertyId("Schedule", "startAt")]: "2026-09-01T00:00:00.000Z",
    [schedule.propertyId("Schedule", "endAt")]: "2031-01-01T00:00:00.000Z",
    [schedule.propertyId("Schedule", "repeatType")]: "daily",
    [schedule.propertyId("Schedule", "beginHour")]: 0,
    [schedule.propertyId("Schedule", "endHour")]: 0,
  }),
    instance(Trigger, "happy-hour", {}),
    instance(TriggerPull, "happy-hour", { trigger: "happy-hour" }),
  ],
  delegatedActions: [
    { target: TriggerPull, methodName: "Pull", action: { targetActionKey: "Gs2Exchange:RateModel.Exchange", targetResource: PullRateModel, parameterOverrides: [{ parameterName: "count", source: { kind: "static", value: 1 } }] } },
    { target: Trigger, methodName: "Extend", action: { targetActionKey: "Gs2Exchange:RateModel.Exchange", targetResource: ExtendRateModel, parameterOverrides: [{ parameterName: "count", source: { kind: "static", value: 1 } }] } },
    { target: Trigger, methodName: "Clear", action: { targetActionKey: "Gs2Exchange:RateModel.Exchange", targetResource: ClearRateModel, parameterOverrides: [{ parameterName: "count", source: { kind: "static", value: 1 } }] } },
  ],
  masterDataResources: [
    defineMasterDataResource({
  model: GS2.exchange.Namespace,
  bindings: {
        name: Bind.static("TriggerPull"),
        ...Bind.nulls(
          "acquireAwaitScript",
          "exchangeScript",
          "incrementalExchangeScript",
          "logSetting"
        ),
        // Auto-run executes the transaction without a second client request after the exchange.
        transactionSettingV2: transactionSettingV2(),
      },
  children: [
    PullRateModel,
  ],
}),
    defineMasterDataResource({
  model: GS2.exchange.Namespace,
  bindings: {
        name: Bind.static("TriggerExtend"),
        ...Bind.nulls(
          "acquireAwaitScript",
          "exchangeScript",
          "incrementalExchangeScript",
          "logSetting"
        ),
        transactionSettingV2: transactionSettingV2(),
      },
  children: [
    ExtendRateModel,
  ],
}),
    defineMasterDataResource({
  model: GS2.exchange.Namespace,
  bindings: {
        name: Bind.static("TriggerClear"),
        ...Bind.nulls(
          "acquireAwaitScript",
          "exchangeScript",
          "incrementalExchangeScript",
          "logSetting"
        ),
        transactionSettingV2: transactionSettingV2(),
      },
  children: [
    ClearRateModel,
  ],
}),
  ],
  uiComponents: [
    defineUiComponent(TriggerPull, {
  items: [
    UiItem.templateLabel("NameLabel", "{id}", { id: UiSource.prop("id") }, { name: "TriggerPull" }),
    UiItem.buttonAction("PullButton", "Pull", undefined, { name: "TriggerPull" }),
  ],
}),
    defineUiComponent(Trigger, {
  items: [
    UiItem.value("ExpiresInValue", UiSource.prop("expiresAt"), { name: "Trigger" }),
    UiItem.buttonAction("ExtendButton", "Extend", undefined, { name: "Trigger" }),
    UiItem.buttonAction("ClearButton", "Clear", undefined, { name: "Trigger" }),
  ],
}),
    defineUiComponent(Schedule, {
  items: [
    UiItem.templateLabel("WindowLabel", "{id} ({scheduleType})", {
          id: UiSource.prop("id"),
          scheduleType: UiSource.prop("scheduleType"),
        }, { name: "Schedule" }),
    UiItem.value("EndsInValue", UiSource.prop("endAt"), { name: "Schedule" }),
    UiItem.value("ClosesInValue", UiSource.prop("relativeEndAt"), { name: "Schedule" }),
  ],
}),
  ],
});

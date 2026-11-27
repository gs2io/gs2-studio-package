import {
  ActionProgram,
  Arg,
  Bind,
  defineMasterDataResource,
  defineOverlayDomainType,
  definePackage,
  defineUiComponent,
  dependencyPackage,
  instance,
  PT,
  Source,
  transactionSettingV2,
  UiCond,
  UiItem,
  UiSource,
} from "gs2-studio-dsl";

import { GS2 } from "gs2-studio-dsl/gs2";

import { jaEnField } from "../../../dsl/jaEnField";
import { liveDemoDependencies } from "../../../dsl/liveDemoDependencies";

import limitSurface from "../../dsl/dependency-surface.json";

import adSurface from "../../../foundation-economy-ad/dsl/dependency-surface.json";

import adDemoSurface from "../../../foundation-economy-ad/live-demo/dsl/dependency-surface.json";

const limit = dependencyPackage(limitSurface);

const ad = dependencyPackage(adSurface);

const adDemo = dependencyPackage(adDemoSurface);

const UsageLimit = limit.type("UsageLimit");

const UsageLimitCounter = defineOverlayDomainType("UsageLimitCounter", limit.overlay("UsageLimitCounter"), {
  properties: {
    freeMax: PT.int32().masterData().required(),
    adMax: PT.int32().masterData().required(),
  },
  localizedProperties: {
        freeMax: jaEnField(
          "無料回数の上限",
          "Free uses limit",
          "この期間に無料で使える回数の上限です。",
          "How many times this can be used for free in each period.",
          { ja: "回", en: "uses" }
        ),
        adMax: jaEnField(
          "広告視聴回数の上限",
          "Ad uses limit",
          "この期間に広告を見て使える回数の上限です。",
          "How many times this can be used by watching an ad in each period.",
          { ja: "回", en: "uses" }
        ),
      },
});

const UsageLimitCounterRow = limit.type("UsageLimitCounter");

const COUNTER_LIMIT = limit.propertyId("UsageLimitCounter", "limit");

const DAILY = "daily";

const WEEKLY = "weekly";

const RESET_HOUR = 0;

const WEEKLY_RESET_DAY = "monday";

const RESET_CLOCK = `${String(RESET_HOUR).padStart(2, "0")}:00`;

const WEEKLY_RESET_DAY_LABEL = WEEKLY_RESET_DAY.charAt(0).toUpperCase() + WEEKLY_RESET_DAY.slice(1);

const COUNTER_1 = "counter1";

const COUNTER_2 = "counter2";

const COUNTER_3 = "counter3";

const COUNTER_4 = "counter4";

const ALLOWANCES = [
  { schedule: DAILY, counter: COUNTER_1, freeMax: 3, adMax: 5 },
  { schedule: DAILY, counter: COUNTER_2, freeMax: 4, adMax: 4 },
  { schedule: DAILY, counter: COUNTER_3, freeMax: 6, adMax: 6 },
  { schedule: WEEKLY, counter: COUNTER_4, freeMax: 1, adMax: 1 },
] as const;

const STEP = 1;

const FreeUseRateModel = defineMasterDataResource({
  model: GS2.exchange.RateModel,
  mount: UsageLimitCounter,
  bindings: { name: Bind.domainProperty(Source.direct(UsageLimitCounter, "id")) },
  arrayChildren: {
    consumeActions: [
      defineMasterDataResource({
  model: GS2.transaction.ConsumeAction,
  mount: UsageLimitCounter,
  actionProgram: ActionProgram.transform(limit.packageId, limit.transformId("CountUpUsageLimit"), [
            Arg.domainProperty(
              "limit",
              Source.parent(Source.direct(UsageLimitCounterRow, COUNTER_LIMIT))
            ),
            Arg.domainProperty("counter", Source.direct(UsageLimitCounter, "id")),
            Arg.static("countUpValue", STEP),
            // Bind the ceiling to its property so generated readers can recover it from the deployed request.
            Arg.domainProperty("maxValue", Source.direct(UsageLimitCounter, "freeMax")),
          ]),
}),
    ],
  },
});

const AdUseRateModel = defineMasterDataResource({
  model: GS2.exchange.RateModel,
  mount: UsageLimitCounter,
  bindings: { name: Bind.domainProperty(Source.direct(UsageLimitCounter, "id")) },
  arrayChildren: {
    consumeActions: [
      defineMasterDataResource({
  model: GS2.transaction.ConsumeAction,
  mount: UsageLimitCounter,
  actionProgram: ActionProgram.transform(ad.packageId, ad.transformId("ConsumeAdViewPoint"), []),
}),
      defineMasterDataResource({
  model: GS2.transaction.ConsumeAction,
  mount: UsageLimitCounter,
  actionProgram: ActionProgram.transform(limit.packageId, limit.transformId("CountUpUsageLimit"), [
            Arg.domainProperty(
              "limit",
              Source.parent(Source.direct(UsageLimitCounterRow, COUNTER_LIMIT))
            ),
            Arg.domainProperty("counter", Source.direct(UsageLimitCounter, "id")),
            Arg.static("countUpValue", STEP),
            Arg.domainProperty("maxValue", Source.direct(UsageLimitCounter, "adMax")),
          ]),
}),
    ],
  },
});

const ResetEveryAllowanceRateModel = defineMasterDataResource({
  model: GS2.exchange.RateModel,
  mount: UsageLimitCounter,
  bindings: { name: Bind.domainProperty(Source.direct(UsageLimitCounter, "id")) },
  arrayChildren: {
    acquireActions: ALLOWANCES.map(({ schedule, counter }) =>
      defineMasterDataResource({
        model: GS2.transaction.AcquireAction,
        mount: UsageLimitCounter,
        actionProgram: ActionProgram.transform(
          limit.packageId,
          limit.transformId("ResetUsageLimitCounter"),
          [Arg.static("limit", schedule), Arg.static("counter", counter)]
        ),
      })
    ),
  },
});

export const foundationEconomyLimitDemo = definePackage({
  id: "foundation-economy-limit-demo",
  version: "0.0.1",
  display: {
    ja: {
      label: "回数制限（デモデータ）",
      description:
        "ライブデモ用の日次・週次のリセット設定と4つの回数カウンター、無料枠と広告枠それぞれの利用操作、全体のリセット操作を提供します。視聴枠は広告デモから借ります。",
    },
    en: {
      label: "Usage Limits (demo data)",
      description:
        "Supplies the daily and weekly schedules the live demo shows, the four allowances that follow them, the free and ad-backed presses that use one, and the reset that puts them all back. The view point it spends comes from the ad demo.",
    },
  },
  dependencies: liveDemoDependencies(limit.packageId, adDemo.packageId, ad.packageId),
  domainTypes: [UsageLimitCounter],
  instances: [
    instance(UsageLimit, DAILY, {
    [limit.propertyId("UsageLimit", "resetType")]: "daily",
    [limit.propertyId("UsageLimit", "resetHour")]: RESET_HOUR,
  }),
    instance(UsageLimit, WEEKLY, {
    [limit.propertyId("UsageLimit", "resetType")]: "weekly",
    [limit.propertyId("UsageLimit", "resetDayOfWeek")]: WEEKLY_RESET_DAY,
    [limit.propertyId("UsageLimit", "resetHour")]: RESET_HOUR,
  }),
    ...ALLOWANCES.map(({ schedule, counter, freeMax, adMax }) => instance(UsageLimitCounter, counter, {
      [COUNTER_LIMIT]: schedule,
      freeMax,
      adMax,
    })),
  ],
  delegatedActions: [
    { target: UsageLimitCounter, methodName: "UseFree", action: { targetActionKey: "Gs2Exchange:RateModel.Exchange", targetResource: FreeUseRateModel, parameterOverrides: [{ parameterName: "count", source: { kind: "static", value: 1 } }] } },
    { target: UsageLimitCounter, methodName: "UseWithAd", action: { targetActionKey: "Gs2Exchange:RateModel.Exchange", targetResource: AdUseRateModel, parameterOverrides: [{ parameterName: "count", source: { kind: "static", value: 1 } }] } },
    { target: UsageLimitCounter, methodName: "ResetEveryAllowance", action: { targetActionKey: "Gs2Exchange:RateModel.Exchange", targetResource: ResetEveryAllowanceRateModel, parameterOverrides: [{ parameterName: "count", source: { kind: "static", value: 1 } }] } },
  ],
  masterDataResources: [
    defineMasterDataResource({
  model: GS2.exchange.Namespace,
  bindings: {
        name: Bind.static("LimitFreeUse"),
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
    FreeUseRateModel,
  ],
}),
    defineMasterDataResource({
  model: GS2.exchange.Namespace,
  bindings: {
        name: Bind.static("LimitAdUse"),
        ...Bind.nulls(
          "acquireAwaitScript",
          "exchangeScript",
          "incrementalExchangeScript",
          "logSetting"
        ),
        transactionSettingV2: transactionSettingV2(),
      },
  children: [
    AdUseRateModel,
  ],
}),
    defineMasterDataResource({
  model: GS2.exchange.Namespace,
  bindings: {
        name: Bind.static("LimitReset"),
        ...Bind.nulls(
          "acquireAwaitScript",
          "exchangeScript",
          "incrementalExchangeScript",
          "logSetting"
        ),
        transactionSettingV2: transactionSettingV2(),
      },
  children: [
    ResetEveryAllowanceRateModel,
  ],
}),
  ],
  uiComponents: [
    defineUiComponent(UsageLimit, {
  items: [
    UiItem.templateLabel("ScheduleLabel", `Resets every day at ${RESET_CLOCK} UTC`, {}, { name: "UsageLimit" }),
    UiItem.templateLabel("WeeklyScheduleLabel", `Resets every ${WEEKLY_RESET_DAY_LABEL} at ${RESET_CLOCK} UTC`, {}, { name: "UsageLimit" }),
    UiItem.activeToggle("WeeklyActiveToggle", UiCond.eq(UiSource.prop("resetType"), UiSource.lit(WEEKLY)), {
        name: "UsageLimit",
      }),
    UiItem.activeToggle("NotWeeklyActiveToggle", UiCond.neq(UiSource.prop("resetType"), UiSource.lit(WEEKLY)), {
        name: "UsageLimit",
      }),
  ],
}),
    defineUiComponent(UsageLimitCounter, {
  items: [
    UiItem.templateLabel("UsageLabel", "{count} used. Free uses stop at {free}, ad-backed uses at {adBacked}.", {
          count: UiSource.prop("count"),
          free: UiSource.prop("freeMax"),
          adBacked: UiSource.prop("adMax"),
        }, { name: "UsageLimitCounter" }),
    UiItem.templateLabel("AllowanceLabel", "{count} of {free} used", { count: UiSource.prop("count"), free: UiSource.prop("freeMax") }, { name: "UsageLimitCounter" }),
    UiItem.templateLabel("NoFreeUsesLeftLabel", "{count} of {free} free uses are spent. Free uses come back at the next reset.", { count: UiSource.prop("count"), free: UiSource.prop("freeMax") }, { name: "UsageLimitCounter" }),
    UiItem.templateLabel("NothingLeftLabel", "{count} of {adBacked} uses are spent. Nothing more until the next reset.", { count: UiSource.prop("count"), adBacked: UiSource.prop("adMax") }, { name: "UsageLimitCounter" }),
    UiItem.activeToggle("FreeUsesSpentActiveToggle", UiCond.gte(UiSource.prop("count"), UiSource.prop("freeMax")), {
        name: "UsageLimitCounter",
      }),
    UiItem.activeToggle("FreeUsesLeftActiveToggle", UiCond.lt(UiSource.prop("count"), UiSource.prop("freeMax")), {
        name: "UsageLimitCounter",
      }),
    UiItem.activeToggle("AdUsesUnavailableActiveToggle", UiCond.or(
          UiCond.lt(UiSource.prop("count"), UiSource.prop("freeMax")),
          UiCond.gte(UiSource.prop("count"), UiSource.prop("adMax"))
        ), { name: "UsageLimitCounter" }),
    UiItem.activeToggle("AnyUseLeftActiveToggle", UiCond.lt(UiSource.prop("count"), UiSource.prop("adMax")), {
        name: "UsageLimitCounter",
      }),
    UiItem.value("NextResetInValue", UiSource.prop("nextResetAt"), { name: "UsageLimitCounter" }),
    UiItem.buttonAction("UseFreeButton", "UseFree", undefined, { name: "UsageLimitCounter" }),
    UiItem.buttonAction("UseWithAdButton", "UseWithAd", undefined, { name: "UsageLimitCounter" }),
    UiItem.buttonAction("ResetEveryAllowanceButton", "ResetEveryAllowance", undefined, {
        name: "UsageLimitCounter",
      }),
  ],
}),
  ],
});

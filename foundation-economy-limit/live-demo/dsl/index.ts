import {
  Arg,
  Bind,
  defineMasterDataResource,
  defineOverlayDomainType,
  definePackage,
  dependencyPackage,
  PT,
  Source,
  transactionSetting,
  UiCond,
} from "~/dsl";
import { GS2 } from "~/dsl/gs2";

import limitSurface from "../../dsl/dependency-surface.json";
import adSurface from "../../../foundation-economy-ad/dsl/dependency-surface.json";
import adDemoSurface from "../../../foundation-economy-ad/live-demo/dsl/dependency-surface.json";

const limit = dependencyPackage(limitSurface);
const ad = dependencyPackage(adSurface);
const adDemo = dependencyPackage(adDemoSurface);

const UsageLimit = limit.type("UsageLimit");

/** Bind both ceilings through authored properties so generated readers recover the deployed values instead of duplicating them in the page. */
const UsageLimitCounter = defineOverlayDomainType(
  "UsageLimitCounter",
  limit.overlay("UsageLimitCounter"),
  domainType =>
    domainType
      .property(
        PT.int32("freeMax")
          .masterData()
          .required()
          .description("Ceiling the free press names; recovered from its count-up action")
      )
      .property(
        PT.int32("adMax")
          .masterData()
          .required()
          .description("Ceiling the ad-backed press names; recovered from its count-up action")
      )
);

/** Use the dependency handle for inherited property ids; the local overlay handle owns its new property names. */
const UsageLimitCounterRow = limit.type("UsageLimitCounter");

/** Use the published property id because this DSL evaluation does not load the dependency closure to resolve inherited names. */
const COUNTER_LIMIT = limit.propertyId("UsageLimitCounter", "limit");

const DAILY = "daily";
const WEEKLY = "weekly";

const RESET_HOUR = 0;

const WEEKLY_RESET_DAY = "monday";

/** Format the shared reset values here because template labels cannot pad or capitalize their bound values. */
const RESET_CLOCK = `${String(RESET_HOUR).padStart(2, "0")}:00`;
const WEEKLY_RESET_DAY_LABEL = WEEKLY_RESET_DAY.charAt(0).toUpperCase() + WEEKLY_RESET_DAY.slice(1);

const COUNTER_1 = "counter1";
const COUNTER_2 = "counter2";
const COUNTER_3 = "counter3";
const COUNTER_4 = "counter4";

/** Derive deployed rows and reset actions from one list so a new counter cannot be omitted from reset. Only the first counter offers an ad-backed extension. */
const ALLOWANCES = [
  { schedule: DAILY, counter: COUNTER_1, freeMax: 3, adMax: 5 },
  { schedule: DAILY, counter: COUNTER_2, freeMax: 4, adMax: 4 },
  { schedule: DAILY, counter: COUNTER_3, freeMax: 6, adMax: 6 },
  { schedule: WEEKLY, counter: COUNTER_4, freeMax: 1, adMax: 1 },
] as const;

const STEP = 1;

/** Separate rate namespaces because each operation derives the same rate names from the counter ids. */
const FreeUseRateModel = defineMasterDataResource(resource =>
  resource
    .model(GS2.exchange.RateModel)
    .mountLocal(UsageLimitCounter)
    .bindings({ name: Bind.domainProperty(Source.direct(UsageLimitCounter, "id")) })
    .addArrayChild("consumeActions", consumeAction => {
      consumeAction
        .model(GS2.transaction.ConsumeAction)
        .mountLocal(UsageLimitCounter)
        .bindings({
          // Read the schedule from the counter reference so the two-part identity cannot drift.
          action: Bind.transform(limit.packageId, "CountUpUsageLimit", [
            Arg.domainProperty(
              "limit",
              Source.parent(Source.direct(UsageLimitCounterRow, COUNTER_LIMIT))
            ),
            Arg.domainProperty("counter", Source.direct(UsageLimitCounter, "id")),
            Arg.static("countUpValue", STEP),
            // Bind the ceiling to its property so generated readers can recover it from the deployed request.
            Arg.domainProperty("maxValue", Source.direct(UsageLimitCounter, "freeMax")),
          ]),
        });
    })
);

/** Consume the ad point and count the use in one atomic exchange so a refused count-up cannot spend the point alone. */
const AdUseRateModel = defineMasterDataResource(resource =>
  resource
    .model(GS2.exchange.RateModel)
    .mountLocal(UsageLimitCounter)
    .bindings({ name: Bind.domainProperty(Source.direct(UsageLimitCounter, "id")) })
    .addArrayChild("consumeActions", consumeAction => {
      consumeAction
        .model(GS2.transaction.ConsumeAction)
        .mountLocal(UsageLimitCounter)
        .bindings({
          action: Bind.transform(ad.packageId, "ConsumeAdViewPoint", []),
        });
    })
    .addArrayChild("consumeActions", consumeAction => {
      consumeAction
        .model(GS2.transaction.ConsumeAction)
        .mountLocal(UsageLimitCounter)
        .bindings({
          action: Bind.transform(limit.packageId, "CountUpUsageLimit", [
            Arg.domainProperty(
              "limit",
              Source.parent(Source.direct(UsageLimitCounterRow, COUNTER_LIMIT))
            ),
            Arg.domainProperty("counter", Source.direct(UsageLimitCounter, "id")),
            Arg.static("countUpValue", STEP),
            Arg.domainProperty("maxValue", Source.direct(UsageLimitCounter, "adMax")),
          ]),
        });
    })
);

/** Reset all counters together so visitors can retry without waiting for either cadence. */
const ResetEveryAllowanceRateModel = defineMasterDataResource(resource => {
  resource
    .model(GS2.exchange.RateModel)
    .mountLocal(UsageLimitCounter)
    .bindings({ name: Bind.domainProperty(Source.direct(UsageLimitCounter, "id")) });
  for (const { schedule, counter } of ALLOWANCES) {
    resource.addArrayChild("acquireActions", acquireAction => {
      acquireAction
        .model(GS2.transaction.AcquireAction)
        .mountLocal(UsageLimitCounter)
        .bindings({
          action: Bind.transform(limit.packageId, "ResetUsageLimitCounter", [
            Arg.static("limit", schedule),
            Arg.static("counter", counter),
          ]),
        });
    });
  }
});

const withSchedules = definePackage("foundation-economy-limit-demo", "0.0.0")
  .display({
    label: { ja: "回数制限（デモデータ）", en: "Usage Limits (demo data)" },
    description: {
      ja: "ライブデモ用の日次・週次のリセット設定と4つの回数カウンター、無料枠と広告枠それぞれの利用操作、全体のリセット操作を提供します。視聴枠は広告デモから借ります。",
      en: "Supplies the daily and weekly schedules the live demo shows, the four allowances that follow them, the free and ad-backed presses that use one, and the reset that puts them all back. The view point it spends comes from the ad demo.",
    },
  })
  .dependency(limit.packageId, "github:gs2io/gs2-studio-package")
  // Reuse the ad demo stack so its point grant and namespace cannot diverge between demo deployments.
  .dependency(adDemo.packageId, "github:gs2io/gs2-studio-package")
  // Declare the base ad package because this rate directly calls its ConsumeAdViewPoint transform.
  .dependency(ad.packageId, "github:gs2io/gs2-studio-package")

  .domainType(UsageLimitCounter)

  .instance(UsageLimit, DAILY, {
    [limit.propertyId("UsageLimit", "resetType")]: "daily",
    [limit.propertyId("UsageLimit", "resetHour")]: RESET_HOUR,
  })

  .instance(UsageLimit, WEEKLY, {
    [limit.propertyId("UsageLimit", "resetType")]: "weekly",
    [limit.propertyId("UsageLimit", "resetDayOfWeek")]: WEEKLY_RESET_DAY,
    [limit.propertyId("UsageLimit", "resetHour")]: RESET_HOUR,
  });

const withCounters = ALLOWANCES.reduce(
  (builder, { schedule, counter, freeMax, adMax }) =>
    // Use the local type name so authored rows can include overlay properties absent from the dependency surface.
    builder.instance("UsageLimitCounter", counter, {
      [COUNTER_LIMIT]: schedule,
      freeMax,
      adMax,
    }),
  withSchedules
);

export const foundationEconomyLimitDemo = withCounters
  .masterDataResource(resource =>
    resource
      .model(GS2.exchange.Namespace)
      .bindings({
        name: Bind.static("LimitFreeUse"),
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
      .addChild(FreeUseRateModel)
  )

  .masterDataResource(resource =>
    resource
      .model(GS2.exchange.Namespace)
      .bindings({
        name: Bind.static("LimitAdUse"),
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
      .addChild(AdUseRateModel)
  )

  .masterDataResource(resource =>
    resource
      .model(GS2.exchange.Namespace)
      .bindings({
        name: Bind.static("LimitReset"),
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
      .addChild(ResetEveryAllowanceRateModel)
  )

  // Keep separate cadence labels because the weekly schedule must also name its reset day.
  .uiComponent(UsageLimit, ui =>
    ui
      .templateLabel(
        "ScheduleLabel",
        `Resets every day at ${RESET_CLOCK} UTC`,
        {},
        { name: "UsageLimit" }
      )
      .templateLabel(
        "WeeklyScheduleLabel",
        `Resets every ${WEEKLY_RESET_DAY_LABEL} at ${RESET_CLOCK} UTC`,
        {},
        { name: "UsageLimit" }
      )
      .activeToggle("WeeklyActiveToggle", UiCond.eq(ui.prop("resetType"), ui.lit(WEEKLY)), {
        name: "UsageLimit",
      })
      .activeToggle("NotWeeklyActiveToggle", UiCond.neq(ui.prop("resetType"), ui.lit(WEEKLY)), {
        name: "UsageLimit",
      })
  )

  .uiComponent(UsageLimitCounter, ui =>
    ui
      .templateLabel(
        "UsageLabel",
        "{count} used. Free uses stop at {free}, ad-backed uses at {adBacked}.",
        {
          count: ui.prop("count"),
          free: ui.prop("freeMax"),
          adBacked: ui.prop("adMax"),
        },
        { name: "UsageLimitCounter" }
      )
      .templateLabel(
        "AllowanceLabel",
        "{count} of {free} used",
        { count: ui.prop("count"), free: ui.prop("freeMax") },
        { name: "UsageLimitCounter" }
      )
      // Show exhaustion before a press so an unavailable use is distinguishable from a button that failed silently.
      .templateLabel(
        "NoFreeUsesLeftLabel",
        "{count} of {free} free uses are spent. Free uses come back at the next reset.",
        { count: ui.prop("count"), free: ui.prop("freeMax") },
        { name: "UsageLimitCounter" }
      )
      .templateLabel(
        "NothingLeftLabel",
        "{count} of {adBacked} uses are spent. Nothing more until the next reset.",
        { count: ui.prop("count"), adBacked: ui.prop("adMax") },
        { name: "UsageLimitCounter" }
      )
      // Page toggle bindings hide their rows while the condition holds, so each condition describes when its rows are unnecessary.
      .activeToggle("FreeUsesSpentActiveToggle", UiCond.gte(ui.prop("count"), ui.prop("freeMax")), {
        name: "UsageLimitCounter",
      })
      .activeToggle("FreeUsesLeftActiveToggle", UiCond.lt(ui.prop("count"), ui.prop("freeMax")), {
        name: "UsageLimitCounter",
      })
      // Combine both unavailable ranges because separate toggles targeting one row would overwrite each other. The page grants an ad point before exchanging it, so hide that flow when the count already rules out a use.
      .activeToggle(
        "AdUsesUnavailableActiveToggle",
        UiCond.or(
          UiCond.lt(ui.prop("count"), ui.prop("freeMax")),
          UiCond.gte(ui.prop("count"), ui.prop("adMax"))
        ),
        { name: "UsageLimitCounter" }
      )
      .activeToggle("AnyUseLeftActiveToggle", UiCond.lt(ui.prop("count"), ui.prop("adMax")), {
        name: "UsageLimitCounter",
      })
      .value("NextResetInValue", ui.prop("nextResetAt"), { name: "UsageLimitCounter" })
      .buttonAction("UseFreeButton", "UseFree", undefined, { name: "UsageLimitCounter" })
      .buttonAction("UseWithAdButton", "UseWithAd", undefined, { name: "UsageLimitCounter" })
      .buttonAction("ResetEveryAllowanceButton", "ResetEveryAllowance", undefined, {
        name: "UsageLimitCounter",
      })
  )

  .delegatedAction(UsageLimitCounter, "UseFree", {
    targetActionKey: "Gs2Exchange:RateModel.Exchange",
    targetResource: FreeUseRateModel,
    parameterOverrides: [{ kind: "static", parameterName: "count", value: 1 }],
  })
  .delegatedAction(UsageLimitCounter, "UseWithAd", {
    targetActionKey: "Gs2Exchange:RateModel.Exchange",
    targetResource: AdUseRateModel,
    parameterOverrides: [{ kind: "static", parameterName: "count", value: 1 }],
  })
  .delegatedAction(UsageLimitCounter, "ResetEveryAllowance", {
    targetActionKey: "Gs2Exchange:RateModel.Exchange",
    targetResource: ResetEveryAllowanceRateModel,
    parameterOverrides: [{ kind: "static", parameterName: "count", value: 1 }],
  })
  .build();

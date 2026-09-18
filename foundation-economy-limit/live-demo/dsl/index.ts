/**
 * Live demo content for `foundation-economy-limit`.
 *
 * The feature package counts allowances but ships none: how often a thing may
 * be done, and when the tally goes back to zero, are a title's decisions. This
 * package supplies one daily allowance, the counter that tracks it, and the
 * three presses that move it — spend one, hand one back, wipe the tally.
 *
 * The ceiling is not part of the schedule. GS2 takes it at count-up time, so
 * it belongs to the press, and pressing Use once past the ceiling is refused
 * by the server rather than hidden by the page. That refusal is the demo: a
 * page where every press succeeded would show a counter, not a limit.
 */

import {
  Arg,
  Bind,
  defineMasterDataResource,
  definePackage,
  dependencyPackage,
  Source,
  transactionSetting,
} from "~/dsl";
import { GS2 } from "~/dsl/gs2";

import limitSurface from "../../dsl/dependency-surface.json";

// Materialization publishes the feature package's identities, so everything
// below is addressed by name; a typo is a compile error rather than an id that
// resolves to nothing.
const limit = dependencyPackage(limitSurface);

/** When the tally goes back to zero. Shared, so many counters could follow it. */
const UsageLimit = limit.type("UsageLimit");

/** The tally itself: one counter, following the schedule above. */
const UsageLimitCounter = limit.type("UsageLimitCounter");

/**
 * The counter's own reference to its schedule.
 *
 * A binding source names a property by id when the property belongs to a
 * dependency's type: a single-package build does not load its dependency
 * closure, so the name would pass through unresolved. `propertyId` reads it
 * out of the published surface, which is what makes the spelling checkable.
 */
const COUNTER_LIMIT = limit.propertyId("UsageLimitCounter", "limit");

/**
 * The row id both the schedule and the counter are deployed under.
 *
 * One name, deliberately: a counter is addressed by the pair
 * (limitName, counterName), and the generated `CounterLoader` fills both slots
 * from the bound model's own id — the counter's reference to its schedule is
 * not consulted. A counter named anything else would count up correctly (the
 * transform reads the reference from master data) and then read back a
 * schedule that does not exist. So the demo's one allowance and its one
 * counter share a name, which also reads the way a title would say it: "the
 * daily allowance".
 */
const DAILY = "daily";

/**
 * Midnight UTC. `resetHour` is required for every cadence that resets on a
 * clock, so a daily schedule that omitted it would not deploy — and the other
 * four fields (`resetDayOfWeek`, `resetDayOfMonth`, `days`,
 * `anchorTimestamp`) are required only for the cadences this demo does not
 * use, so they are left unset rather than filled with values that mean
 * nothing.
 */
const RESET_HOUR = 0;

/**
 * Five uses a day. Small enough that a visitor reaches the ceiling in five
 * presses and sees the sixth refused, which is the point of the page.
 */
const MAX_USES = 5;

/** One press is worth one use, in both directions. */
const STEP = 1;

/**
 * Spending one use, modelled as an exchange that grants nothing: the consume
 * action is the whole of the press.
 *
 * The rate is named after the counter because a delegated action on
 * `UsageLimitCounter` must target a resource that mounts it — that is how the
 * generated loader learns which rate to exchange.
 *
 * It lives under its own exchange namespace because the two rates below name
 * their rows the same way; sharing a namespace collides the `rateModels` array
 * on its primary key and drops the whole `CurrentRateMaster` from the template.
 */
const UseRateModel = defineMasterDataResource(resource =>
  resource
    .model(GS2.exchange.RateModel)
    .mountLocal(UsageLimitCounter)
    .bindings({ name: Bind.domainProperty(Source.direct(UsageLimitCounter, "id")) })
    .addArrayChild("consumeActions", consumeAction => {
      consumeAction
        .model(GS2.transaction.ConsumeAction)
        .mountLocal(UsageLimitCounter)
        .bindings({
          // A counter is identified by the pair (limit, counter), so both are
          // passed, and the limit is read off the counter's own reference
          // rather than restated — the pair cannot drift that way.
          action: Bind.transform(limit.packageId, "CountUpUsageLimit", [
            Arg.domainProperty(
              "limit",
              Source.parent(Source.direct(UsageLimitCounter, COUNTER_LIMIT))
            ),
            Arg.domainProperty("counter", Source.direct(UsageLimitCounter, "id")),
            Arg.static("countUpValue", STEP),
            // The ceiling. GS2 refuses a count-up that would pass it, which is
            // what makes the sixth press fail.
            Arg.static("maxValue", MAX_USES),
          ]),
        });
    })
);

/**
 * Handing one use back. The mirror of `UseRateModel`: it costs nothing, and
 * `CountDownUsageLimit` is an acquire action because giving an allowance back
 * is a grant as far as a transaction is concerned.
 */
const ReturnRateModel = defineMasterDataResource(resource =>
  resource
    .model(GS2.exchange.RateModel)
    .mountLocal(UsageLimitCounter)
    .bindings({ name: Bind.domainProperty(Source.direct(UsageLimitCounter, "id")) })
    .addArrayChild("acquireActions", acquireAction => {
      acquireAction
        .model(GS2.transaction.AcquireAction)
        .mountLocal(UsageLimitCounter)
        .bindings({
          action: Bind.transform(limit.packageId, "CountDownUsageLimit", [
            Arg.domainProperty(
              "limit",
              Source.parent(Source.direct(UsageLimitCounter, COUNTER_LIMIT))
            ),
            Arg.domainProperty("counter", Source.direct(UsageLimitCounter, "id")),
            Arg.static("countDownValue", STEP),
          ]),
        });
    })
);

/**
 * Wiping the tally, which is what the daily reset does on its own at midnight.
 * A visitor should not have to wait a day to see the other half of a limit, so
 * the press stands in for the clock.
 */
const ResetRateModel = defineMasterDataResource(resource =>
  resource
    .model(GS2.exchange.RateModel)
    .mountLocal(UsageLimitCounter)
    .bindings({ name: Bind.domainProperty(Source.direct(UsageLimitCounter, "id")) })
    .addArrayChild("acquireActions", acquireAction => {
      acquireAction
        .model(GS2.transaction.AcquireAction)
        .mountLocal(UsageLimitCounter)
        .bindings({
          action: Bind.transform(limit.packageId, "ResetUsageLimitCounter", [
            Arg.domainProperty(
              "limit",
              Source.parent(Source.direct(UsageLimitCounter, COUNTER_LIMIT))
            ),
            Arg.domainProperty("counter", Source.direct(UsageLimitCounter, "id")),
          ]),
        });
    })
);

export const foundationEconomyLimitDemo = definePackage("foundation-economy-limit-demo", "0.0.0")
  .display({
    label: { ja: "回数制限（デモデータ）", en: "Usage limits (demo data)" },
    description: {
      ja: "ライブデモ用の日次リセット設定と回数カウンター、利用・返却・リセットの操作を提供します。",
      en: "Supplies the daily allowance used by the live demo, its counter, and the presses that use, return and reset it.",
    },
  })
  .dependency(limit.packageId, "github:gs2io/gs2-studio-package")

  // Resets every day at midnight UTC, and governs every counter that names it
  // — here, exactly one.
  .instance(UsageLimit, DAILY, {
    [limit.propertyId("UsageLimit", "resetType")]: "daily",
    [limit.propertyId("UsageLimit", "resetHour")]: RESET_HOUR,
  })

  // The counter has no master data of its own — a tally is something a player
  // has run up — but naming it here is what lets the three rates be named
  // after it, and what gives the page a row to press.
  .instance(UsageLimitCounter, DAILY, {
    [COUNTER_LIMIT]: DAILY,
  })

  .masterDataResource(resource =>
    resource
      .model(GS2.exchange.Namespace)
      .bindings({
        name: Bind.static("LimitUse"),
        ...Bind.nulls(
          "acquireAwaitScript",
          "exchangeScript",
          "incrementalExchangeScript",
          "logSetting"
        ),
        // The demo runs the transaction server-side and commits it atomically.
        // With auto-run off, `Exchange` only hands back a stamp sheet the
        // client has to execute through the distributor — an extra round trip,
        // and one more place for a refused count-up to surface as something
        // other than a refused count-up.
        transactionSetting: transactionSetting({
          enableAtomicCommit: Bind.static(true),
          enableAutoRun: Bind.static(true),
        }),
      })
      .addChild(UseRateModel)
  )

  .masterDataResource(resource =>
    resource
      .model(GS2.exchange.Namespace)
      .bindings({
        name: Bind.static("LimitReturn"),
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
      .addChild(ReturnRateModel)
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
      .addChild(ResetRateModel)
  )

  // The feature package ships no UI: a limit is infrastructure, and what a
  // title shows of it is the title's decision. So the demo supplies both the
  // readings and the presses.
  .uiComponent(UsageLimit, ui =>
    ui.templateLabel(
      "ScheduleLabel",
      "{id}: resets {resetType} at {resetHour}:00 UTC",
      {
        id: ui.prop("id"),
        resetType: ui.prop("resetType"),
        resetHour: ui.prop("resetHour"),
      },
      { name: "UsageLimit" }
    )
  )

  .uiComponent(UsageLimitCounter, ui =>
    ui
      // The ceiling is a literal because it lives on the press, not on the
      // counter: nothing on the server would answer for it.
      .templateLabel(
        "UsageLabel",
        "{count} / {maximum} used",
        { count: ui.prop("count"), maximum: ui.lit(MAX_USES) },
        { name: "UsageLimitCounter" }
      )
      .value("NextResetAtValue", ui.prop("nextResetAt"), { name: "UsageLimitCounter" })
      .buttonAction("UseButton", "Use", undefined, { name: "UsageLimitCounter" })
      .buttonAction("ReturnButton", "Return", undefined, { name: "UsageLimitCounter" })
      .buttonAction("ResetButton", "Reset", undefined, { name: "UsageLimitCounter" })
  )

  .delegatedAction(UsageLimitCounter, "Use", {
    targetActionKey: "Gs2Exchange:RateModel.Exchange",
    targetResource: UseRateModel,
    parameterOverrides: [{ kind: "static", parameterName: "count", value: 1 }],
  })
  .delegatedAction(UsageLimitCounter, "Return", {
    targetActionKey: "Gs2Exchange:RateModel.Exchange",
    targetResource: ReturnRateModel,
    parameterOverrides: [{ kind: "static", parameterName: "count", value: 1 }],
  })
  .delegatedAction(UsageLimitCounter, "Reset", {
    targetActionKey: "Gs2Exchange:RateModel.Exchange",
    targetResource: ResetRateModel,
    parameterOverrides: [{ kind: "static", parameterName: "count", value: 1 }],
  })
  .build();

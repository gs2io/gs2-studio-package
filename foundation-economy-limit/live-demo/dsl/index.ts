/**
 * Live demo content for `foundation-economy-limit`.
 *
 * The feature package counts allowances but ships none: how often a thing may
 * be done, and when the tally goes back to zero, are a title's decisions. This
 * package supplies one daily allowance, the counter that tracks it, and the
 * presses that move it.
 *
 * The ceiling is not on the schedule and not on the counter. GS2 takes it at
 * count-up time, so it belongs to the press — and that is what this page is
 * for. One counter is counted by two presses that name different ceilings:
 * three uses are free, and two more are there for a visitor who has banked an
 * ad view, because the press that spends one names five.
 *
 * So the same number closes twice. At three the free press is refused and the
 * ad-backed one still goes through; at five both are. Nothing about the
 * counter changed between those two refusals — only what the press asked for.
 * A ceiling stored beside the tally could not do that: there would be one
 * number, and the second press would have to be a second counter.
 *
 * Banking a view belongs to the ad package, which is why this demo depends on
 * it — and on its demo rather than on it alone. `foundation-economy-ad` holds
 * the point and ships the half that spends it; the half that earns one is
 * `foundation-economy-ad-demo`'s, already written, already deployed. Authoring
 * it again here would put the same ad stack in two templates with nothing
 * holding them equal, and the two demos deploy into one GS2 project: the
 * namespace names are fixed, so there was only ever one stack, and whichever
 * demo deployed last would decide what was in it.
 *
 * **No advertisement is played here, and none could be** — the ad networks GS2
 * accepts are mobile-only and the showroom is a WebGL player — so the page
 * shows an ad break with the ad missing, a panel that says on its face that
 * nothing is playing and why. The press inside it is the ad demo's own `Watch`.
 *
 * There is no press that hands a use back. `Gs2Limit:CountDownByUserId` is a
 * correction — a refund, a mistaken charge put right — and a player never
 * meets it, so a page that offered it would be showing an operator's tool as
 * though it were part of the game. Reset stands in for the midnight the
 * schedule is waiting for, which is a different thing: it is what a visitor
 * would otherwise have to wait a day to see.
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
import adSurface from "../../../foundation-economy-ad/dsl/dependency-surface.json";
import adDemoSurface from "../../../foundation-economy-ad/live-demo/dsl/dependency-surface.json";

// Materialization publishes each package's identities, so everything below is
// addressed by name; a typo is a compile error rather than an id that resolves
// to nothing.
const limit = dependencyPackage(limitSurface);
const ad = dependencyPackage(adSurface);
// A demo installed beside another demo is a dependency like any other. This
// one brings the point row, the ad namespace and the press that banks a view,
// so none of them is written out again here.
const adDemo = dependencyPackage(adDemoSurface);

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
 * A counter is addressed by the pair (limitName, counterName), and the
 * generated `CounterLoader` takes the schedule as its own input — it reads the
 * counter's reference rather than reusing the counter's id for both slots. So
 * a counter may be named after whatever it counts, and several of them may
 * follow one schedule, which is the property this package exists for.
 *
 * This demo has one of each and gives them the same name because there is one
 * allowance and one tally of it, and "the daily allowance" is how a title
 * would say that. It is not a constraint the loader imposes.
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
 * What the free press names as its ceiling. Small enough that a visitor
 * reaches it in three presses and sees the fourth refused, which is where the
 * page starts being about anything.
 */
const FREE_MAX_USES = 3;

/**
 * What the ad-backed press names instead, on the same counter.
 *
 * Higher rather than separate: the two presses are not two allowances, they
 * are two answers to "how many is too many" about one tally. Which is why a
 * visitor who has used all three free ones has two left and a visitor who has
 * used five has none, whatever they have banked.
 */
const AD_MAX_USES = 5;

/** One press is worth one use. */
const STEP = 1;

/**
 * Spending a free use, modelled as an exchange that grants nothing: the
 * consume action is the whole of the press.
 *
 * The rate is named after the counter because a delegated action on
 * `UsageLimitCounter` must target a resource that mounts it — that is how the
 * generated loader learns which rate to exchange.
 *
 * It lives under its own exchange namespace because the other rates on this
 * counter name their rows the same way; sharing a namespace collides the
 * `rateModels` array on its primary key and drops the whole
 * `CurrentRateMaster` from the template.
 */
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
            // The ceiling this press asks for. GS2 refuses a count-up that
            // would pass it, which is what closes the free half at three.
            Arg.static("maxValue", FREE_MAX_USES),
          ]),
        });
    })
);

/**
 * Spending an ad-backed use: the same count-up, against a higher ceiling, paid
 * for with a banked view.
 *
 * Both costs are consume actions of one rate, so the exchange is one
 * transaction and the namespace commits it atomically. That matters here more
 * than anywhere else on the page: a count-up refused at five must not leave
 * the point spent, and a point that could not be spent must not let the
 * count-up through.
 *
 * The order is the order GS2 executes them in. The point goes first so that a
 * visitor with nothing banked is refused for the reason they can act on
 * — there is no view to spend — rather than for the ceiling.
 */
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
              Source.parent(Source.direct(UsageLimitCounter, COUNTER_LIMIT))
            ),
            Arg.domainProperty("counter", Source.direct(UsageLimitCounter, "id")),
            Arg.static("countUpValue", STEP),
            Arg.static("maxValue", AD_MAX_USES),
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
      ja: "ライブデモ用の日次リセット設定と回数カウンター、無料枠と広告枠それぞれの利用操作、リセット操作を提供します。視聴枠は広告デモから借ります。",
      en: "Supplies the daily allowance used by the live demo, its counter, the free and ad-backed presses that use it, and the reset. The view point it spends comes from the ad demo.",
    },
  })
  .dependency(limit.packageId, "github:gs2io/gs2-studio-package")
  // The point row, the ad namespace and the press that banks a view all come
  // from the ad package's own demo rather than being written out again here:
  // both demos deploy into one GS2 project and the ad stack's names are fixed,
  // so a second author of the same stack is a second version of it and the
  // last deploy wins.
  .dependency(adDemo.packageId, "github:gs2io/gs2-studio-package")
  // The ad-backed press spends through the ad package's own
  // `ConsumeAdViewPoint`, and an install does not walk a package's own
  // dependencies, so the base package is named here too.
  .dependency(ad.packageId, "github:gs2io/gs2-studio-package")

  // Resets every day at midnight UTC, and governs every counter that names it
  // — here, exactly one.
  .instance(UsageLimit, DAILY, {
    [limit.propertyId("UsageLimit", "resetType")]: "daily",
    [limit.propertyId("UsageLimit", "resetHour")]: RESET_HOUR,
  })

  // The counter has no master data of its own — a tally is something a player
  // has run up — but naming it here is what lets the rates be named after it,
  // and what gives the page a row to press.
  .instance(UsageLimitCounter, DAILY, {
    [COUNTER_LIMIT]: DAILY,
  })

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
      .addChild(ResetRateModel)
  )

  // The feature package ships no UI: a limit is infrastructure, and what a
  // title shows of it is the title's decision. So the demo supplies the
  // readings and the presses for the counter and its schedule. The ad
  // balance and the press that banks a view are the ad demo's, and the page
  // draws them from there.
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
      // Both ceilings are literals because neither lives on the counter: they
      // live on the two presses below, and nothing on the server would answer
      // for either. Reading them beside the one count is the page's whole
      // point.
      .templateLabel(
        "UsageLabel",
        "{count} used. Free presses stop at {free}, ad-backed ones at {adBacked}.",
        {
          count: ui.prop("count"),
          free: ui.lit(FREE_MAX_USES),
          adBacked: ui.lit(AD_MAX_USES),
        },
        { name: "UsageLimitCounter" }
      )
      .value("NextResetAtValue", ui.prop("nextResetAt"), { name: "UsageLimitCounter" })
      .buttonAction("UseFreeButton", "UseFree", undefined, { name: "UsageLimitCounter" })
      .buttonAction("UseWithAdButton", "UseWithAd", undefined, { name: "UsageLimitCounter" })
      .buttonAction("ResetButton", "Reset", undefined, { name: "UsageLimitCounter" })
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
  .delegatedAction(UsageLimitCounter, "Reset", {
    targetActionKey: "Gs2Exchange:RateModel.Exchange",
    targetResource: ResetRateModel,
    parameterOverrides: [{ kind: "static", parameterName: "count", value: 1 }],
  })
  .build();

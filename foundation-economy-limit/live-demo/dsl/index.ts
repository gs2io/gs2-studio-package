/**
 * Live demo content for `foundation-economy-limit`.
 *
 * The feature package counts allowances but ships none: how often a thing may
 * be done, and when the tally goes back to zero, are a title's decisions. This
 * package supplies two schedules, the four allowances that follow them, and
 * the presses that move them.
 *
 * Three things are on the page, and each of them is a thing the schedule and
 * the tally being separate rows is what makes possible.
 *
 * **The ceiling belongs to the press.** It is not on the schedule and not on
 * the counter; GS2 takes it at count-up time. So one of the four allowances is
 * counted by two presses that name different ceilings — three uses are free,
 * and two more are there for a visitor who has banked an ad view, because the
 * press that spends one names five. The same number closes twice: at three the
 * free press is refused and the ad-backed one still goes through, at five both
 * are, and nothing about the counter changed in between. A ceiling stored
 * beside the tally could not do that; there would be one number, and the
 * second press would have to be a second counter.
 *
 * **One schedule governs several independent allowances.** Three of the four
 * follow the daily one, and running out of quest attempts leaves the shop and
 * the gift where they were. The cadence is shared; the tallies are not.
 *
 * **A title may keep more than one cadence.** The fourth follows a weekly
 * schedule and differs from the other three in nothing but which row it points
 * at — so its next reset is a different day, and its allowance survives a
 * midnight that empties the others.
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

/**
 * When the tallies go back to zero. Shared: this demo deploys two of these and
 * one of them is followed by three counters.
 */
const UsageLimit = limit.type("UsageLimit");

/** A tally itself. Four of these are deployed, each naming a schedule. */
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
 * The two schedules, by their row ids.
 *
 * Nothing on the page is named after either of them. A counter is addressed by
 * the pair (limitName, counterName) and the generated `CounterLoader` takes the
 * schedule as its own input, reading the counter's reference rather than
 * reusing the counter's id for both slots — so a counter is named after what it
 * counts, and any number of them may name the same schedule. That is the whole
 * arrangement this page is here to show.
 */
const DAILY = "daily";
const WEEKLY = "weekly";

/**
 * Midnight UTC, for both schedules. `resetHour` is required for every cadence
 * that resets on a clock (`daily`, `weekly`, `monthly`), so a schedule that
 * omitted it would not deploy.
 */
const RESET_HOUR = 0;

/**
 * Which midnight the weekly schedule means. `resetDayOfWeek` is required when
 * and only when `resetType` is `weekly`, which is why the daily schedule below
 * leaves it unset rather than filling it with a day that means nothing. The
 * two fields the other cadences need (`resetDayOfMonth`, and `days` with
 * `anchorTimestamp`) stay unset on both for the same reason.
 */
const WEEKLY_RESET_DAY = "monday";

/**
 * The four allowances, named for what they count rather than for the schedule
 * they follow — which is the point of them being separate rows. Three follow
 * the daily schedule and one the weekly, and nothing but that reference
 * differs between them.
 */
const QUEST_ATTEMPT = "questAttempt";
const SHOP_REFRESH = "shopRefresh";
const GIFT_CLAIM = "giftClaim";
const BOSS_CHALLENGE = "bossChallenge";

/**
 * Every counter, with the schedule it follows.
 *
 * Read twice, and only from here: the rows deployed below are folded out of
 * this, and so are the actions of the press that puts all of them back. Adding
 * a counter to one and not the other would leave a page a visitor could
 * exhaust and not recover, and writing either list out by hand is what would
 * make that possible — so neither is written out.
 */
const ALLOWANCES = [
  [DAILY, QUEST_ATTEMPT],
  [DAILY, SHOP_REFRESH],
  [DAILY, GIFT_CLAIM],
  [WEEKLY, BOSS_CHALLENGE],
] as const;

/**
 * What the free press names as its ceiling — for every counter on the page,
 * because one rate serves all four. Small enough that a visitor reaches it in
 * three presses and sees the fourth refused, which is where the page starts
 * being about anything.
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
 *
 * One definition, four rows: a resource mounted on a type is deployed once per
 * row of it, and the arguments below are read off each row. So every counter
 * gets a press of its own, each naming its own (limit, counter) pair, without
 * any of them being written out here.
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
 * Wiping every tally at once, which is what midnight and Monday do on their
 * own. A visitor should not have to wait a day — or a week — to see the other
 * half of a limit, so the press stands in for both clocks.
 *
 * One press rather than one per counter. Four reset buttons would be four of
 * the page's eight presses spent on getting back to the start, and a visitor
 * who exhausted the weekly allowance and left would hand the next visitor a
 * dead button for six days. So the rate carries an action per counter, named
 * outright: a reset is addressed by the pair (limit, counter) and there is
 * nothing on a bound row that could name the other three.
 *
 * Deployed once per counter like every other rate here, so three of the four
 * rows it writes are never exchanged. They are identical, and the alternative
 * — mounting this on the schedule instead — would write a row per schedule
 * that resets counters belonging to the other one.
 */
const ResetEveryAllowanceRateModel = defineMasterDataResource(resource => {
  resource
    .model(GS2.exchange.RateModel)
    .mountLocal(UsageLimitCounter)
    .bindings({ name: Bind.domainProperty(Source.direct(UsageLimitCounter, "id")) });
  for (const [scheduleId, counterId] of ALLOWANCES) {
    resource.addArrayChild("acquireActions", acquireAction => {
      acquireAction
        .model(GS2.transaction.AcquireAction)
        .mountLocal(UsageLimitCounter)
        .bindings({
          action: Bind.transform(limit.packageId, "ResetUsageLimitCounter", [
            Arg.static("limit", scheduleId),
            Arg.static("counter", counterId),
          ]),
        });
    });
  }
});

/**
 * The package up to its schedules. Split here because a builder chain has no
 * room for a loop and the counters are folded in from {@link ALLOWANCES}: the
 * one thing that must not be possible is a counter deployed without a reset,
 * or reset without being deployed.
 */
const withSchedules = definePackage("foundation-economy-limit-demo", "0.0.0")
  .display({
    label: { ja: "回数制限（デモデータ）", en: "Usage limits (demo data)" },
    description: {
      ja: "ライブデモ用の日次・週次のリセット設定と4つの回数カウンター、無料枠と広告枠それぞれの利用操作、全体のリセット操作を提供します。視聴枠は広告デモから借ります。",
      en: "Supplies the daily and weekly schedules the live demo shows, the four allowances that follow them, the free and ad-backed presses that use one, and the reset that puts them all back. The view point it spends comes from the ad demo.",
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

  // Midnight UTC, and it governs three of the four counters below. That is
  // what a schedule is for: the cadence is shared and the tallies are not, so
  // running out of quest attempts leaves the shop and the gift untouched.
  .instance(UsageLimit, DAILY, {
    [limit.propertyId("UsageLimit", "resetType")]: "daily",
    [limit.propertyId("UsageLimit", "resetHour")]: RESET_HOUR,
  })

  // Monday, and it governs one. Two schedules rather than one because the
  // cadence is a property of the schedule, not of the counter: the weekly
  // allowance below differs from the daily ones in nothing but which row it
  // points at.
  .instance(UsageLimit, WEEKLY, {
    [limit.propertyId("UsageLimit", "resetType")]: "weekly",
    [limit.propertyId("UsageLimit", "resetDayOfWeek")]: WEEKLY_RESET_DAY,
    [limit.propertyId("UsageLimit", "resetHour")]: RESET_HOUR,
  });

// The counters have no master data of their own — a tally is something a
// player has run up — but naming them here is what deploys a rate per counter,
// and what gives the page rows to press.
export const foundationEconomyLimitDemo = ALLOWANCES.reduce(
  (builder, [scheduleId, counterId]) =>
    builder.instance(UsageLimitCounter, counterId, { [COUNTER_LIMIT]: scheduleId }),
  withSchedules
)
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
      .addChild(ResetEveryAllowanceRateModel)
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
      // What the other three allowances read. They have one ceiling, so the
      // sentence above would be three quarters wrong on them, and a section
      // draws the components it names rather than everything the type has.
      .templateLabel(
        "AllowanceLabel",
        "{count} of {free} used",
        { count: ui.prop("count"), free: ui.lit(FREE_MAX_USES) },
        { name: "UsageLimitCounter" }
      )
      .value("NextResetAtValue", ui.prop("nextResetAt"), { name: "UsageLimitCounter" })
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

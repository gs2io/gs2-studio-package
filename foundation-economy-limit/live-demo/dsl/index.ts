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
 * follow the daily one, and running the first of them out leaves the other two
 * where they were. The cadence is shared; the tallies are not.
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
 * Both dependencies are still load-bearing now that the balance is off the
 * page. The press spends through `foundation-economy-ad`'s
 * `ConsumeAdViewPoint` and earns through `foundation-economy-ad-demo`'s
 * `Watch`, so the page leaves the ad type without a heading rather than
 * without a mount: a model a section declares with no rows keeps its handler
 * on the page root, which is where the grant finds it.
 *
 * **No advertisement is played here, and none could be** — the ad networks GS2
 * accepts are mobile-only and the showroom is a WebGL player — so the page
 * shows an ad break with the ad missing, a panel that says on its face that
 * nothing is playing and why. There is one of them, on the first counter's
 * ad-backed press, and the view it stands for is earned and spent while it is
 * open. The page carries no balance of its own: a point a visitor has to bank
 * somewhere else before pressing here is a second errand, and the reading of
 * it is `foundation-economy-ad`'s demo to show rather than this one's.
 *
 * **The view is earned first and spent second, and that is two round trips.**
 * GS2 runs a transaction's verify actions, then its consume actions, then its
 * acquire actions — a stamp sheet's tasks are its consumes and its sheet is
 * its acquires — so no single exchange can hand over a point and then take it
 * back. The press therefore drives `AdViewPoint.Watch` to the grant, waits for
 * it, and only then exchanges. The panel stays up across both, so what a
 * visitor sees is one ad break.
 *
 * Which is also why the press is offered only between the ceilings. Nothing
 * makes the second half of a two-part press safe if the first half has already
 * committed, so the page does not offer the press where the exchange is going
 * to be refused: a granted view with nothing left to buy is the one failure
 * the atomic exchange cannot protect against.
 *
 * **The free half and the ad half are not both on the page at once.** Which
 * press the first counter offers is a condition on the count — the free one
 * while three are left, the ad-backed one between the two ceilings, and
 * neither past the higher one — so the visitor is told which half they are in
 * by what there is to press rather than by reading two buttons and working out
 * which one is still open.
 *
 * **The counters are named after nothing.** `counter1` through `counter4`, and
 * the page heads them the same way. An earlier draft called them quest
 * attempts, shop refreshes, gift claims and boss challenges, and the invented
 * errand was doing the reading for the visitor: a page that says "quest
 * attempts" is a page about quests, and what is actually on it — one number,
 * two ceilings, two clocks — had to be recovered from behind the fiction. A
 * counter here is a counter, the fourth says which cadence it follows because
 * that is the one thing that distinguishes it, and everything else the page
 * says it says outright.
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

/**
 * A tally itself, with the two ceilings its presses name.
 *
 * **The ceilings are not stored on the counter.** `Gs2Limit`'s counter record
 * has no such field and this demo does not invent one: the numbers live where
 * they always did, inside the count-up requests the two exchange rates deploy.
 * What this overlay adds is the slot those numbers are read back *into*.
 *
 * An ActionTransform runs backwards. A transform that builds a request out of
 * arguments can be asked, of a materialized `{action, request}` pair, what the
 * arguments were — which is how the generated binder already recovers `limit`
 * and `counter` on every mount (`UsageLimitCounterBinder.RestoreLimit`). Those
 * two come back because they were bound from properties; `maxValue` did not,
 * because it was a static argument and a static argument has no property to
 * come back to. Giving it one is the whole change.
 *
 * So the page stops holding a second copy of the number. It reads what the
 * deployed action says, and a page and a stack that have drifted apart say so
 * instead of the page confidently printing "6 of 3 used".
 *
 * The properties are `masterData`: their value is authored here, travels into
 * the rate's consume action at deploy time, and is read back from that action
 * at run time. `micro-shop-currency` extends the currency package's
 * `StoreProduct` with a `count` the same way, and its binder recovers it with
 * `RestoreCount`.
 */
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

/**
 * The same type as a row rather than as a definition.
 *
 * Two handles, because the DSL keeps two things apart. The overlay answers for
 * the names it declares. An inherited property, though, is addressed by the id
 * its own package published, which the overlay's typed handle will not take —
 * and this one will.
 */
const UsageLimitCounterRow = limit.type("UsageLimitCounter");

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
 * The four allowances, numbered rather than named.
 *
 * A counter counts whatever the title points it at, and naming these after an
 * errand — quest attempts, shop refreshes — puts a game on the page that is
 * not there and leaves a visitor working out which part of it is the feature.
 * The numbers say the one thing that is true of all four: they are four of the
 * same thing, and nothing but the schedule each points at tells them apart.
 */
const COUNTER_1 = "counter1";
const COUNTER_2 = "counter2";
const COUNTER_3 = "counter3";
const COUNTER_4 = "counter4";

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
  { schedule: DAILY, counter: COUNTER_1, freeMax: 3, adMax: 5 },
  { schedule: DAILY, counter: COUNTER_2, freeMax: 4, adMax: 4 },
  { schedule: DAILY, counter: COUNTER_3, freeMax: 6, adMax: 6 },
  { schedule: WEEKLY, counter: COUNTER_4, freeMax: 1, adMax: 1 },
] as const;

/**
 * Four counters, five distinct numbers, and that is the point.
 *
 * GS2 takes the ceiling at count-up time from the press, so nothing about
 * these four rows differs except the numbers a press names about them — and
 * with the same number on all four, a page showing "the ceiling belongs to the
 * press" would have been showing it with no evidence. They are small enough to
 * exhaust without tedium: 1, 3, 4, 5, 6.
 *
 * The weekly counter takes the smallest. A week is the longest wait on the
 * page and the allowance that survives it is the one a title would be
 * stingiest with; at one use it also closes on the visitor's first press,
 * which is the fastest the page can show a refusal.
 *
 * Only the first counter is pressed the ad-backed way, but the ad rate mounts
 * the counter and so writes a row for all four. Those three rows carry an
 * `adMax` equal to their free ceiling rather than something higher, because a
 * number offering an allowance the page never offers would be the one piece of
 * this data that means nothing.
 */

/** One press is worth one use. */
const STEP = 1;

/**
 * Spending a free use, modelled as an exchange that grants nothing: the
 * consume action is the whole of the press.
 *
 * The rate is named after the counter because a delegated action on
 * `UsageLimitCounter` must target a resource that mounts it — that is how the
 * generated loader learns which rate to exchange, and the generator refuses
 * an unmounted target outright (`delegatedActionTargetNotMountingDomainType`).
 *
 * It lives under its own exchange namespace because the other rates on this
 * counter name their rows the same way; sharing a namespace collides the
 * `rateModels` array on its primary key and drops the whole
 * `CurrentRateMaster` from the template.
 *
 * One definition, four rows: a resource mounted on a type is deployed once per
 * row of it, and the arguments below are read off each row. So every counter
 * gets a press of its own, each naming its own (limit, counter) pair and its
 * own ceiling, without any of them being written out here.
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
              Source.parent(Source.direct(UsageLimitCounterRow, COUNTER_LIMIT))
            ),
            Arg.domainProperty("counter", Source.direct(UsageLimitCounter, "id")),
            Arg.static("countUpValue", STEP),
            // The ceiling this press asks for, and the one argument that
            // differs between the four rows this definition deploys. Bound
            // from the row rather than stated, so the number travels into the
            // deployed request and can be read back out of it — a static
            // argument has no property to come back to.
            Arg.domainProperty("maxValue", Source.direct(UsageLimitCounter, "freeMax")),
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
              Source.parent(Source.direct(UsageLimitCounterRow, COUNTER_LIMIT))
            ),
            Arg.domainProperty("counter", Source.direct(UsageLimitCounter, "id")),
            Arg.static("countUpValue", STEP),
            Arg.domainProperty("maxValue", Source.direct(UsageLimitCounter, "adMax")),
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

  // The overlay that carries the two ceilings. Registered outright because it
  // declares properties: everything else this demo attaches to the counter
  // would have had the compiler build the same overlay unasked, and it is the
  // declarations that need writing down.
  .domainType(UsageLimitCounter)

  // Midnight UTC, and it governs three of the four counters below. That is
  // what a schedule is for: the cadence is shared and the tallies are not, so
  // running the first counter out leaves the second and the third untouched.
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
const withCounters = ALLOWANCES.reduce(
  (builder, { schedule, counter, freeMax, adMax }) =>
    // By type name: the overlay's typed handle is refused for authored rows
    // (a row belongs to the canonical type), and the dependency's handle
    // resolves value keys only against what that package publishes. The name
    // reaches the overlay this package declared, and its declarations with it.
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
      // What the first counter reads: it is pressed two ways and one ceiling
      // would be half of it. Both are literals because neither lives on the
      // counter — they live on the two presses, and nothing on the server
      // would answer for either. Reading them beside the one count is what
      // says they belong to the presses rather than to the tally.
      .templateLabel(
        "UsageLabel",
        "{count} used. Free presses stop at {free}, ad-backed ones at {adBacked}.",
        {
          count: ui.prop("count"),
          free: ui.prop("freeMax"),
          adBacked: ui.prop("adMax"),
        },
        { name: "UsageLimitCounter" }
      )
      // What the other three allowances read. They have one ceiling, so the
      // sentence above would be three quarters wrong on them, and a section
      // draws the components it names rather than everything the type has.
      .templateLabel(
        "AllowanceLabel",
        "{count} of {free} used",
        { count: ui.prop("count"), free: ui.prop("freeMax") },
        { name: "UsageLimitCounter" }
      )
      // What the page says once a press has started being refused, which is
      // the whole subject and until this was said by nothing: GS2 answers a
      // count-up over its ceiling with an error, and an error a browser
      // swallows reads as a button that does nothing. A standing line is not
      // the failure being reported — the page can say the press is closed
      // before anyone presses it.
      .templateLabel(
        "NoFreeUsesLeftLabel",
        "{count} of {free} free uses are spent. The free press is refused until the reset.",
        { count: ui.prop("count"), free: ui.prop("freeMax") },
        { name: "UsageLimitCounter" }
      )
      // The same sentence at the first counter's other ceiling.
      .templateLabel(
        "NothingLeftLabel",
        "{count} of {adBacked} uses are spent. Both presses are refused until the reset.",
        { count: ui.prop("count"), adBacked: ui.prop("adMax") },
        { name: "UsageLimitCounter" }
      )
      // The conditions the page shows rows through. A generated active toggle
      // takes the rows it hides *while its condition holds*, so each one is
      // written as the state that makes its rows unnecessary — and the free
      // half and the ad half of the same ceiling are separate conditions
      // rather than one inverted, because a toggle fills one arm.
      .activeToggle("FreeUsesSpentActiveToggle", UiCond.gte(ui.prop("count"), ui.prop("freeMax")), {
        name: "UsageLimitCounter",
      })
      .activeToggle("FreeUsesLeftActiveToggle", UiCond.lt(ui.prop("count"), ui.prop("freeMax")), {
        name: "UsageLimitCounter",
      })
      // When there is nothing for the ad-backed press to do: either the free
      // half is still open, or the tally has passed the higher ceiling too.
      //
      // One condition covering both ends rather than two, because two active
      // toggles pointed at one row both write its active state on every
      // change and the later one wins. The band between the ceilings is the
      // only place the press belongs, so the band is what is named.
      //
      // It is also what keeps the two round trips honest. The press grants a
      // view and then spends it, and those cannot be one transaction — GS2
      // runs a transaction's consume actions before its acquire actions, so
      // nothing can hand over a point it is about to take. Offering the press
      // only where the spend can succeed is what stops a refused count-up
      // leaving a granted view with nothing to buy.
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

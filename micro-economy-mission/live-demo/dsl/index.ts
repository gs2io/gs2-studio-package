/**
 * Live demo content for `micro-economy-mission`.
 *
 * The feature package keeps the tallies and the missions that watch them, and
 * ships neither: what is counted, how far it has to go, and what it pays are a
 * title's decisions. This package supplies one counter, the four missions that
 * read it, the two groups they belong to, the press that moves the counter,
 * and the currency the claims pay into.
 *
 * Three things are on the page, and each of them is a thing the counter and
 * the mission being separate rows is what makes possible.
 *
 * **One counter is read by four missions.** `career1`, `career3` and `career5`
 * want 1, 3 and 5 of the same number, and `daily2` wants 2 of it. One press
 * moves all four at once, and they fall due at different presses — so a
 * visitor sees four missions advance together and complete apart. A target
 * stored beside the tally could not do that; there would be one number and one
 * mission, and the second mission would have to be a second counter.
 *
 * **One counter keeps four windows at once.** `GS2-Mission` gives a counter a
 * scope per reset cadence, and the feature package declares all four — today,
 * this week, this month, and all time — so every press adds to every window.
 * The four readings move together and differ only in when they go back to
 * zero, which is the one thing about them a page can show in a minute.
 *
 * **A group decides when its missions come back.** `career` never resets and
 * `daily` resets every day, so the same press against the same counter is
 * claimed once and for all in one group and again tomorrow in the other. The
 * cadence belongs to the group; the counter is shared.
 *
 * **The reward is not the mission package's.** A mission pays acquire actions,
 * and an acquire action is whatever the project installed can grant — so the
 * demo depends on `foundation-economy-currency` and pays into its wallet.
 * Writing a reward this package could grant on its own would have meant paying
 * a mission counter with a mission counter, and the page would then have shown
 * the mission system handing money to itself rather than to the game.
 *
 * The reward is appended rather than authored. `Mission.completeAcquireActions`
 * is the slot the feature package leaves open, and this demo overlays `Mission`
 * to append one deposit into it, sized from a `rewardAmount` it declares — so
 * four missions pay four different amounts from one written-out action, and a
 * second package installed beside this one could append its own beside it.
 *
 * **A mission says where it stands.** `completed` and `received` are filled by
 * `arrayMembershipMapping` out of the two arrays the group's `Complete`
 * carries, and the loader that fills them subscribes — so a row rearranges
 * itself the moment a reward is taken rather than waiting for the page to be
 * reopened. Each mission is three rows and shows one or two of them: what it
 * wants and pays, always; the claim, only while the target is reached and the
 * reward is untaken; and the sentence that it has been taken, only after.
 * Below the target a mission is the brief and nothing else, which is the page
 * declining to offer a press GS2 would refuse. The wallet still moves when a
 * claim lands, and it is no longer the only evidence that one did.
 *
 * **There is no press that puts the page back.** Resetting a counter and
 * un-claiming a reward are both reachable (`Gs2Mission:ResetCounterByUserId`,
 * `Gs2Mission:RevertReceiveByUserId`), but nothing clears the group's list of
 * completed missions: that list is emptied by the group's own reset and by
 * nothing else. A press that zeroed the counter would leave four missions
 * standing as completed and claimed against a count of nothing, and the rows
 * would go on saying so, because what they read is the group's list and not
 * the tally. So `daily` is what puts its own half back, every day, and
 * `career` stays claimed — which is what `notReset` means.
 *
 * The missions are named after nothing. `career1` through `career5` and
 * `daily2` say which group they are in and what they want, and that is all
 * there is to know about them; an errand invented to sit on top — battles won,
 * chests opened — would have put a game on the page that is not there and left
 * a visitor working out which part of it was the feature.
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

import missionSurface from "../../dsl/dependency-surface.json";
import currencySurface from "../../../foundation-economy-currency/dsl/dependency-surface.json";

// Materialization publishes each package's identities, so everything below is
// addressed by name; a typo is a compile error rather than an id that resolves
// to nothing.
const mission = dependencyPackage(missionSurface);
// Where the rewards land. The wallet, the Money2 namespace and the deposit are
// all the currency package's, already written and already deployed, so none of
// them is authored again here.
const currency = dependencyPackage(currencySurface);

/** The reset clocks every group and every counter window is measured against. */
const MissionSetting = mission.type("MissionSetting");

/**
 * The tally itself, as a row rather than as a definition.
 *
 * Nothing is declared on it: a counter's four readings are user data the
 * server keeps, and the target a mission wants lives on the mission. So the
 * demo attaches a press and a namespace to the type the feature package
 * published rather than overlaying it.
 */
const MissionCounter = mission.type("MissionCounter");

/** A group of missions, which is what carries their reset cadence. */
const MissionCollection = mission.type("MissionCollection");

/** The demo shows one player with one wallet, slot 0. */
const WALLET_SLOT = 0;

/**
 * The mission, overlaid so it can carry what it pays.
 *
 * `completeAcquireActions` is the slot the feature package leaves open: the
 * generated `MissionTaskModel` binds an array child to it, and whatever the
 * property resolves to is what a completed mission grants. Appending rather
 * than replacing is what lets the amount come off the row — one deposit is
 * written here, and `rewardAmount` decides how big it is on each of the four
 * missions the demo authors.
 *
 * The property is `masterData`: its value is authored here and travels into
 * the deployed task's acquire action, which is where GS2 reads it at claim
 * time. Nothing on the server answers for it afterwards, so the page reads it
 * back from the same row the deploy was built from.
 */
const Mission = defineOverlayDomainType(
  "Mission",
  {
    ...mission.overlay("Mission"),
    actionPropertyTransforms: [
      {
        // Addressed by id because the property belongs to the type this
        // overlay extends: a single-package build does not load its
        // dependency closure, so the name would pass through unresolved.
        targetProperty: mission.propertyId("Mission", "completeAcquireActions"),
        kind: "transformEntries",
        mode: "append",
        entries: [
          {
            transformPackageId: currency.packageId,
            transformName: "DepositFreeCurrency",
            arguments: [
              { parameterName: "slot", source: { kind: "static", value: WALLET_SLOT } },
              {
                parameterName: "count",
                source: { kind: "domainProperty", propertyName: "rewardAmount" },
              },
            ],
          },
        ],
      },
    ],
  },
  domainType =>
    domainType.property(
      PT.int32("rewardAmount")
        .masterData()
        .required()
        .description("Free currency this mission deposits when its reward is claimed")
    )
);

/** The counter's own id, which is how a mission and a press both name it. */
const COUNTER_ID = mission.propertyId("MissionCounter", "id");

/**
 * The one tally on the page.
 *
 * Named after nothing, because a counter counts whatever the title points it
 * at and there is only one of them here — what the page is about is how many
 * missions read it, not what it stands for.
 */
const COUNTER = "counter";

/** One press is worth one count. */
const STEP = 1;

/**
 * The two groups, by their row ids.
 *
 * A group is what carries the reset cadence, so two of them is the smallest
 * arrangement that shows the cadence is the group's and not the counter's:
 * both groups below watch the same counter and differ in nothing else.
 */
const CAREER = "career";
const DAILY = "daily";

/**
 * When the windows close. `resetHour` governs every cadence that resets on a
 * clock, `resetDayOfWeek` the weekly one and `resetDayOfMonth` the monthly
 * one, and all three are required — the feature package deploys one counter
 * scope per cadence, so a setting that omitted any of them would not deploy.
 */
const RESET_HOUR = 0;
const RESET_DAY_OF_WEEK = "monday";
const RESET_DAY_OF_MONTH = 1;

/**
 * Every mission, with the group it belongs to and what it wants.
 *
 * Read once and folded out below: four rows, four targets, four rewards, and
 * one counter under all of them. Writing them out twice — once as rows, once
 * as something else — is what would let a mission exist with no way to be
 * claimed, so they are written once.
 *
 * The targets climb so the four fall due at four different presses: the first
 * closes on the visitor's first press, which is the fastest the page can show
 * a mission completing, and the last at five, which is still short enough to
 * reach without tedium. The rewards climb with them, because a reward that
 * was the same on all four would have made `rewardAmount` look like a
 * constant that could just as well have been written into the action.
 */
const MISSIONS = [
  { id: "career1", group: CAREER, target: 1, reward: 10 },
  { id: "career3", group: CAREER, target: 3, reward: 30 },
  { id: "career5", group: CAREER, target: 5, reward: 50 },
  { id: "daily2", group: DAILY, target: 2, reward: 20 },
] as const;

/**
 * Moving the tally, modelled as an exchange that costs nothing: the acquire
 * action is the whole of the press.
 *
 * `Gs2Mission`'s own client-callable actions are the two that claim a reward;
 * counting up is a transaction, which means something has to run it. An
 * exchange rate is the smallest thing that can, and it is what every press on
 * every demo that moves a server-side number goes through.
 *
 * The rate is named after the counter because a delegated action on
 * `MissionCounter` must target a resource that mounts it — that is how the
 * generated loader learns which rate to exchange, and the generator refuses an
 * unmounted target outright.
 */
const AdvanceRateModel = defineMasterDataResource(resource =>
  resource
    .model(GS2.exchange.RateModel)
    .mountLocal(MissionCounter)
    .bindings({ name: Bind.domainProperty(Source.direct(MissionCounter, COUNTER_ID)) })
    .addArrayChild("acquireActions", acquireAction => {
      acquireAction
        .model(GS2.transaction.AcquireAction)
        .mountLocal(MissionCounter)
        .bindings({
          action: Bind.transform(mission.packageId, "IncreaseMissionCounter", [
            // Read off the row rather than stated, so a second counter added
            // here would get its own press without this being touched.
            Arg.domainProperty("counter", Source.direct(MissionCounter, COUNTER_ID)),
            Arg.static("value", STEP),
          ]),
        });
    })
);

/**
 * The package up to its groups. Split here because a builder chain has no room
 * for a loop and the missions are folded in from {@link MISSIONS}.
 */
const withGroups = definePackage("micro-economy-mission-demo", "0.0.0")
  .display({
    label: { ja: "ミッション（デモデータ）", en: "Missions (demo data)" },
    description: {
      ja: "ライブデモ用のリセット設定、1つのカウンター、それを見る4つのミッションと2つのグループ、カウンターを進める操作を提供します。報酬は通貨パッケージのウォレットへ入ります。",
      en: "Supplies the live demo's reset settings, the one counter it shows, the four missions that read it, the two groups they belong to, and the press that advances the counter. The rewards land in the currency package's wallet.",
    },
  })
  .displayType(Mission, {
    label: { ja: "ミッション", en: "Mission" },
    description: {
      ja: "デモのミッションに、完了時へ付与する無償通貨の額を足します。",
      en: "Adds the free currency a demo mission deposits when it is claimed.",
    },
  })
  .dependency(mission.packageId, "github:gs2io/gs2-studio-package")
  // The mission package points its groups at a schedule type, and an install
  // does not walk a package's own dependencies, so the package that owns that
  // type is named here too.
  .dependency("foundation-economy-schedule", "github:gs2io/gs2-studio-package")
  // The schedule demo authors the event windows. They live in the schedule
  // stack this demo deploys too, so it is installed rather than left out:
  // deployed from here without it, that stack would lose them.
  .dependency("foundation-economy-schedule-demo", "github:gs2io/gs2-studio-package")
  // Where a claim pays. The wallet, the namespace and the deposit are all this
  // package's, so none of them is authored again here.
  .dependency(currency.packageId, "github:gs2io/gs2-studio-package")
  // Its rows — the store and its shelf — live in the currency stack every demo
  // holding a wallet deploys. Deployed from here without them, that stack
  // would lose what the other demos put there.
  .dependency("foundation-economy-currency-demo", "github:gs2io/gs2-studio-package")
  // The currency demo stocks the currency shop's price table, and an install
  // does not walk a package's own dependencies, so the shop is named too.
  .dependency("micro-shop-currency", "github:gs2io/gs2-studio-package")

  // The overlay that carries what a mission pays. Registered outright because
  // it declares a property and hosts the append: everything else this demo
  // attaches to a mission type would have had the compiler build the overlay
  // unasked, and it is the declaration and the append that need writing down.
  .domainType(Mission)

  // Midnight UTC, Monday, the first of the month. One row per project, and
  // every counter window and every group cadence below is measured against it.
  .instance(MissionSetting, "missionsetting", {
    [mission.propertyId("MissionSetting", "resetHour")]: RESET_HOUR,
    [mission.propertyId("MissionSetting", "resetDayOfWeek")]: RESET_DAY_OF_WEEK,
    [mission.propertyId("MissionSetting", "resetDayOfMonth")]: RESET_DAY_OF_MONTH,
  })

  // The tally has no master data of its own — a count is something a player
  // has run up — but naming it here is what deploys a counter model for it,
  // and what gives the page a press and four readings.
  .instance(MissionCounter, COUNTER, {})

  // Claimed once and for all. This is what `notReset` means, and it is why
  // there is no press on the page that puts these three back.
  .instance(MissionCollection, CAREER, {
    [mission.propertyId("MissionCollection", "scope")]: "notReset",
  })

  // Claimable again tomorrow. The only thing that differs from the group above
  // is this word, and the counter underneath the two is the same one.
  .instance(MissionCollection, DAILY, {
    [mission.propertyId("MissionCollection", "scope")]: "daily",
  });

// Four missions, one counter. Authored by type name rather than through the
// overlay's handle: a row belongs to the canonical type, and the dependency's
// handle resolves value keys only against what that package publishes. The
// name reaches the overlay this package declared, and `rewardAmount` with it.
const withMissions = MISSIONS.reduce(
  (builder, { id, group, target, reward }) =>
    builder.instance("Mission", id, {
      [mission.propertyId("Mission", "missionCollection")]: group,
      [mission.propertyId("Mission", "counter")]: COUNTER,
      [mission.propertyId("Mission", "targetValue")]: target,
      // The slot the reward is appended to. Authored empty rather than left
      // unset because the feature package requires it, and empty is what it
      // holds before the append: what a mission pays is this demo's to say.
      [mission.propertyId("Mission", "completeAcquireActions")]: [],
      rewardAmount: reward,
    }),
  withGroups
);

export const microEconomyMissionDemo = withMissions
  .masterDataResource(resource =>
    resource
      .model(GS2.exchange.Namespace)
      .bindings({
        name: Bind.static("MissionAdvance"),
        ...Bind.nulls(
          "acquireAwaitScript",
          "exchangeScript",
          "incrementalExchangeScript",
          "logSetting"
        ),
        // The demo runs the transaction server-side and commits it atomically.
        // With auto-run off, `Exchange` only hands back a stamp sheet the
        // client has to execute through the distributor — an extra round trip,
        // and one more place for a count-up to surface as something other than
        // a count-up.
        transactionSetting: transactionSetting({
          enableAtomicCommit: Bind.static(true),
          enableAutoRun: Bind.static(true),
        }),
      })
      .addChild(AdvanceRateModel)
  )

  // The feature package ships the four counter readings, and the page draws
  // those as they come. What it does not ship is a sentence about a group, a
  // sentence about a mission, or a press that claims one, so those are here.
  //
  // It also ships two conditions — `CompletedActiveToggle` and
  // `ReceivedActiveToggle` — and the page governs no row with either, though
  // both now read state a client fills. An active toggle carries the rows its
  // condition empties, so those two can only carry a row meaning "not reached
  // yet" or "not claimed yet". The page has neither: what a mission wants is
  // in the brief, and whether the claim is open or spent is the press and the
  // sentence below, which turn on `completed && !received` and on `received`
  // — a pair and a positive that neither shipped condition states. Giving
  // them a row apiece would have been writing a row to have somewhere to put
  // a condition.
  //
  // `MissionSetting` gets none. It is deploy-only — the counter scopes and the
  // group cadences are built out of it at deploy time and no client loader
  // reads it back — so a component pointed at it is refused outright
  // ("binder data could not be resolved"). What it decides is on the page
  // through the rows it shaped, not as a reading of its own.
  .uiComponent(MissionCollection, ui =>
    ui.templateLabel(
      "ResetLabel",
      "{id}: claims reset {scope}",
      { id: ui.prop("id"), scope: ui.prop("scope") },
      { name: "MissionCollection" }
    )
  )

  .uiComponent(MissionCounter, ui =>
    ui.buttonAction("AdvanceButton", "Advance", undefined, { name: "MissionCounter" })
  )

  .uiComponent(Mission, ui =>
    ui
      // What a mission is, in the one sentence the server can answer for: the
      // count it wants and the deposit it pays. Both are read off the row, so
      // a page and a stack that have drifted apart say so instead of the page
      // confidently printing a target nothing enforces.
      .templateLabel(
        "BriefLabel",
        "Wants {target} on the counter. Pays {reward} free currency.",
        { target: ui.prop("targetValue"), reward: ui.prop("rewardAmount") },
        { name: "Mission" }
      )
      // `Receive` is the feature package's own press — one mission's reward,
      // through `Gs2Mission:MissionTaskModel.Complete` — so the demo supplies
      // the button and nothing else.
      .buttonAction("ClaimButton", "Receive", undefined, { name: "Mission" })
      // What a claim leaves behind, on the mission rather than in the wallet.
      // The amount is the row's own, so a claimed mission names the number its
      // deposit actually carried instead of a figure written out twice.
      .templateLabel(
        "ClaimedLabel",
        "Claimed. {reward} free currency was paid.",
        { reward: ui.prop("rewardAmount") },
        { name: "Mission" }
      )
      // An active toggle carries the rows its condition empties, so each one
      // below is named for the state in which its row has nothing to say
      // rather than for the state that puts it on the page.
      //
      // Claiming is open between the target and the reward: below the target
      // GS2 refuses the press, and past the reward there is nothing left to
      // take. The button is therefore governed by the union of those two, and
      // a press the server would turn down is never offered.
      .activeToggle(
        "ClaimUnavailableActiveToggle",
        UiCond.or(
          UiCond.not(UiCond.truthy(ui.prop("completed"))),
          UiCond.truthy(ui.prop("received"))
        ),
        { name: "Mission" }
      )
      // And the sentence above is worth nothing until the reward is taken.
      // Written as `not(received)` rather than through `invert`, because the
      // generated `<summary>` is built from the condition and not from the
      // flag, and would otherwise describe the opposite of what it does.
      .activeToggle("UnclaimedActiveToggle", UiCond.not(UiCond.truthy(ui.prop("received"))), {
        name: "Mission",
      })
  )

  .delegatedAction(MissionCounter, "Advance", {
    targetActionKey: "Gs2Exchange:RateModel.Exchange",
    targetResource: AdvanceRateModel,
    parameterOverrides: [{ kind: "static", parameterName: "count", value: 1 }],
  })
  .build();

/**
 * Live demo content for `micro-economy-login-reward`.
 *
 * The feature package is a login bonus with no bonus in it: it declares the
 * group a player claims against, the reward rows mounted on that group's
 * `rewards[]`, and the presses GS2 offers — `Receive` and `MissedReceive`. What
 * a title ships as its bonus — how many days and what each pays — is not the
 * package's to guess, so this package supplies one seven-day track.
 *
 * A visitor presses Receive and watches the first day's coins land in the
 * wallet and the first row of the track turn to "Received". A second Receive
 * the same day is refused (`alreadyReceived`): the track advances once a day,
 * at 15:00 UTC, which is midnight in Japan. So the page carries Advance one
 * day, which moves the visitor's clock on GS2 forward 24 hours so the next day
 * can be received now, and Start over, which deletes the receive status so the
 * track begins again.
 *
 * **Advance one day is the demo's own.** It sets the account's time offset,
 * which no package action does, so it is a hand-written Unity component
 * (`Assets/Showroom/`) rather than a press declared here, and it signs in with
 * the demo's own client (`live-demo/client-stack.yaml`), whose policy allows
 * the call. The track itself is untouched: it is the same bonus a title
 * would ship, seen on a faster clock.
 *
 * **Streaming, not scheduled.** The group counts the days the player has
 * claimed rather than the days since an event opened, so a visitor always
 * starts from day one and there is no event window that has to be open. Repeat
 * is off: past day seven Receive is refused rather than the track wrapping
 * round. Relief is off too, because a missed day is reached by advancing the
 * clock rather than by paying for it.
 *
 * **Start over is an exchange.** GS2 has no client action that deletes a
 * receive status; the feature package ships the deletion as an acquire
 * transform, and a free exchange rate on the group is the smallest thing that
 * runs one on a press.
 *
 * The wallet and the schedule are other packages' and are installed beside
 * this one rather than written out again: their rows live in stacks every demo
 * holding them deploys, and a second author of them would be a second
 * version, and the last deploy would win.
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

import { jaEnField } from "../../../dsl/jaEnField";
import loginRewardSurface from "../../dsl/dependency-surface.json";
import currencySurface from "../../../foundation-economy-currency/dsl/dependency-surface.json";

const loginReward = dependencyPackage(loginRewardSurface);
const currency = dependencyPackage(currencySurface);

/**
 * The group, as the dependency publishes it. The toggle below reads the
 * group's `receivedSteps` at the row's element index, and names the group
 * through the dependency so the list resolves against what it publishes.
 */
const PublishedLoginRewardCollection = loginReward.type("LoginRewardCollection");

/** The wallet the page shows and every reward lands in. */
const WALLET_SLOT = 0;

/** The one track on the page. */
const DAILY = "daily";

/**
 * The hour, in UTC, at which the track moves on to the next day: 15:00 UTC is
 * midnight in Japan.
 */
const RESET_HOUR = 15;

/**
 * The seven days, in the order they are claimed. The ids sort in this order,
 * which is the order the deployed `rewards[]` is laid out in and so the step
 * each row stands for. The last day pays more, so finishing the track is
 * worth something of its own.
 */
const DAYS = [
  { id: "day1", displayName: "Day 1", coins: 10 },
  { id: "day2", displayName: "Day 2", coins: 20 },
  { id: "day3", displayName: "Day 3", coins: 30 },
  { id: "day4", displayName: "Day 4", coins: 40 },
  { id: "day5", displayName: "Day 5", coins: 50 },
  { id: "day6", displayName: "Day 6", coins: 60 },
  { id: "day7", displayName: "Day 7", coins: 100 },
] as const;

/**
 * The group, overlaid so the page's presses and labels, and the start-over
 * rate mounted on it, have a type of this package's to hang from.
 */
const LoginRewardCollection = defineOverlayDomainType(
  "LoginRewardCollection",
  loginReward.overlay("LoginRewardCollection")
);

/**
 * The reward row, overlaid so it can carry a name and what it pays.
 *
 * `acquireActions` is the slot the feature package leaves open; one deposit is
 * appended to it and `coins` decides how big it is on each day.
 */
const LoginReward = defineOverlayDomainType(
  "LoginReward",
  {
    ...loginReward.overlay("LoginReward"),
    actionPropertyTransforms: [
      {
        targetProperty: loginReward.propertyId("LoginReward", "acquireActions"),
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
                source: { kind: "domainProperty", propertyName: "coins" },
              },
            ],
          },
        ],
      },
    ],
  },
  domainType =>
    domainType
      .property(PT.string("displayName").assetDelivery().required())
      .property(
        PT.int32("coins")
          .masterData()
          .required()
          .description("Free currency this day deposits when it is claimed")
      )
      .localizedProperties({
        displayName: jaEnField(
          "表示名",
          "Display name",
          "ログインボーナスの一覧に表示する名前です。",
          "Name shown in the login reward track."
        ),
        coins: jaEnField(
          "報酬コイン",
          "Reward coins",
          "この日を受け取ったときに付与する無償通貨の額です。",
          "Free currency paid when this day is claimed.",
          { ja: "通貨", en: "currency" }
        ),
      })
);

/**
 * Starting over, modelled as an exchange that costs nothing: the acquire
 * action is the whole of the press.
 *
 * The rate is named after the group and mounted on it, because a delegated
 * action on the group must target a resource that mounts it — that is how the
 * generated loader learns which rate to exchange. The group arrives at the
 * transform as a reference, so the status it deletes is this group's own.
 */
const StartOverRateModel = defineMasterDataResource(resource =>
  resource
    .model(GS2.exchange.RateModel)
    .mountLocal(LoginRewardCollection)
    .bindings({ name: Bind.domainProperty(Source.direct(LoginRewardCollection, "id")) })
    .addArrayChild("acquireActions", acquireAction => {
      acquireAction
        .model(GS2.transaction.AcquireAction)
        .mountLocal(LoginRewardCollection)
        .bindings({
          action: Bind.transform(loginReward.packageId, "ResetReceiveStatus", [
            Arg.domainProperty(
              "loginRewardCollection",
              Source.direct(LoginRewardCollection, "id")
            ),
          ]),
        });
    })
);

/**
 * The package up to its group. Split here because a builder chain has no room
 * for a loop and the days are folded in from {@link DAYS}.
 */
const withGroup = definePackage("micro-economy-login-reward-demo", "0.0.0")
  .display({
    label: { ja: "ログインボーナス（デモデータ）", en: "Login rewards (demo data)" },
    description: {
      ja: "ライブデモ用の 7 日間のログインボーナスと、各日の報酬コイン・やり直しの操作を提供します。報酬は通貨パッケージのウォレットへ入ります。",
      en: "Supplies the live demo's seven-day login bonus, the coins each day pays, and the press that starts the track over. The rewards land in the currency package's wallet.",
    },
  })
  .displayType(LoginRewardCollection, {
    label: { ja: "ログインボーナスグループ", en: "Login reward group" },
    description: {
      ja: "デモのログインボーナスグループに、受け取り・やり直しの操作と表示を付けます。",
      en: "Gives a demo login reward group its receive and start-over presses and its labels.",
    },
  })
  .displayType(LoginReward, {
    label: { ja: "ログインボーナス", en: "Login reward" },
    description: {
      ja: "デモのログインボーナスに、表示名と報酬コインを足します。",
      en: "Adds a display name and the coins it pays to a demo login reward.",
    },
  })
  .dependency(loginReward.packageId, "github:gs2io/gs2-studio-package")
  // The login reward package can point a group at a schedule type, and an
  // install does not walk a package's own dependencies, so the package that
  // owns that type is named here too.
  .dependency("foundation-economy-schedule", "github:gs2io/gs2-studio-package")
  // Its event windows live in the schedule stack this demo deploys too;
  // deployed from here without them, that stack would lose them.
  .dependency("foundation-economy-schedule-demo", "github:gs2io/gs2-studio-package")
  // Where a day pays.
  .dependency(currency.packageId, "github:gs2io/gs2-studio-package")
  .dependency("foundation-economy-currency-demo", "github:gs2io/gs2-studio-package")
  // The currency demo stocks the currency shop's price table, and an install
  // does not walk a package's own dependencies, so the shop is named too.
  .dependency("micro-shop-currency", "github:gs2io/gs2-studio-package")

  .domainType(LoginRewardCollection)
  .domainType(LoginReward)

  // Streaming with repeat and relief off: the track counts claimed days and
  // stops after day seven, and the next day is reached by advancing the clock.
  .instance(LoginRewardCollection.typeName, DAILY, {
    [loginReward.propertyId("LoginRewardCollection", "mode")]: "streaming",
    [loginReward.propertyId("LoginRewardCollection", "repeat")]: "disabled",
    [loginReward.propertyId("LoginRewardCollection", "missedReceiveRelief")]: "disabled",
    [loginReward.propertyId("LoginRewardCollection", "resetHour")]: RESET_HOUR,
  });

// Authored by type name so the rows reach the overlay this package declares,
// and its properties with it. The acquire slot is authored empty because the
// feature package requires it and the deposit is appended.
const withDays = DAYS.reduce(
  (builder, { id, displayName, coins }) =>
    builder.instance(LoginReward.typeName, id, {
      [loginReward.propertyId("LoginReward", "loginRewardCollection")]: DAILY,
      [loginReward.propertyId("LoginReward", "acquireActions")]: [],
      displayName,
      coins,
    }),
  withGroup
);

export const microEconomyLoginRewardDemo = withDays
  .masterDataResource(resource =>
    resource
      .model(GS2.exchange.Namespace)
      .bindings({
        name: Bind.static("LoginRewardStartOver"),
        ...Bind.nulls(
          "acquireAwaitScript",
          "exchangeScript",
          "incrementalExchangeScript",
          "logSetting"
        ),
        // The demo runs the transaction server-side and commits it atomically.
        // With auto-run off, `Exchange` only hands back a stamp sheet the
        // client has to execute through the distributor.
        transactionSetting: transactionSetting({
          enableAtomicCommit: Bind.static(true),
          enableAutoRun: Bind.static(true),
        }),
      })
      .addChild(StartOverRateModel)
  )

  // The feature package ships the presses but no components: what a title
  // shows of a login bonus is the title's decision.
  .uiComponent(LoginRewardCollection, ui =>
    ui
      // `Receive` is the feature package's own press; GS2 picks the step, so
      // it takes no argument.
      .buttonAction("ReceiveButton", "Receive", undefined, { name: "LoginRewardCollection" })
      .buttonAction("StartOverButton", "StartOver", undefined, { name: "LoginRewardCollection" })
      // A label rather than a value: a timestamp value is drawn as a
      // countdown, and this is a moment in the past. GS2 stores it in UTC.
      .templateLabel(
        "LastReceivedLabel",
        "Last received: {lastReceivedAt} (UTC)",
        {
          lastReceivedAt: ui.inheritedProp(
            loginReward.propertyId("LoginRewardCollection", "lastReceivedAt")
          ),
        },
        { name: "LoginRewardCollection" }
      )
      .templateLabel(
        "RuleLabel",
        "A new day starts at 15:00 UTC (midnight in Japan). Advance one day moves your clock forward 24 hours, so the next day can be received now.",
        {},
        { name: "LoginRewardCollection" }
      )
  )

  .uiComponent(LoginReward, ui =>
    ui
      .templateLabel(
        "DayLabel",
        "{displayName}: {coins} coins",
        { displayName: ui.prop("displayName"), coins: ui.prop("coins") },
        { name: "LoginReward" }
      )
      .templateLabel("ReceivedLabel", "Received", {}, { name: "LoginReward" })
      // Whether this row's step has been claimed: the group's `receivedSteps`
      // at the row's element index, which is the row's place in `rewards[]`.
      .activeToggle(
        "ReceivedActiveToggle",
        UiCond.rowElement(PublishedLoginRewardCollection, "receivedSteps"),
        { name: "LoginReward" }
      )
      // An active toggle carries the rows its condition empties, so the mark
      // is governed by the negation. Written as `not(...)` rather than through
      // `invert`, because the generated `<summary>` is built from the
      // condition and would otherwise describe the opposite of what it does.
      .activeToggle(
        "UnreceivedActiveToggle",
        UiCond.not(UiCond.rowElement(PublishedLoginRewardCollection, "receivedSteps")),
        { name: "LoginReward" }
      )
  )

  .delegatedAction(LoginRewardCollection, "StartOver", {
    targetActionKey: "Gs2Exchange:RateModel.Exchange",
    targetResource: StartOverRateModel,
    parameterOverrides: [{ kind: "static", parameterName: "count", value: 1 }],
  })
  .build();

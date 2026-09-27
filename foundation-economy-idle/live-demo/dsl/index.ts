/**
 * Live demo content for `foundation-economy-idle`.
 *
 * Idle rewards build up while the player is away: every full interval pays
 * once, up to a cap, and Receive pays everything built up and starts the count
 * again. The feature package is the idle category and the Receive press; what
 * an interval pays and how long the player may stay away are the title's
 * decision, so this package supplies them: every five minutes away pays a few
 * coins, every twelfth interval (an hour away, counted from the last Receive)
 * pays a bigger drop instead, and the count stops at eight hours.
 *
 * GS2 pays the i-th interval from the i-th reward, round and round, so the
 * hourly drop is simply the twelfth of twelve rewards. The rewards are laid
 * out in the order of their ids, which {@link REWARDS} keeps.
 *
 * **Hours pass on a button.** Waiting an hour is no demo, so the page carries
 * Advance one hour and Advance eight hours, which move the visitor's clock on
 * GS2 forward. They set the account's time offset, which no package action
 * does, so they are hand-written Unity components (`Assets/Showroom/`), and
 * they sign in with the demo's own client (`live-demo/client-stack.yaml`),
 * whose policy allows the call. The category itself is untouched: it is the
 * same one a title would ship, seen on a faster clock.
 *
 * **What has built up is read, not bound.** GS2 derives the idle minutes from
 * the clock each time the status is read, so the stored status never changes
 * while time passes and a bound label would stay at its first value. The idle
 * time and the coins waiting are read by hand from GS2's prediction.
 *
 * The wallet is another package's and is installed beside this one rather
 * than written out again: its rows live in stacks every demo holding it
 * deploys, and a second author of them would be a second version, and the
 * last deploy would win.
 */

import { defineOverlayDomainType, definePackage, dependencyPackage, PT } from "~/dsl";

import { jaEnField } from "../../../dsl/jaEnField";
import idleSurface from "../../dsl/dependency-surface.json";
import currencySurface from "../../../foundation-economy-currency/dsl/dependency-surface.json";

const idle = dependencyPackage(idleSurface);
const currency = dependencyPackage(currencySurface);

/** The wallet the page shows and every reward lands in. */
const WALLET_SLOT = 0;

/** How often being away pays, and for how long it keeps counting. */
const REWARD_INTERVAL_MINUTES = 5;
const MAXIMUM_IDLE_MINUTES = 8 * 60;

/** What an ordinary interval pays, and what the hourly one does. */
const COINS_PER_INTERVAL = 5;
const COINS_PER_HOUR_DROP = 50;

/**
 * One reward per interval of an hour, in the order GS2 pays them. The ids
 * sort in this order, which is the order the deployed rewards are laid out
 * in; the last is the hourly drop.
 */
const REWARDS = Array.from({ length: 60 / REWARD_INTERVAL_MINUTES }, (_, index) => ({
  id: `interval${String(index + 1).padStart(2, "0")}`,
  coins: index === 60 / REWARD_INTERVAL_MINUTES - 1 ? COINS_PER_HOUR_DROP : COINS_PER_INTERVAL,
}));

/**
 * The category, overlaid so the page's press and rule have a type of this
 * package's to hang from.
 */
const IdleStatus = defineOverlayDomainType("IdleStatus", idle.overlay("IdleStatus"));

/**
 * The reward, overlaid so it can say what it pays.
 *
 * `acquireActions` is the slot the feature package leaves open; one deposit is
 * appended to it and `coins` decides how big it is.
 */
const IdleReward = defineOverlayDomainType(
  "IdleReward",
  {
    ...idle.overlay("IdleReward"),
    actionPropertyTransforms: [
      {
        targetProperty: idle.propertyId("IdleReward", "acquireActions"),
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
      .property(
        PT.int32("coins")
          .masterData()
          .required()
          .description("Free currency one interval away deposits")
      )
      .localizedProperties({
        coins: jaEnField(
          "報酬コイン",
          "Reward coins",
          "放置 1 区間ごとに付与する無償通貨の額です。",
          "Free currency paid for each interval away.",
          { ja: "通貨", en: "currency" }
        ),
      })
);

const withStatus = definePackage("foundation-economy-idle-demo", "0.0.0")
  .display({
    label: { ja: "放置報酬（デモデータ）", en: "Idle rewards (demo data)" },
    description: {
      ja: "ライブデモ用の放置報酬（5 分ごとに少し、1 時間ごとに多めのコイン、上限 8 時間）を提供します。報酬は通貨パッケージのウォレットへ入ります。",
      en: "Supplies the live demo's idle reward: a few coins every five minutes away and a bigger drop every hour, up to eight hours. The rewards land in the currency package's wallet.",
    },
  })
  .displayType(IdleStatus, {
    label: { ja: "放置状況", en: "Idle status" },
    description: {
      ja: "デモの放置状況に、受け取りの操作と説明を付けます。",
      en: "Gives the demo idle status its receive press and its rule.",
    },
  })
  .displayType(IdleReward, {
    label: { ja: "放置報酬", en: "Idle reward" },
    description: {
      ja: "デモの放置報酬に、報酬コインを足します。",
      en: "Adds the coins it pays to a demo idle reward.",
    },
  })
  .dependency(idle.packageId, "github:gs2io/gs2-studio-package")
  // Where an interval pays.
  .dependency(currency.packageId, "github:gs2io/gs2-studio-package")
  .dependency("foundation-economy-currency-demo", "github:gs2io/gs2-studio-package")
  // The currency demo stocks the currency shop's price table, and an install
  // does not walk a package's own dependencies, so the shop is named too.
  .dependency("micro-shop-currency", "github:gs2io/gs2-studio-package")

  .domainType(IdleStatus)
  .domainType(IdleReward)

  .instance(IdleStatus.typeName, "idlestatus", {
    [idle.propertyId("IdleStatus", "rewardIntervalMinutes")]: REWARD_INTERVAL_MINUTES,
    [idle.propertyId("IdleStatus", "defaultMaximumIdleMinutes")]: MAXIMUM_IDLE_MINUTES,
  });

// Authored by type name so the rows reach the overlay this package declares,
// and its property with them. The acquire slot is authored empty because the
// feature package requires it and the deposit is appended.
const withRewards = REWARDS.reduce(
  (builder, { id, coins }) =>
    builder.instance(IdleReward.typeName, id, {
      [idle.propertyId("IdleReward", "acquireActions")]: [],
      coins,
    }),
  withStatus
);

export const foundationEconomyIdleDemo = withRewards

  // The feature package ships the press but no components: what a title
  // shows of an idle reward is the title's decision.
  .uiComponent(IdleStatus, ui =>
    ui
      .templateLabel(
        "RuleLabel",
        `Every ${REWARD_INTERVAL_MINUTES} minutes away pays ${COINS_PER_INTERVAL} coins, and every ${REWARDS.length}th interval pays ${COINS_PER_HOUR_DROP} instead, for up to ${MAXIMUM_IDLE_MINUTES / 60} hours. Receive pays what has built up and starts the count again; minutes short of a full ${REWARD_INTERVAL_MINUTES} are dropped.`,
        {},
        { name: "IdleStatus" }
      )
      // `Receive` is the feature package's own press; GS2 works out what has
      // built up, so it takes no argument.
      .buttonAction("ReceiveButton", "Receive", undefined, { name: "IdleStatus" })
  )
  .build();

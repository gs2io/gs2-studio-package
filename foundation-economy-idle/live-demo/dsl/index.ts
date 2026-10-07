/** The page refreshes idle predictions separately because elapsed time alone does not change the stored status. */

import { defineOverlayDomainType, definePackage, dependencyPackage, PT } from "~/dsl";

import { jaEnField } from "../../../dsl/jaEnField";
import idleSurface from "../../dsl/dependency-surface.json";
import currencySurface from "../../../foundation-economy-currency/dsl/dependency-surface.json";

const idle = dependencyPackage(idleSurface);
const currency = dependencyPackage(currencySurface);

const WALLET_SLOT = 0;

const REWARD_INTERVAL_MINUTES = 5;
const MAXIMUM_IDLE_MINUTES = 8 * 60;

const COINS_PER_INTERVAL = 5;
const COINS_PER_HOUR_DROP = 50;

/** Pad ids so lexical row ordering preserves interval order and leaves the hourly drop last. */
const REWARDS = Array.from({ length: 60 / REWARD_INTERVAL_MINUTES }, (_, index) => ({
  id: `interval${String(index + 1).padStart(2, "0")}`,
  coins: index === 60 / REWARD_INTERVAL_MINUTES - 1 ? COINS_PER_HOUR_DROP : COINS_PER_INTERVAL,
}));

const IdleStatus = defineOverlayDomainType("IdleStatus", idle.overlay("IdleStatus"));

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
        PT.int32("coins").masterData().required().description("Coins one interval away deposits")
      )
      .localizedProperties({
        coins: jaEnField(
          "報酬コイン",
          "Reward coins",
          "放置 1 区間ごとに付与するコインの額です。",
          "Coins paid for each interval away.",
          { ja: "通貨", en: "currency" }
        ),
      })
);

const withStatus = definePackage("foundation-economy-idle-demo", "0.0.0")
  .display({
    label: { ja: "放置報酬（デモデータ）", en: "Idle Rewards (demo data)" },
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
  // Reuse the currency demo content so this demo cannot deploy a conflicting version of the shared wallet stack.
  .dependency(currency.packageId, "github:gs2io/gs2-studio-package")
  .dependency("foundation-economy-currency-demo", "github:gs2io/gs2-studio-package")
  .dependency("micro-shop-currency", "github:gs2io/gs2-studio-package")

  .domainType(IdleStatus)
  .domainType(IdleReward)

  .instance(IdleStatus.typeName, "idlestatus", {
    [idle.propertyId("IdleStatus", "rewardIntervalMinutes")]: REWARD_INTERVAL_MINUTES,
    [idle.propertyId("IdleStatus", "defaultMaximumIdleMinutes")]: MAXIMUM_IDLE_MINUTES,
  });

// Address the local overlay by name so its coins property is available; keep the required acquire slot empty for the appended deposit.
const withRewards = REWARDS.reduce(
  (builder, { id, coins }) =>
    builder.instance(IdleReward.typeName, id, {
      [idle.propertyId("IdleReward", "acquireActions")]: [],
      coins,
    }),
  withStatus
);

export const foundationEconomyIdleDemo = withRewards

  .uiComponent(IdleStatus, ui =>
    ui
      .templateLabel(
        "RuleLabel",
        `Every ${REWARD_INTERVAL_MINUTES} minutes away pays ${COINS_PER_INTERVAL} coins, and every ${REWARDS.length}th interval pays ${COINS_PER_HOUR_DROP} instead, for up to ${MAXIMUM_IDLE_MINUTES / 60} hours. Receive pays what has built up and starts the count again; minutes short of a full ${REWARD_INTERVAL_MINUTES} are dropped.`,
        {},
        { name: "IdleStatus" }
      )
      .buttonAction("ReceiveButton", "Receive", undefined, { name: "IdleStatus" })
  )
  .build();

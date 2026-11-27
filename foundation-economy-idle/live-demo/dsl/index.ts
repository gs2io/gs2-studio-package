import {
  defineOverlayDomainType,
  definePackage,
  defineUiComponent,
  dependencyPackage,
  instance,
  PT,
  UiItem,
} from "gs2-studio-dsl";

import { jaEnField } from "../../../dsl/jaEnField";
import { liveDemoDependencies } from "../../../dsl/liveDemoDependencies";

import idleSurface from "../../dsl/dependency-surface.json";

import currencySurface from "../../../foundation-economy-currency/dsl/dependency-surface.json";

const idle = dependencyPackage(idleSurface);

const currency = dependencyPackage(currencySurface);

const WALLET_SLOT = 0;

const REWARD_INTERVAL_MINUTES = 5;

const MAXIMUM_IDLE_MINUTES = 8 * 60;

const COINS_PER_INTERVAL = 5;

const COINS_PER_HOUR_DROP = 50;

const REWARDS = Array.from({ length: 60 / REWARD_INTERVAL_MINUTES }, (_, index) => ({
  id: `interval${String(index + 1).padStart(2, "0")}`,
  coins: index === 60 / REWARD_INTERVAL_MINUTES - 1 ? COINS_PER_HOUR_DROP : COINS_PER_INTERVAL,
}));

const IdleStatus = defineOverlayDomainType("IdleStatus", idle.overlay("IdleStatus"), {
  localizedDisplay: {
    ja: { label: "放置状況", description: "デモの放置状況に、受け取りの操作と説明を付けます。" },
    en: {
      label: "Idle status",
      description: "Gives the demo idle status its receive press and its rule.",
    },
  },
});

const IdleReward = defineOverlayDomainType("IdleReward", idle.overlay("IdleReward"), {
  properties: {
    coins: PT.int32().masterData().required(),
  },
  actionPropertyTransforms: [
    { targetProperty: idle.propertyId("IdleReward", "acquireActions"), mode: "append", transformPackageId: currency.packageId, transformId: currency.transformId("DepositFreeCurrency"), arguments: [
          { parameterName: "slot", source: { kind: "static", value: WALLET_SLOT } },
          {
            parameterName: "count",
            source: { kind: "domainProperty", propertyName: "coins" },
          },
        ] },
  ],
  localizedDisplay: {
    ja: { label: "放置報酬", description: "デモの放置報酬に、報酬コインを足します。" },
    en: { label: "Idle reward", description: "Adds the coins it pays to a demo idle reward." },
  },
  localizedProperties: {
      coins: jaEnField(
        "報酬コイン",
        "Reward coins",
        "放置 1 区間ごとに付与するコインの額です。",
        "Coins paid for each interval away.",
        { ja: "通貨", en: "currency" }
      ),
    },
});

export const foundationEconomyIdleDemo = definePackage({
  id: "foundation-economy-idle-demo",
  version: "0.0.1",
  display: {
    ja: {
      label: "放置報酬（デモデータ）",
      description:
        "ライブデモ用の放置報酬（5 分ごとに少し、1 時間ごとに多めのコイン、上限 8 時間）を提供します。報酬は通貨パッケージのウォレットへ入ります。",
    },
    en: {
      label: "Idle Rewards (demo data)",
      description:
        "Supplies the live demo's idle reward: a few coins every five minutes away and a bigger drop every hour, up to eight hours. The rewards land in the currency package's wallet.",
    },
  },
  dependencies: liveDemoDependencies(
    idle.packageId,
    currency.packageId,
    "foundation-economy-currency-demo",
    "micro-shop-currency"
  ),
  domainTypes: [IdleStatus, IdleReward],
  instances: [
    instance(IdleStatus, "idlestatus", {
    [idle.propertyId("IdleStatus", "rewardIntervalMinutes")]: REWARD_INTERVAL_MINUTES,
    [idle.propertyId("IdleStatus", "defaultMaximumIdleMinutes")]: MAXIMUM_IDLE_MINUTES,
  }),
    ...REWARDS.map(({ id, coins }) => instance(IdleReward, id, {
      [idle.propertyId("IdleReward", "acquireActions")]: [],
      coins,
    })),
  ],
  uiComponents: [
    defineUiComponent(IdleStatus, {
  items: [
    UiItem.templateLabel("RuleLabel", `Every ${REWARD_INTERVAL_MINUTES} minutes away pays ${COINS_PER_INTERVAL} coins, and every ${REWARDS.length}th interval pays ${COINS_PER_HOUR_DROP} instead, for up to ${MAXIMUM_IDLE_MINUTES / 60} hours. Receive pays what has built up and starts the count again; minutes short of a full ${REWARD_INTERVAL_MINUTES} are dropped.`, {}, { name: "IdleStatus" }),
    UiItem.buttonAction("ReceiveButton", "Receive", undefined, { name: "IdleStatus" }),
  ],
}),
  ],
});

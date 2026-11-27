import {
  ActionProgram,
  Arg,
  Bind,
  defineMasterDataResource,
  defineOverlayDomainType,
  definePackage,
  defineUiComponent,
  dependencyPackage,
  instance,
  PT,
  Source,
  transactionSettingV2,
  UiCond,
  UiItem,
  UiSource,
} from "gs2-studio-dsl";

import { GS2 } from "gs2-studio-dsl/gs2";

import { jaEnField } from "../../../dsl/jaEnField";
import { liveDemoDependencies } from "../../../dsl/liveDemoDependencies";

import loginRewardSurface from "../../dsl/dependency-surface.json";

import currencySurface from "../../../foundation-economy-currency/dsl/dependency-surface.json";

const loginReward = dependencyPackage(loginRewardSurface);

const currency = dependencyPackage(currencySurface);

const PublishedLoginRewardCollection = loginReward.type("LoginRewardCollection");

const WALLET_SLOT = 0;

const DAILY = "daily";

const RESET_HOUR = 15;

const RESET_TIME = `${String(RESET_HOUR).padStart(2, "0")}:00 UTC`;

const RESET_HOUR_IN_JAPAN = (RESET_HOUR + 9) % 24;

const RESET_TIME_IN_JAPAN =
  RESET_HOUR_IN_JAPAN === 0 ? "midnight in Japan" : `${RESET_HOUR_IN_JAPAN}:00 in Japan`;

const DAYS = [
  { id: "day1", displayName: "Day 1", coins: 10 },
  { id: "day2", displayName: "Day 2", coins: 20 },
  { id: "day3", displayName: "Day 3", coins: 30 },
  { id: "day4", displayName: "Day 4", coins: 40 },
  { id: "day5", displayName: "Day 5", coins: 50 },
  { id: "day6", displayName: "Day 6", coins: 60 },
  { id: "day7", displayName: "Day 7", coins: 100 },
] as const;

const LoginRewardCollection = defineOverlayDomainType("LoginRewardCollection", loginReward.overlay("LoginRewardCollection"), {
  localizedDisplay: {
    ja: {
      label: "ログインボーナスグループ",
      description: "デモのログインボーナスグループに、受け取り・やり直しの操作と表示を付けます。",
    },
    en: {
      label: "Login reward group",
      description:
        "Gives a demo login reward group its receive and start-over presses and its labels.",
    },
  },
});

const LoginReward = defineOverlayDomainType("LoginReward", loginReward.overlay("LoginReward"), {
  properties: {
    displayName: PT.string().assetDelivery().required(),
    coins: PT.int32().masterData().required(),
  },
  actionPropertyTransforms: [
    { targetProperty: loginReward.propertyId("LoginReward", "acquireActions"), mode: "append", transformPackageId: currency.packageId, transformId: currency.transformId("DepositFreeCurrency"), arguments: [
          { parameterName: "slot", source: { kind: "static", value: WALLET_SLOT } },
          {
            parameterName: "count",
            source: { kind: "domainProperty", propertyName: "coins" },
          },
        ] },
  ],
  localizedDisplay: {
    ja: {
      label: "ログインボーナス",
      description: "デモのログインボーナスに、表示名と報酬コインを足します。",
    },
    en: {
      label: "Login reward",
      description: "Adds a display name and the coins it pays to a demo login reward.",
    },
  },
  localizedProperties: {
        displayName: jaEnField(
          "表示名",
          "Display name",
          "ログインボーナスの一覧に表示する名前です。",
          "Name shown in the login reward track."
        ),
        coins: jaEnField(
          "報酬コイン",
          "Reward coins",
          "この日を受け取ったときに付与するコインの額です。",
          "Coins paid when this day is claimed.",
          { ja: "通貨", en: "currency" }
        ),
      },
});

const StartOverRateModel = defineMasterDataResource({
  model: GS2.exchange.RateModel,
  mount: LoginRewardCollection,
  bindings: { name: Bind.domainProperty(Source.direct(LoginRewardCollection, "id")) },
  arrayChildren: {
    acquireActions: [
      defineMasterDataResource({
  model: GS2.transaction.AcquireAction,
  mount: LoginRewardCollection,
  actionProgram: ActionProgram.transform(
            loginReward.packageId,
            loginReward.transformId("ResetReceiveStatus"),
            [
              Arg.domainProperty(
                "loginRewardCollection",
                Source.direct(LoginRewardCollection, "id")
              ),
            ]
          ),
}),
    ],
  },
});

export const microEconomyLoginRewardDemo = definePackage({
  id: "micro-economy-login-reward-demo",
  version: "0.0.1",
  display: {
    ja: {
      label: "ログインボーナス（デモデータ）",
      description:
        "ライブデモ用の 7 日間のログインボーナスと、各日の報酬コイン・やり直しの操作を提供します。報酬は通貨パッケージのウォレットへ入ります。",
    },
    en: {
      label: "Login Rewards (demo data)",
      description:
        "Supplies the live demo's seven-day login bonus, the coins each day pays, and the press that starts the track over. The rewards land in the currency package's wallet.",
    },
  },
  dependencies: liveDemoDependencies(
    loginReward.packageId,
    "foundation-economy-schedule",
    "foundation-economy-schedule-demo",
    currency.packageId,
    "foundation-economy-currency-demo",
    "micro-shop-currency"
  ),
  domainTypes: [LoginRewardCollection, LoginReward],
  instances: [
    instance(LoginRewardCollection, DAILY, {
    [loginReward.propertyId("LoginRewardCollection", "mode")]: "streaming",
    [loginReward.propertyId("LoginRewardCollection", "repeat")]: "disabled",
    [loginReward.propertyId("LoginRewardCollection", "missedReceiveRelief")]: "disabled",
    [loginReward.propertyId("LoginRewardCollection", "resetHour")]: RESET_HOUR,
  }),
    ...DAYS.map(({ id, displayName, coins }) => instance(LoginReward, id, {
      [loginReward.propertyId("LoginReward", "loginRewardCollection")]: DAILY,
      [loginReward.propertyId("LoginReward", "acquireActions")]: [],
      displayName,
      coins,
    })),
  ],
  delegatedActions: [
    { target: LoginRewardCollection, methodName: "StartOver", action: { targetActionKey: "Gs2Exchange:RateModel.Exchange", targetResource: StartOverRateModel, parameterOverrides: [{ parameterName: "count", source: { kind: "static", value: 1 } }] } },
  ],
  masterDataResources: [
    defineMasterDataResource({
  model: GS2.exchange.Namespace,
  bindings: {
        name: Bind.static("LoginRewardStartOver"),
        ...Bind.nulls(
          "acquireAwaitScript",
          "exchangeScript",
          "incrementalExchangeScript",
          "logSetting"
        ),
        // Auto-run executes the reset without a second client request after the exchange.
        transactionSettingV2: transactionSettingV2(),
      },
  children: [
    StartOverRateModel,
  ],
}),
  ],
  uiComponents: [
    defineUiComponent(LoginRewardCollection, {
  items: [
    UiItem.buttonAction("ReceiveButton", "Receive", undefined, { name: "LoginRewardCollection" }),
    UiItem.buttonAction("StartOverButton", "StartOver", undefined, { name: "LoginRewardCollection" }),
    UiItem.templateLabel("LastReceivedLabel", "Last received: {lastReceivedAt} (UTC)", {
          lastReceivedAt: UiSource.inheritedProp(loginReward.propertyId("LoginRewardCollection", "lastReceivedAt")),
        }, { name: "LoginRewardCollection" }),
    UiItem.templateLabel("NeverReceivedLabel", "Last received: not yet", {}, { name: "LoginRewardCollection" }),
    UiItem.activeToggle("NeverReceivedActiveToggle", UiCond.not(
          UiCond.truthy(
            UiSource.inheritedProp(loginReward.propertyId("LoginRewardCollection", "lastReceivedAt"))
          )
        ), { name: "LoginRewardCollection" }),
    UiItem.activeToggle("ReceivedOnceActiveToggle", UiCond.truthy(
          UiSource.inheritedProp(loginReward.propertyId("LoginRewardCollection", "lastReceivedAt"))
        ), { name: "LoginRewardCollection" }),
    UiItem.templateLabel("RuleLabel", `A new day starts at ${RESET_TIME} (${RESET_TIME_IN_JAPAN}). Advance one day moves your clock forward 24 hours, so the next day can be received now.`, {}, { name: "LoginRewardCollection" }),
  ],
}),
    defineUiComponent(LoginReward, {
  items: [
    UiItem.templateLabel("DayLabel", "{displayName}: {coins} coins", { displayName: UiSource.prop("displayName"), coins: UiSource.prop("coins") }, { name: "LoginReward" }),
    UiItem.templateLabel("ReceivedLabel", "Received", {}, { name: "LoginReward" }),
    UiItem.activeToggle("ReceivedActiveToggle", UiCond.rowElement(PublishedLoginRewardCollection, "receivedSteps"), { name: "LoginReward" }),
    UiItem.activeToggle("UnreceivedActiveToggle", UiCond.not(UiCond.rowElement(PublishedLoginRewardCollection, "receivedSteps")), { name: "LoginReward" }),
  ],
}),
  ],
});

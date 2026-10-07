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

/** Use the published collection handle so the row-element condition resolves the inherited receivedSteps list. */
const PublishedLoginRewardCollection = loginReward.type("LoginRewardCollection");

const WALLET_SLOT = 0;

const DAILY = "daily";

const RESET_HOUR = 15;

const RESET_TIME = `${String(RESET_HOUR).padStart(2, "0")}:00 UTC`;
const RESET_HOUR_IN_JAPAN = (RESET_HOUR + 9) % 24;
const RESET_TIME_IN_JAPAN =
  RESET_HOUR_IN_JAPAN === 0 ? "midnight in Japan" : `${RESET_HOUR_IN_JAPAN}:00 in Japan`;

/** Preserve lexical id order because it determines the reward array index used by each day row. */
const DAYS = [
  { id: "day1", displayName: "Day 1", coins: 10 },
  { id: "day2", displayName: "Day 2", coins: 20 },
  { id: "day3", displayName: "Day 3", coins: 30 },
  { id: "day4", displayName: "Day 4", coins: 40 },
  { id: "day5", displayName: "Day 5", coins: 50 },
  { id: "day6", displayName: "Day 6", coins: 60 },
  { id: "day7", displayName: "Day 7", coins: 100 },
] as const;

const LoginRewardCollection = defineOverlayDomainType(
  "LoginRewardCollection",
  loginReward.overlay("LoginRewardCollection")
);

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
          .description("Coins this day deposits when it is claimed")
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
          "この日を受け取ったときに付与するコインの額です。",
          "Coins paid when this day is claimed.",
          { ja: "通貨", en: "currency" }
        ),
      })
);

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
            Arg.domainProperty("loginRewardCollection", Source.direct(LoginRewardCollection, "id")),
          ]),
        });
    })
);

const withGroup = definePackage("micro-economy-login-reward-demo", "0.0.0")
  .display({
    label: { ja: "ログインボーナス（デモデータ）", en: "Login Rewards (demo data)" },
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
  .dependency("foundation-economy-schedule", "github:gs2io/gs2-studio-package")
  // Reuse the shared schedule content so this demo cannot remove event windows from that stack.
  .dependency("foundation-economy-schedule-demo", "github:gs2io/gs2-studio-package")
  // Reuse the currency demo content so the wallet and store products stay identical across demos.
  .dependency(currency.packageId, "github:gs2io/gs2-studio-package")
  .dependency("foundation-economy-currency-demo", "github:gs2io/gs2-studio-package")
  .dependency("micro-shop-currency", "github:gs2io/gs2-studio-package")

  .domainType(LoginRewardCollection)
  .domainType(LoginReward)

  // Use streaming mode so a fresh visitor starts at day one without requiring an open event window.
  .instance(LoginRewardCollection.typeName, DAILY, {
    [loginReward.propertyId("LoginRewardCollection", "mode")]: "streaming",
    [loginReward.propertyId("LoginRewardCollection", "repeat")]: "disabled",
    [loginReward.propertyId("LoginRewardCollection", "missedReceiveRelief")]: "disabled",
    [loginReward.propertyId("LoginRewardCollection", "resetHour")]: RESET_HOUR,
  });

// Use the local overlay name for its added properties; keep the required acquire slot empty for the appended deposit.
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
        // Auto-run executes the reset without a second client request after the exchange.
        transactionSetting: transactionSetting({
          enableAtomicCommit: Bind.static(true),
          enableAutoRun: Bind.static(true),
        }),
      })
      .addChild(StartOverRateModel)
  )

  .uiComponent(LoginRewardCollection, ui =>
    ui
      .buttonAction("ReceiveButton", "Receive", undefined, { name: "LoginRewardCollection" })
      .buttonAction("StartOverButton", "StartOver", undefined, { name: "LoginRewardCollection" })
      // Use a label because the page renders timestamp values as countdowns, while this reading is a past instant.
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
      // Provide an explicit never-received label so the first visit does not show an empty timestamp.
      .templateLabel(
        "NeverReceivedLabel",
        "Last received: not yet",
        {},
        { name: "LoginRewardCollection" }
      )
      .activeToggle(
        "NeverReceivedActiveToggle",
        UiCond.not(
          UiCond.truthy(
            ui.inheritedProp(loginReward.propertyId("LoginRewardCollection", "lastReceivedAt"))
          )
        ),
        { name: "LoginRewardCollection" }
      )
      .activeToggle(
        "ReceivedOnceActiveToggle",
        UiCond.truthy(
          ui.inheritedProp(loginReward.propertyId("LoginRewardCollection", "lastReceivedAt"))
        ),
        { name: "LoginRewardCollection" }
      )
      .templateLabel(
        "RuleLabel",
        `A new day starts at ${RESET_TIME} (${RESET_TIME_IN_JAPAN}). Advance one day moves your clock forward 24 hours, so the next day can be received now.`,
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
      // Use the row element index to match receivedSteps to the deployed reward order.
      .activeToggle(
        "ReceivedActiveToggle",
        UiCond.rowElement(PublishedLoginRewardCollection, "receivedSteps"),
        { name: "LoginReward" }
      )
      // Negate the condition because page toggle bindings hide their target rows while true.
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

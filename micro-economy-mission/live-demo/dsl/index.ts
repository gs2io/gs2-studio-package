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

import missionSurface from "../../dsl/dependency-surface.json";

import currencySurface from "../../../foundation-economy-currency/dsl/dependency-surface.json";

const mission = dependencyPackage(missionSurface);

const currency = dependencyPackage(currencySurface);

const MissionSetting = mission.type("MissionSetting");

const MissionCounter = mission.type("MissionCounter");

const MissionCollection = mission.type("MissionCollection");

const WALLET_SLOT = 0;

const Mission = defineOverlayDomainType("Mission", mission.overlay("Mission"), {
  properties: {
    rewardAmount: PT.int32().masterData().required(),
  },
  actionPropertyTransforms: [
    { targetProperty: mission.propertyId("Mission", "completeAcquireActions"), mode: "append", transformPackageId: currency.packageId, transformId: currency.transformId("DepositFreeCurrency"), arguments: [
          { parameterName: "slot", source: { kind: "static", value: WALLET_SLOT } },
          {
            parameterName: "count",
            source: { kind: "domainProperty", propertyName: "rewardAmount" },
          },
        ] },
  ],
  localizedDisplay: {
    ja: {
      label: "ミッション",
      description: "デモのミッションに、報酬の受け取り時に付与するコインの額を足します。",
    },
    en: {
      label: "Mission",
      description: "Adds the coins a demo mission pays when its reward is received.",
    },
  },
  localizedProperties: {
      rewardAmount: jaEnField(
        "報酬コイン",
        "Reward coins",
        "このミッションの報酬を受け取ったときに付与するコインの額です。",
        "Coins paid when this mission's reward is received.",
        { ja: "通貨", en: "currency" }
      ),
    },
});

const COUNTER_ID = mission.propertyId("MissionCounter", "id");

const COUNTER = "counter";

const STEP = 1;

const CAREER = "career";

const DAILY = "daily";

const RESET_HOUR = 0;

const RESET_DAY_OF_WEEK = "monday";

const RESET_DAY_OF_MONTH = 1;

const MISSIONS = [
  { id: "career1", group: CAREER, target: 1, reward: 10 },
  { id: "career3", group: CAREER, target: 3, reward: 30 },
  { id: "career5", group: CAREER, target: 5, reward: 50 },
  { id: "daily2", group: DAILY, target: 2, reward: 20 },
] as const;

const AdvanceRateModel = defineMasterDataResource({
  model: GS2.exchange.RateModel,
  mount: MissionCounter,
  bindings: { name: Bind.domainProperty(Source.direct(MissionCounter, COUNTER_ID)) },
  arrayChildren: {
    acquireActions: [
      defineMasterDataResource({
  model: GS2.transaction.AcquireAction,
  mount: MissionCounter,
  actionProgram: ActionProgram.transform(
            mission.packageId,
            mission.transformId("IncreaseMissionCounter"),
            [
              // Bind the counter identity so each authored counter gets its own rate without duplicating this definition.
              Arg.domainProperty("counter", Source.direct(MissionCounter, COUNTER_ID)),
              Arg.static("value", STEP),
            ]
          ),
}),
    ],
  },
});

export const microEconomyMissionDemo = definePackage({
  id: "micro-economy-mission-demo",
  version: "0.0.1",
  display: {
    ja: {
      label: "ミッション（デモデータ）",
      description:
        "ライブデモ用のリセット設定、1 つのカウンター、それを見る 4 つのミッションと 2 つのグループ、カウンターを進める操作を提供します。報酬は通貨パッケージのウォレットへ入ります。",
    },
    en: {
      label: "Missions (demo data)",
      description:
        "Supplies the live demo's reset settings, the one counter it shows, the four missions that read it, the two groups they belong to, and the press that advances the counter. The rewards land in the currency package's wallet.",
    },
  },
  dependencies: {
    [mission.packageId]: "github:gs2io/gs2-studio-package",
    "foundation-economy-schedule": "github:gs2io/gs2-studio-package",
    "foundation-economy-schedule-demo": "github:gs2io/gs2-studio-package",
    [currency.packageId]: "github:gs2io/gs2-studio-package",
    "foundation-economy-currency-demo": "github:gs2io/gs2-studio-package",
    "micro-shop-currency": "github:gs2io/gs2-studio-package",
  },
  domainTypes: [Mission],
  instances: [
    instance(MissionSetting, "missionsetting", {
    [mission.propertyId("MissionSetting", "resetHour")]: RESET_HOUR,
    [mission.propertyId("MissionSetting", "resetDayOfWeek")]: RESET_DAY_OF_WEEK,
    [mission.propertyId("MissionSetting", "resetDayOfMonth")]: RESET_DAY_OF_MONTH,
  }),
    instance(MissionCounter, COUNTER, {}),
    instance(MissionCollection, CAREER, {
    [mission.propertyId("MissionCollection", "scope")]: "notReset",
  }),
    instance(MissionCollection, DAILY, {
    [mission.propertyId("MissionCollection", "scope")]: "daily",
  }),
    ...MISSIONS.map(({ id, group, target, reward }) => instance(Mission, id, {
      [mission.propertyId("Mission", "missionCollection")]: group,
      [mission.propertyId("Mission", "counter")]: COUNTER,
      [mission.propertyId("Mission", "targetValue")]: target,
      // Keep the required action list empty before the overlay appends its reward.
      [mission.propertyId("Mission", "completeAcquireActions")]: [],
      rewardAmount: reward,
    })),
  ],
  delegatedActions: [
    { target: MissionCounter, methodName: "Advance", action: { targetActionKey: "Gs2Exchange:RateModel.Exchange", targetResource: AdvanceRateModel, parameterOverrides: [{ parameterName: "count", source: { kind: "static", value: 1 } }] } },
  ],
  masterDataResources: [
    defineMasterDataResource({
  model: GS2.exchange.Namespace,
  bindings: {
        name: Bind.static("MissionAdvance"),
        ...Bind.nulls(
          "acquireAwaitScript",
          "exchangeScript",
          "incrementalExchangeScript",
          "logSetting"
        ),
        // Auto-run executes the counter change without a second client request after the exchange.
        transactionSettingV2: transactionSettingV2(),
      },
  children: [
    AdvanceRateModel,
  ],
}),
  ],
  uiComponents: [
    defineUiComponent(MissionCounter, {
  items: [
    UiItem.buttonAction("AdvanceButton", "Advance", undefined, { name: "MissionCounter" }),
  ],
}),
    defineUiComponent(Mission, {
  items: [
    UiItem.templateLabel("BriefLabel", "Wants {target} on the counter. Pays {reward} coins.", { target: UiSource.prop("targetValue"), reward: UiSource.prop("rewardAmount") }, { name: "Mission" }),
    UiItem.buttonAction("ReceiveButton", "Receive", undefined, { name: "Mission" }),
    UiItem.templateLabel("ReceivedLabel", "Received {reward} coins.", { reward: UiSource.prop("rewardAmount") }, { name: "Mission" }),
    UiItem.activeToggle("ReceiveUnavailableActiveToggle", UiCond.or(
          UiCond.not(UiCond.truthy(UiSource.prop("completed"))),
          UiCond.truthy(UiSource.prop("received"))
        ), { name: "Mission" }),
    UiItem.activeToggle("NotReceivedActiveToggle", UiCond.not(UiCond.truthy(UiSource.prop("received"))), {
        name: "Mission",
      }),
  ],
}),
  ],
});

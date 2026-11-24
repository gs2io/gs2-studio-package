import {
  ActionProgram,
  Arg,
  Bind,
  defineActionTransform,
  defineDomainType,
  defineMasterDataResource,
  definePackage,
  defineUiComponent,
  dependencyPackage,
  instance,
  OutputMap,
  Source,
  transactionSettingV2,
  UiItem,
} from "gs2-studio-dsl";

import { GS2 } from "gs2-studio-dsl/gs2";

import serialCodeSurface from "../../dsl/dependency-surface.json";

import currencySurface from "../../../foundation-economy-currency/dsl/dependency-surface.json";

const serialCode = dependencyPackage(serialCodeSurface);

const currency = dependencyPackage(currencySurface);

const DEMO_PACKAGE_ID = "micro-liveops-serial-code-demo";

const SerialCodeCampaign = serialCode.type("SerialCodeCampaign");

const CAMPAIGN_CODE = "WELCOME2026";

const REWARD_COINS = 100;

const WALLET_SLOT = 0;

const CODE_CONFIG_KEY = "code";

const REDEMPTION = "serialcoderedemption";

const REDEMPTION_COUNTER = "redeemed";

const REDEMPTIONS_PER_VISITOR = 1;

const CountRedemptionTransform = "CountRedemption";

const ClearRedemptionTransform = "ClearRedemption";

const SerialCodeRedemption = defineDomainType("SerialCodeRedemption", {
  singleEntry: true,
  localizedDisplay: {
    ja: {
      label: "コードの引き換え",
      description: "シリアルコードの引き換えと、その回数制限です。",
    },
    en: {
      label: "Code redemption",
      description: "Redeeming a serial code, and the limit on how often.",
    },
  },
  localizedProperties: {
    id: {
      ja: { label: "コードの引き換え", description: "シリアルコードの引き換えです。" },
      en: { label: "Code redemption", description: "Redeeming a serial code." },
    },
  },
});

const RedemptionLimitModel = defineMasterDataResource({
  model: GS2.limit.LimitModel,
  mount: SerialCodeRedemption,
  bindings: {
      name: Bind.domainProperty(Source.direct(SerialCodeRedemption, "id")),
      metadata: Bind.static(""),
      resetType: Bind.static("notReset"),
      ...Bind.nulls("resetDayOfWeek", "resetDayOfMonth", "resetHour", "days", "anchorTimestamp"),
    },
});

const RedeemRateModel = defineMasterDataResource({
  model: GS2.exchange.RateModel,
  mount: SerialCodeRedemption,
  bindings: { name: Bind.domainProperty(Source.direct(SerialCodeRedemption, "id")) },
  arrayChildren: {
    consumeActions: [
      defineMasterDataResource({
  model: GS2.transaction.ConsumeAction,
  mount: SerialCodeRedemption,
  actionProgram: ActionProgram.transform(() => CountRedemption, []),
}),
      defineMasterDataResource({
  model: GS2.transaction.ConsumeAction,
  mount: SerialCodeRedemption,
  actionProgram: ActionProgram.transform(serialCode.packageId, serialCode.transformId("UseSerialCode"), [
            Arg.placeholder("code", `#{${CODE_CONFIG_KEY}}`),
          ]),
}),
    ],
    acquireActions: [
      defineMasterDataResource({
  model: GS2.transaction.AcquireAction,
  mount: SerialCodeRedemption,
  actionProgram: ActionProgram.transform(currency.packageId, currency.transformId("DepositFreeCurrency"), [
            Arg.static("slot", WALLET_SLOT),
            Arg.static("count", REWARD_COINS),
          ]),
}),
    ],
  },
});

const StartOverRateModel = defineMasterDataResource({
  model: GS2.exchange.RateModel,
  mount: SerialCodeRedemption,
  bindings: { name: Bind.domainProperty(Source.direct(SerialCodeRedemption, "id")) },
  arrayChildren: {
    acquireActions: [
      defineMasterDataResource({
  model: GS2.transaction.AcquireAction,
  mount: SerialCodeRedemption,
  actionProgram: ActionProgram.transform(() => ClearRedemption, []),
}),
    ],
  },
});

function redemptionExchange(name: string) {
  return {
    name: Bind.static(name),
    ...Bind.nulls(
      "acquireAwaitScript",
      "exchangeScript",
      "incrementalExchangeScript",
      "logSetting"
    ),
    transactionSettingV2: transactionSettingV2(),
  };
}

const CountRedemption = defineActionTransform(CountRedemptionTransform, {
  category: "consume",
  outputs: [
    {
    kind: "direct",
    actionName: "Gs2Limit:CountUpByUserId",
    resource: () => RedemptionLimitModel,
    parameterMappings: {
      namespaceName: OutputMap.resourceKey(),
      limitName: OutputMap.static(REDEMPTION),
      counterName: OutputMap.static(REDEMPTION_COUNTER),
      userId: OutputMap.placeholder("#{userId}"),
      countUpValue: OutputMap.static(1),
      maxValue: OutputMap.static(REDEMPTIONS_PER_VISITOR),
    },
  },
  ],
});

const ClearRedemption = defineActionTransform(ClearRedemptionTransform, {
  category: "acquire",
  outputs: [
    {
    kind: "direct",
    actionName: "Gs2Limit:DeleteCounterByUserId",
    resource: () => RedemptionLimitModel,
    parameterMappings: {
      namespaceName: OutputMap.resourceKey(),
      limitName: OutputMap.static(REDEMPTION),
      counterName: OutputMap.static(REDEMPTION_COUNTER),
      userId: OutputMap.placeholder("#{userId}"),
    },
  },
  ],
});

export const microLiveopsSerialCodeDemo = definePackage({
  id: DEMO_PACKAGE_ID,
  version: "0.0.1",
  display: {
    ja: {
      label: "シリアルコード（デモデータ）",
      description:
        "ライブデモ用に、キャンペーンコード 1 つと、それを 1 人 1 回だけ引き換えてコインを受け取る操作を提供します。報酬は通貨パッケージのウォレットへ入ります。",
    },
    en: {
      label: "Serial Codes (demo data)",
      description:
        "Supplies the live demo's one campaign code and the redemption that pays coins for it, once per visitor. The coins land in the currency package's wallet.",
    },
  },
  dependencies: {
    [serialCode.packageId]: "github:gs2io/gs2-studio-package",
    [currency.packageId]: "github:gs2io/gs2-studio-package",
    "foundation-economy-currency-demo": "github:gs2io/gs2-studio-package",
    "micro-shop-currency": "github:gs2io/gs2-studio-package",
  },
  domainTypes: [SerialCodeRedemption],
  instances: [
    instance(SerialCodeCampaign, CAMPAIGN_CODE, {
    [serialCode.propertyId("SerialCodeCampaign", "enableCampaignCode")]: true,
  }),
    instance(SerialCodeRedemption, REDEMPTION, {}),
  ],
  masterDataResources: [
    defineMasterDataResource({
  model: GS2.limit.Namespace,
  bindings: {
        name: Bind.static("SerialCodeLimit"),
        ...Bind.nulls("countUpScript", "logSetting"),
        transactionSettingV2: transactionSettingV2(),
      },
  children: [
    RedemptionLimitModel,
  ],
}),
    defineMasterDataResource({
  model: GS2.exchange.Namespace,
  bindings: redemptionExchange("SerialCodeRedeem"),
  children: [
    RedeemRateModel,
  ],
}),
    defineMasterDataResource({
  model: GS2.exchange.Namespace,
  bindings: redemptionExchange("SerialCodeStartOver"),
  children: [
    StartOverRateModel,
  ],
}),
  ],
  actionTransforms: [CountRedemption, ClearRedemption],
  uiComponents: [
    defineUiComponent(SerialCodeRedemption, {
  items: [
    UiItem.templateLabel("RuleLabel", `Type the campaign code ${CAMPAIGN_CODE} and redeem it for ${REWARD_COINS} coins. Each visitor can redeem it once; Start over clears your redemption so you can try again. Codes are case sensitive, and a wrong one is refused.`, {}, { name: "SerialCodeRedemption" }),
  ],
}),
  ],
});

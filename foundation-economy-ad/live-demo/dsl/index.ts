import {
  ActionProgram,
  Bind,
  defineActionTransform,
  defineMasterDataResource,
  definePackage,
  defineUiComponent,
  dependencyPackage,
  instance,
  OutputMap,
  Source,
  transactionSettingV2,
  UiItem,
  UiSource,
} from "gs2-studio-dsl";

import { GS2 } from "gs2-studio-dsl/gs2";

import adSurface from "../../dsl/dependency-surface.json";

const ad = dependencyPackage(adSurface);

const AdPlatform = ad.type("AdPlatform");

const AdViewPoint = ad.type("AdViewPoint");

const DEMO_PACKAGE_ID = "foundation-economy-ad-demo";

const AD_PLATFORM = "adplatform";

const AD_VIEW_POINT = "adviewpoint";

const UNITY_AD_KEYS = ["showroom-demo-placeholder"];

const ADMOB_AD_UNIT_IDS = ["showroom-demo-placeholder"];

const POINT_STEP = 1;

const AcquireAdViewPointTransform = "AcquireAdViewPoint";

const WatchRateModel = defineMasterDataResource({
  model: GS2.exchange.RateModel,
  mount: AdViewPoint,
  bindings: { name: Bind.domainProperty(Source.direct(AdViewPoint, "id")) },
  arrayChildren: {
    acquireActions: [
      defineMasterDataResource({
  model: GS2.transaction.AcquireAction,
  mount: AdViewPoint,
  actionProgram: ActionProgram.transform(() => AcquireAdViewPoint, []),
}),
    ],
  },
});

const SpendRateModel = defineMasterDataResource({
  model: GS2.exchange.RateModel,
  mount: AdViewPoint,
  bindings: { name: Bind.domainProperty(Source.direct(AdViewPoint, "id")) },
  arrayChildren: {
    consumeActions: [
      defineMasterDataResource({
  model: GS2.transaction.ConsumeAction,
  mount: AdViewPoint,
  actionProgram: ActionProgram.transform(ad.packageId, ad.transformId("ConsumeAdViewPoint"), []),
}),
    ],
  },
});

const AcquireAdViewPoint = defineActionTransform(AcquireAdViewPointTransform, {
  category: "acquire",
  outputs: [
    {
    kind: "direct",
    actionName: "Gs2AdReward:AcquirePointByUserId",
    resource: { kind: "external", sourcePackageId: ad.packageId, resourceKind: "masterData", resourceId: ad.resourceId("adReward.Namespace") },
    parameterMappings: {
      namespaceName: OutputMap.resourceKey(),
      userId: OutputMap.placeholder("#{userId}"),
      point: OutputMap.static(POINT_STEP),
    },
  },
  ],
});

export const foundationEconomyAdDemo = definePackage({
  id: DEMO_PACKAGE_ID,
  version: "0.0.1",
  display: {
    ja: {
      label: "広告（デモデータ）",
      description:
        "ライブデモ用の広告プラットフォーム設定と、視聴枠を得る・使う操作を提供します。実際の広告は再生しません。",
    },
    en: {
      label: "Ads (demo data)",
      description:
        "Supplies the ad platform settings used by the live demo, and the presses that earn and spend a view point. No advertisement is actually played.",
    },
  },
  dependencies: {
    [ad.packageId]: "github:gs2io/gs2-studio-package",
  },
  instances: [
    instance(AdPlatform, AD_PLATFORM, {
    [ad.propertyId("AdPlatform", "unityAdKeys")]: UNITY_AD_KEYS,
    [ad.propertyId("AdPlatform", "adMobAdUnitIds")]: ADMOB_AD_UNIT_IDS,
  }),
    instance(AdViewPoint, AD_VIEW_POINT, {}),
  ],
  delegatedActions: [
    { target: AdViewPoint, methodName: "Watch", action: { targetActionKey: "Gs2Exchange:RateModel.Exchange", targetResource: WatchRateModel, parameterOverrides: [{ parameterName: "count", source: { kind: "static", value: 1 } }] } },
    { target: AdViewPoint, methodName: "Spend", action: { targetActionKey: "Gs2Exchange:RateModel.Exchange", targetResource: SpendRateModel, parameterOverrides: [{ parameterName: "count", source: { kind: "static", value: 1 } }] } },
  ],
  masterDataResources: [
    defineMasterDataResource({
  model: GS2.exchange.Namespace,
  bindings: {
        name: Bind.static("AdWatch"),
        ...Bind.nulls(
          "acquireAwaitScript",
          "exchangeScript",
          "incrementalExchangeScript",
          "logSetting"
        ),
        // Auto-run avoids a second client request to execute the transaction after the exchange succeeds.
        transactionSettingV2: transactionSettingV2(),
      },
  children: [
    WatchRateModel,
  ],
}),
    defineMasterDataResource({
  model: GS2.exchange.Namespace,
  bindings: {
        name: Bind.static("AdSpend"),
        ...Bind.nulls(
          "acquireAwaitScript",
          "exchangeScript",
          "incrementalExchangeScript",
          "logSetting"
        ),
        transactionSettingV2: transactionSettingV2(),
      },
  children: [
    SpendRateModel,
  ],
}),
  ],
  actionTransforms: [AcquireAdViewPoint],
  uiComponents: [
    defineUiComponent(AdViewPoint, {
  items: [
    UiItem.templateLabel("BalanceLabel", "{value} view(s) banked", { value: UiSource.prop("value") }, { name: "AdViewPoint" }),
    UiItem.buttonAction("WatchButton", "Watch", undefined, { name: "AdViewPoint" }),
    UiItem.buttonAction("SpendButton", "Spend", undefined, { name: "AdViewPoint" }),
  ],
}),
  ],
});

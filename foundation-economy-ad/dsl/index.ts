import {
  Bind,
  defineActionTransform,
  defineDomainType,
  defineMasterDataResource,
  definePackage,
  defineUserDataResource,
  OutputMap,
  PT,
  Source,
  transactionSettingV2,
} from "gs2-studio-dsl";

import { GS2 } from "gs2-studio-dsl/gs2";

import { jaEnField, jaEnId } from "../../dsl/jaEnField";

const AdPlatform = defineDomainType("AdPlatform", {
  singleEntry: true,
  properties: {
    adMobAdUnitIds: PT.listOf(PT.string()).masterData(),
    unityAdKeys: PT.listOf(PT.string()).masterData().required(),
  },
  localizedDisplay: {
    ja: {
      label: "広告プラットフォーム",
      description: "AdMobとUnity Adsで利用する広告ユニットやゲームキーを設定します。",
    },
    en: {
      label: "Ad platform",
      description: "Configures the ad units and game keys used by AdMob and Unity Ads.",
    },
  },
  localizedProperties: {
      id: jaEnId("広告プラットフォーム", "ad platform"),
      adMobAdUnitIds: jaEnField(
        "AdMob広告ユニットID",
        "AdMob ad unit IDs",
        "許可するAdMob広告ユニットIDの一覧です。",
        "AdMob ad unit identifiers allowed by this configuration."
      ),
      unityAdKeys: jaEnField(
        "Unity Adsキー",
        "Unity Ads keys",
        "Unity Adsで使用するゲームキーの一覧です。",
        "Game keys used by Unity Ads."
      ),
    },
});

const AdViewPoint = defineDomainType("AdViewPoint", {
  singleEntry: true,
  properties: {
    value: PT.int64().userData().required(),
  },
  localizedDisplay: {
    ja: {
      label: "広告視聴枠",
      description: "プレイヤーが利用できる広告視聴ポイントの現在値を管理します。",
    },
    en: {
      label: "Ad view point",
      description: "Tracks the current number of ad-view points available to a player.",
    },
  },
  localizedProperties: {
      id: jaEnId("広告視聴枠", "ad view point"),
      value: jaEnField(
        "視聴可能回数",
        "Available views",
        "プレイヤーが利用できる広告視聴ポイントの現在値です。",
        "Current number of ad-view points available to the player.",
        { ja: "回", en: "views" }
      ),
    },
});

const Namespace = defineMasterDataResource({
  model: GS2.adReward.Namespace,
  mount: AdPlatform,
  bindings: {
      name: Bind.static("Ad"),
      ...Bind.nulls("acquirePointScript", "consumePointScript", "logSetting"),
      admob: {
        allowAdUnitIds: Bind.domainProperty(Source.direct(AdPlatform, "adMobAdUnitIds")),
      },
      unityAd: {
        keys: Bind.domainProperty(Source.direct(AdPlatform, "unityAdKeys")),
      },
      changePointNotification: {
        enable: Bind.static("Enabled"),
        enableTransferMobileNotification: Bind.static(false),
        gatewayNamespaceId: Bind.static("grn:gs2:{region}:{ownerId}:gateway:default"),
        sound: Bind.static(""),
      },
      transactionSettingV2: transactionSettingV2(),
    },
});

const ConsumeAdViewPointTransform = defineActionTransform("ConsumeAdViewPoint", {
  category: "consume",
  outputs: [
    {
    kind: "direct",
    actionName: "Gs2AdReward:ConsumePointByUserId",
    resource: () => Namespace,
    parameterMappings: {
      namespaceName: OutputMap.resourceKey(),
      userId: OutputMap.placeholder("#{userId}"),
      point: OutputMap.static(1),
    },
  },
  ],
});

export const foundationEconomyAd = definePackage({
  id: "foundation-economy-ad",
  version: "0.0.1",
  display: {
    ja: {
      label: "広告",
      description: "広告視聴の実績を記録し、広告経由の報酬付与に使えるポイントを管理します。",
    },
    en: {
      label: "Ads",
      description:
        "Tracks ad views and manages the points you can use to reward players for watching them.",
    },
  },
  domainTypes: [AdPlatform, AdViewPoint],
  masterDataResources: [
    Namespace,
  ],
  userDataResources: [
    defineUserDataResource({
  model: GS2.adReward.Point,
  mount: AdViewPoint,
  bindings: {
        point: Bind.domainProperties([Source.direct(AdViewPoint, "value")]),
        pointId: Bind.domainProperties([Source.direct(AdViewPoint, "id")]),
        userId: Bind.skip(),
      },
}),
  ],
  actionTransforms: [ConsumeAdViewPointTransform],
});

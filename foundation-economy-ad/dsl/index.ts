import { Bind, defineDomainType, defineMasterDataResource, definePackage, PT, Source } from "~/dsl";
import { GS2 } from "~/dsl/gs2";

import { jaEnField, jaEnId } from "../../dsl/jaEnField";

const AdPlatform = defineDomainType("AdPlatform", dt =>
  dt
    .idDescription("Unique identifier")
    .singleEntry()
    .property(PT.prop("adMobAdUnitIds", PT.listOf(PT.string())).masterData())
    .property(PT.prop("unityAdKeys", PT.listOf(PT.string())).masterData().required())
    .localizedProperties({
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
    })
);

const AdViewPoint = defineDomainType("AdViewPoint", dt =>
  dt
    .idDescription("Unique identifier")
    .singleEntry()
    .property(PT.int64("value").userData().required())
    .localizedProperties({
      id: jaEnId("広告視聴枠", "ad view point"),
      value: jaEnField(
        "視聴可能回数",
        "Available views",
        "プレイヤーが利用できる広告視聴ポイントの現在値です。",
        "Current number of ad-view points available to the player.",
        { ja: "回", en: "views" }
      ),
    })
);

const Namespace = defineMasterDataResource(resource =>
  resource
    .model(GS2.adReward.Namespace)
    .mountLocal(AdPlatform)
    .bindings({
      name: Bind.static("Ad"),
      acquirePointScript: Bind.null(),
      consumePointScript: Bind.null(),
      logSetting: Bind.null(),
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
      transactionSetting: {
        acquireActionUseJobQueue: Bind.static(false),
        commitScriptResultInUseDistributor: Bind.static(false),
        distributorNamespaceId: Bind.static("grn:gs2:{region}:{ownerId}:distributor:default"),
        enableAtomicCommit: Bind.static(false),
        enableAutoRun: Bind.static(false),
        queueNamespaceId: Bind.static("grn:gs2:{region}:{ownerId}:queue:default"),
        transactionUseDistributor: Bind.static(false),
      },
    })
);

export const foundationEconomyAd = definePackage("foundation-economy-ad", "0.0.0")
  .display({
    label: { ja: "広告", en: "Ads" },
    description: {
      ja: "広告視聴の実績を記録し、広告経由の報酬付与に使えるポイントを管理します。",
      en: "Tracks ad views and manages the points you can use to reward players for watching them.",
    },
  })
  .displayType(AdPlatform, {
    label: { ja: "広告プラットフォーム", en: "Ad platform" },
    description: {
      ja: "AdMobとUnity Adsで利用する広告ユニットやゲームキーを設定します。",
      en: "Configures the ad units and game keys used by AdMob and Unity Ads.",
    },
  })
  .displayType(AdViewPoint, {
    label: { ja: "広告視聴枠", en: "Ad view point" },
    description: {
      ja: "プレイヤーが利用できる広告視聴ポイントの現在値を管理します。",
      en: "Tracks the current number of ad-view points available to a player.",
    },
  })
  .domainType(AdPlatform)
  .domainType(AdViewPoint)

  .masterDataResource(Namespace)
  .userDataResource(r =>
    r
      .model(GS2.adReward.Point)
      .mountLocal(AdViewPoint)
      .bindings({
        point: Bind.domainProperties([Source.direct(AdViewPoint, "value")]),
        pointId: Bind.domainProperties([Source.direct(AdViewPoint, "id")]),
        userId: Bind.skip(),
      })
  )

  .actionTransform("ConsumeAdViewPoint", at =>
    at.category("consume").output("Gs2AdReward:ConsumePointByUserId", o =>
      o
        .resourceRef(() => Namespace)
        .mapResourceKey("namespaceName")
        .mapPlaceholder("userId", "#{userId}")
        .mapStatic("point", 1)
    )
  )

  .build();

/** The page simulates ad completion; the demo owns point grants because the feature package cannot decide when a view qualifies. */

import {
  Bind,
  defineMasterDataResource,
  definePackage,
  dependencyPackage,
  Source,
  transactionSetting,
} from "~/dsl";
import { GS2 } from "~/dsl/gs2";

import adSurface from "../../dsl/dependency-surface.json";

const ad = dependencyPackage(adSurface);

const AdPlatform = ad.type("AdPlatform");

const AdViewPoint = ad.type("AdViewPoint");

const DEMO_PACKAGE_ID = "foundation-economy-ad-demo";

/** Match the fixed single-entry identities used by generated handlers so they address the authored rows. */
const AD_PLATFORM = "adplatform";
const AD_VIEW_POINT = "adviewpoint";

/** Use explicit placeholders because this simulated ad flow does not authenticate a network SDK. */
const UNITY_AD_KEYS = ["showroom-demo-placeholder"];
const ADMOB_AD_UNIT_IDS = ["showroom-demo-placeholder"];

const POINT_STEP = 1;

const AcquireAdViewPointTransform = "AcquireAdViewPoint";

/** Keep watch and spend in separate namespaces because both rates derive the same name from AdViewPoint. */
const WatchRateModel = defineMasterDataResource(resource =>
  resource
    .model(GS2.exchange.RateModel)
    .mountLocal(AdViewPoint)
    .bindings({ name: Bind.domainProperty(Source.direct(AdViewPoint, "id")) })
    .addArrayChild("acquireActions", acquireAction => {
      acquireAction
        .model(GS2.transaction.AcquireAction)
        .mountLocal(AdViewPoint)
        .bindings({
          action: Bind.transform(DEMO_PACKAGE_ID, AcquireAdViewPointTransform, []),
        });
    })
);

/** Omit a reward payload so this action demonstrates consumption of the point alone. */
const SpendRateModel = defineMasterDataResource(resource =>
  resource
    .model(GS2.exchange.RateModel)
    .mountLocal(AdViewPoint)
    .bindings({ name: Bind.domainProperty(Source.direct(AdViewPoint, "id")) })
    .addArrayChild("consumeActions", consumeAction => {
      consumeAction
        .model(GS2.transaction.ConsumeAction)
        .mountLocal(AdViewPoint)
        .bindings({
          action: Bind.transform(ad.packageId, "ConsumeAdViewPoint", []),
        });
    })
);

export const foundationEconomyAdDemo = definePackage(DEMO_PACKAGE_ID, "0.0.0")
  .display({
    label: { ja: "広告（デモデータ）", en: "Ads (demo data)" },
    description: {
      ja: "ライブデモ用の広告プラットフォーム設定と、視聴枠を得る・使う操作を提供します。実際の広告は再生しません。",
      en: "Supplies the ad platform settings used by the live demo, and the presses that earn and spend a view point. No advertisement is actually played.",
    },
  })
  .dependency(ad.packageId, "github:gs2io/gs2-studio-package")

  /** Use the published resource identity because this DSL evaluation does not load the dependency's resource handles. */
  .actionTransform(AcquireAdViewPointTransform, actionTransform =>
    actionTransform
      .category("acquire")
      .output("Gs2AdReward:AcquirePointByUserId", output =>
        output
          .externalResourceRef(ad.packageId, "masterData", ad.resourceId("adReward.Namespace"))
          .mapResourceKey("namespaceName")
          .mapPlaceholder("userId", "#{userId}")
          .mapStatic("point", POINT_STEP)
      )
  )

  // Populate both platform lists so the authored AdMob configuration does not contain a missing allow-list.
  .instance(AdPlatform, AD_PLATFORM, {
    [ad.propertyId("AdPlatform", "unityAdKeys")]: UNITY_AD_KEYS,
    [ad.propertyId("AdPlatform", "adMobAdUnitIds")]: ADMOB_AD_UNIT_IDS,
  })

  // Author the otherwise empty balance row because it supplies the identity used by both exchange rates.
  .instance(AdViewPoint, AD_VIEW_POINT, {})

  .masterDataResource(resource =>
    resource
      .model(GS2.exchange.Namespace)
      .bindings({
        name: Bind.static("AdWatch"),
        ...Bind.nulls(
          "acquireAwaitScript",
          "exchangeScript",
          "incrementalExchangeScript",
          "logSetting"
        ),
        // Auto-run avoids a second client request to execute the transaction after the exchange succeeds.
        transactionSetting: transactionSetting({
          enableAtomicCommit: Bind.static(true),
          enableAutoRun: Bind.static(true),
        }),
      })
      .addChild(WatchRateModel)
  )

  .masterDataResource(resource =>
    resource
      .model(GS2.exchange.Namespace)
      .bindings({
        name: Bind.static("AdSpend"),
        ...Bind.nulls(
          "acquireAwaitScript",
          "exchangeScript",
          "incrementalExchangeScript",
          "logSetting"
        ),
        transactionSetting: transactionSetting({
          enableAtomicCommit: Bind.static(true),
          enableAutoRun: Bind.static(true),
        }),
      })
      .addChild(SpendRateModel)
  )

  .uiComponent(AdViewPoint, ui =>
    ui
      .templateLabel(
        "BalanceLabel",
        "{value} view(s) banked",
        { value: ui.prop("value") },
        { name: "AdViewPoint" }
      )
      .buttonAction("WatchButton", "Watch", undefined, { name: "AdViewPoint" })
      .buttonAction("SpendButton", "Spend", undefined, { name: "AdViewPoint" })
  )

  .delegatedAction(AdViewPoint, "Watch", {
    targetActionKey: "Gs2Exchange:RateModel.Exchange",
    targetResource: WatchRateModel,
    parameterOverrides: [{ kind: "static", parameterName: "count", value: 1 }],
  })
  .delegatedAction(AdViewPoint, "Spend", {
    targetActionKey: "Gs2Exchange:RateModel.Exchange",
    targetResource: SpendRateModel,
    parameterOverrides: [{ kind: "static", parameterName: "count", value: 1 }],
  })
  .build();

/**
 * Live demo content for `foundation-economy-ad`.
 *
 * The feature package keeps a per-player count of how many ad-backed rewards
 * are owed, and ships the half that spends it. What it does not ship is the
 * half that earns it, because when a view counts is a title's decision —
 * a rewarded placement at the end of a run, a daily cap, an offer wall.
 * So the demo supplies the earning side, the one row that holds the count,
 * and the two presses that move it.
 *
 * **No advertisement is played here, and none could be.** The showroom runs
 * as a WebGL player, and the ad networks GS2 accepts do not reach it: Unity
 * Ads supports iOS and Android only, as does the LevelPlay mediation that
 * replaced it, and AdMob is mobile-only too. There is no browser build of
 * either to call. So the Watch button does the one part that is not the SDK's:
 * it tells GS2 a view was completed and asks for the point.
 *
 * That split is the shape of the API, not a shortcut taken here.
 * `Gs2AdReward:AcquirePointByUserId` takes a namespace, a user and a number of
 * points, and verifies nothing; there is no client-callable form of it either.
 * Deciding that a view really happened belongs to the title — it is what the
 * SDK's completion callback, and whatever server-side receipt a title trusts,
 * are for — and GS2's job starts once that decision has been made. This demo
 * stands exactly where a title would put that decision, with the decision
 * missing. Everything below the button is real.
 */

import {
  Arg,
  Bind,
  defineMasterDataResource,
  definePackage,
  dependencyPackage,
  Source,
  transactionSetting,
} from "~/dsl";
import { GS2 } from "~/dsl/gs2";

import adSurface from "../../dsl/dependency-surface.json";

// Materialization publishes the feature package's identities, so everything
// below is addressed by name; a typo is a compile error rather than an id that
// resolves to nothing.
const ad = dependencyPackage(adSurface);

/** The ad configuration a title deploys: which SDKs and keys GS2 accepts. */
const AdPlatform = ad.type("AdPlatform");

/** What a player has earned and not yet spent. */
const AdViewPoint = ad.type("AdViewPoint");

/**
 * This package's own id, spelled once.
 *
 * The earning transform below is declared here rather than in the feature
 * package, so the binding that invokes it names this package. A transform is
 * resolved against the invoking package's dependency closure, root inclusive,
 * so a package can call its own.
 */
const DEMO_PACKAGE_ID = "foundation-economy-ad-demo";

/**
 * A singleEntry type's instance id has to be the type name in lower case: the
 * generated handler hard-codes that string when it mounts, while the master
 * data is named from the id authored here. A mismatch deploys cleanly and
 * fails at run time with a name nothing answers to.
 */
const AD_PLATFORM = "adplatform";
const AD_VIEW_POINT = "adviewpoint";

/**
 * Keys GS2 checks a view claim against. This demo never reaches an ad SDK, so
 * nothing is ever matched against these — they are spelled as placeholders so
 * nobody mistakes them for credentials worth copying.
 */
const UNITY_AD_KEYS = ["showroom-demo-placeholder"];
const ADMOB_AD_UNIT_IDS = ["showroom-demo-placeholder"];

/** One completed view is worth one point, and one reward costs one point. */
const POINT_STEP = 1;

/**
 * Earning a point, modelled as an exchange that costs nothing.
 *
 * The action this produces is not something the feature package declares: it
 * ships `ConsumeAdViewPoint` and no counterpart, because granting a point is
 * the moment a title decides an ad "counted" and belongs with the title. A
 * package may declare its own transforms, and an output may point at a
 * resource its dependency owns through `externalResourceRef` — which is what
 * `Gs2AdReward:AcquirePointByUserId` needs, since the namespace name it takes
 * is a key on the ad package's `Namespace`.
 */
const AcquireAdViewPointTransform = "AcquireAdViewPoint";

/**
 * Watching: the press that grants the point.
 *
 * The rate is named after the point row because a delegated action on
 * `AdViewPoint` must target a resource that mounts `AdViewPoint` — that is how
 * the generated loader learns which rate to exchange.
 *
 * It lives under its own exchange namespace because `SpendRateModel` names its
 * row the same way; sharing a namespace collides the `rateModels` array on its
 * primary key and drops the whole `CurrentRateMaster` from the template.
 */
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

/**
 * Spending: the mirror press, and the one the feature package already had.
 *
 * A reward normally comes with it — a title hands over currency, or an extra
 * run. The demo grants nothing, so what the page shows is the point going
 * away, which is the part this package owns.
 */
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

  /**
   * Granting a point for a completed view.
   *
   * `Gs2AdReward:AcquirePointByUserId` is keyed by the ad namespace, which the
   * feature package owns, so the output names it through `externalResourceRef`
   * and reads the name off it with `mapResourceKey`. The dependency closure is
   * not loaded while this file compiles, which is why the resource is
   * addressed by the id its published surface carries rather than by a handle.
   */
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

  // The ad configuration. Both lists are authored: `allowAdUnitIds` is
  // required inside the AdMob block, so leaving the property unset would
  // deploy a block with a null in a slot GS2 requires.
  .instance(AdPlatform, AD_PLATFORM, {
    [ad.propertyId("AdPlatform", "unityAdKeys")]: UNITY_AD_KEYS,
    [ad.propertyId("AdPlatform", "adMobAdUnitIds")]: ADMOB_AD_UNIT_IDS,
  })

  // The count itself. It has no master data — a balance is something a player
  // has run up — but naming it here is what lets both rates be named after it,
  // and what gives the page a row to press.
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
        // The demo runs the transaction server-side and commits it atomically.
        // With auto-run off, `Exchange` only hands back a stamp sheet the
        // client has to execute through the distributor — an extra round trip
        // that can leave a view counted but unpaid if the page is closed
        // mid-way.
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

  // The feature package ships no UI: what a title shows of an ad balance is
  // the title's decision. So the demo supplies both the reading and the
  // presses.
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

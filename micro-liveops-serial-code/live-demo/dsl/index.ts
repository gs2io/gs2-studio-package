/**
 * Live demo content for `micro-liveops-serial-code`.
 *
 * A visitor types a campaign code, and coins land in their wallet; typing it
 * again is refused. A wrong code is refused too, and the page says why.
 *
 * The feature package is the campaign. This package adds the one campaign,
 * whose id is the code, and what redeeming it does.
 *
 * **Redeeming is an exchange.** GS2 pays nothing for a code by itself, so the
 * page redeems through a free exchange whose transaction uses the code, counts
 * the redemption and deposits the coins, all or nothing. The code the visitor
 * typed reaches the transaction as the exchange's `code` config.
 *
 * **Once per visitor is this demo's own rule.** GS2 accepts a campaign's code
 * from everyone, any number of times, and records nothing when it is used. So
 * the exchange also counts the redemption on a usage limit of this demo's own,
 * capped at one, and the second try fails on that count. The limit is its own
 * namespace rather than the usage-limit package's, whose stack other demos
 * deploy. Start over is another free exchange, whose acquire action deletes
 * the count, so a visitor can see the whole round again.
 *
 * **Typing is the page's.** A showroom row reads a value or makes a press, so
 * the input field, and the presses beside it, are a hand-written Unity panel.
 *
 * The wallet is another package's and is installed beside this one rather than
 * written out again: its rows live in stacks every demo holding them deploys,
 * and a second author of them would be a second version, and the last deploy
 * would win.
 */

import {
  Arg,
  Bind,
  defineDomainType,
  defineMasterDataResource,
  definePackage,
  dependencyPackage,
  Source,
  transactionSetting,
} from "~/dsl";
import { GS2 } from "~/dsl/gs2";

import serialCodeSurface from "../../dsl/dependency-surface.json";
import currencySurface from "../../../foundation-economy-currency/dsl/dependency-surface.json";

const serialCode = dependencyPackage(serialCodeSurface);
const currency = dependencyPackage(currencySurface);

const DEMO_PACKAGE_ID = "micro-liveops-serial-code-demo";

const SerialCodeCampaign = serialCode.type("SerialCodeCampaign");

/** The campaign, whose id is the code a visitor types. GS2 matches it exactly. */
const CAMPAIGN_CODE = "WELCOME2026";

/** What redeeming the code pays, into the wallet the page shows. */
const REWARD_COINS = 100;
const WALLET_SLOT = 0;

/** The config key the typed code travels under, from the page to the transaction. */
const CODE_CONFIG_KEY = "code";

/**
 * The redemption's one row, which also names the usage limit it is counted
 * on: a single-entry type's row is named after the type.
 */
const REDEMPTION = "serialcoderedemption";

/** The counter the redemption is counted on, and how many a visitor gets. */
const REDEMPTION_COUNTER = "redeemed";
const REDEMPTIONS_PER_VISITOR = 1;

/** The transform that counts one redemption against this demo's limit. */
const CountRedemptionTransform = "CountRedemption";

/** The transform that clears the visitor's redemption, so they can redeem again. */
const ClearRedemptionTransform = "ClearRedemption";

/**
 * The redemption: what the redeem rate and the usage limit are mounted on,
 * and what the page's rule hangs from.
 */
const SerialCodeRedemption = defineDomainType("SerialCodeRedemption", dt =>
  dt.singleEntry().localizedProperties({
    id: {
      ja: { label: "コードの引き換え", description: "シリアルコードの引き換えです。" },
      en: { label: "Code redemption", description: "Redeeming a serial code." },
    },
  })
);

/** The usage limit the redemptions are counted on. It never resets. */
const RedemptionLimitModel = defineMasterDataResource(resource =>
  resource
    .model(GS2.limit.LimitModel)
    .mountLocal(SerialCodeRedemption)
    .bindings({
      name: Bind.domainProperty(Source.direct(SerialCodeRedemption, "id")),
      metadata: Bind.static(""),
      resetType: Bind.static("notReset"),
      ...Bind.nulls("resetDayOfWeek", "resetDayOfMonth", "resetHour", "days", "anchorTimestamp"),
    })
);

/**
 * Redeeming, modelled as an exchange that costs the code: the consume actions
 * count the redemption and use the typed code, the acquire action pays. The
 * code is a placeholder, filled from the exchange's `code` config.
 */
const RedeemRateModel = defineMasterDataResource(resource =>
  resource
    .model(GS2.exchange.RateModel)
    .mountLocal(SerialCodeRedemption)
    .bindings({ name: Bind.domainProperty(Source.direct(SerialCodeRedemption, "id")) })
    .addArrayChild("consumeActions", consumeAction => {
      consumeAction
        .model(GS2.transaction.ConsumeAction)
        .mountLocal(SerialCodeRedemption)
        .bindings({
          action: Bind.transform(DEMO_PACKAGE_ID, CountRedemptionTransform, []),
        });
    })
    .addArrayChild("consumeActions", consumeAction => {
      consumeAction
        .model(GS2.transaction.ConsumeAction)
        .mountLocal(SerialCodeRedemption)
        .bindings({
          action: Bind.transform(serialCode.packageId, "UseSerialCode", [
            Arg.placeholder("code", `#{${CODE_CONFIG_KEY}}`),
          ]),
        });
    })
    .addArrayChild("acquireActions", acquireAction => {
      acquireAction
        .model(GS2.transaction.AcquireAction)
        .mountLocal(SerialCodeRedemption)
        .bindings({
          action: Bind.transform(currency.packageId, "DepositFreeCurrency", [
            Arg.static("slot", WALLET_SLOT),
            Arg.static("count", REWARD_COINS),
          ]),
        });
    })
);

/**
 * Starting over, modelled as an exchange that costs nothing: the acquire
 * action deletes the visitor's redemption counter. A client may not delete a
 * counter itself. The rate is named after the redemption, like the redeem
 * rate, so it lives in an exchange namespace of its own.
 */
const StartOverRateModel = defineMasterDataResource(resource =>
  resource
    .model(GS2.exchange.RateModel)
    .mountLocal(SerialCodeRedemption)
    .bindings({ name: Bind.domainProperty(Source.direct(SerialCodeRedemption, "id")) })
    .addArrayChild("acquireActions", acquireAction => {
      acquireAction
        .model(GS2.transaction.AcquireAction)
        .mountLocal(SerialCodeRedemption)
        .bindings({
          action: Bind.transform(DEMO_PACKAGE_ID, ClearRedemptionTransform, []),
        });
    })
);

/**
 * One exchange namespace per press: both rates are named after the
 * redemption, and sharing a namespace would collide them on their primary
 * key. Both run and commit server-side, so a refused code or a second try
 * leaves nothing behind: with atomic commit off, the redemption could be
 * counted and the coins never paid.
 */
function redemptionExchange(name: string) {
  return {
    name: Bind.static(name),
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
  };
}

export const microLiveopsSerialCodeDemo = definePackage(DEMO_PACKAGE_ID, "0.0.0")
  .display({
    label: { ja: "シリアルコード（デモデータ）", en: "Serial Codes (demo data)" },
    description: {
      ja: "ライブデモ用に、キャンペーンコード 1 つと、それを 1 人 1 回だけ引き換えてコインを受け取る操作を提供します。報酬は通貨パッケージのウォレットへ入ります。",
      en: "Supplies the live demo's one campaign code and the redemption that pays coins for it, once per visitor. The coins land in the currency package's wallet.",
    },
  })
  .displayType(SerialCodeRedemption, {
    label: { ja: "コードの引き換え", en: "Code redemption" },
    description: {
      ja: "シリアルコードの引き換えと、その回数制限です。",
      en: "Redeeming a serial code, and the limit on how often.",
    },
  })
  .dependency(serialCode.packageId, "github:gs2io/gs2-studio-package")
  // Where the coins pay.
  .dependency(currency.packageId, "github:gs2io/gs2-studio-package")
  .dependency("foundation-economy-currency-demo", "github:gs2io/gs2-studio-package")
  // The currency demo stocks the currency shop's price table, and an install
  // does not walk a package's own dependencies, so the shop is named too.
  .dependency("micro-shop-currency", "github:gs2io/gs2-studio-package")

  .domainType(SerialCodeRedemption)

  /**
   * Counting one redemption. The counter is capped at one, so a second
   * redemption by the same visitor fails here and the whole exchange with it.
   */
  .actionTransform(CountRedemptionTransform, actionTransform =>
    actionTransform.category("consume").output("Gs2Limit:CountUpByUserId", output =>
      output
        .resourceRef(() => RedemptionLimitModel)
        .mapResourceKey("namespaceName")
        // The limit's name comes from the row's id, which a resource key
        // cannot read, so it is named here.
        .mapStatic("limitName", REDEMPTION)
        .mapStatic("counterName", REDEMPTION_COUNTER)
        .mapPlaceholder("userId", "#{userId}")
        .mapStatic("countUpValue", 1)
        .mapStatic("maxValue", REDEMPTIONS_PER_VISITOR)
    )
  )

  /** Clearing the visitor's redemption: the counter is deleted, and counts from zero again. */
  .actionTransform(ClearRedemptionTransform, actionTransform =>
    actionTransform.category("acquire").output("Gs2Limit:DeleteCounterByUserId", output =>
      output
        .resourceRef(() => RedemptionLimitModel)
        .mapResourceKey("namespaceName")
        .mapStatic("limitName", REDEMPTION)
        .mapStatic("counterName", REDEMPTION_COUNTER)
        .mapPlaceholder("userId", "#{userId}")
    )
  )

  // The campaign whose id is the code.
  .instance(SerialCodeCampaign, CAMPAIGN_CODE, {
    [serialCode.propertyId("SerialCodeCampaign", "enableCampaignCode")]: true,
  })
  .instance(SerialCodeRedemption, REDEMPTION, {})

  .masterDataResource(resource =>
    resource
      .model(GS2.limit.Namespace)
      .bindings({
        name: Bind.static("SerialCodeLimit"),
        ...Bind.nulls("countUpScript", "logSetting"),
        transactionSetting: transactionSetting(),
      })
      .addChild(RedemptionLimitModel)
  )

  .masterDataResource(resource =>
    resource
      .model(GS2.exchange.Namespace)
      .bindings(redemptionExchange("SerialCodeRedeem"))
      .addChild(RedeemRateModel)
  )
  .masterDataResource(resource =>
    resource
      .model(GS2.exchange.Namespace)
      .bindings(redemptionExchange("SerialCodeStartOver"))
      .addChild(StartOverRateModel)
  )

  // The feature package ships no components: what a title shows of a code is
  // the title's decision.
  .uiComponent(SerialCodeRedemption, ui =>
    ui.templateLabel(
      "RuleLabel",
      `Type the campaign code ${CAMPAIGN_CODE} and redeem it for ${REWARD_COINS} coins. Each visitor can redeem it once; Start over clears your redemption so you can try again. Codes are case sensitive, and a wrong one is refused.`,
      {},
      { name: "SerialCodeRedemption" }
    )
  )
  .build();

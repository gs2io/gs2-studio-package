/**
 * Live demo overrides and content for `foundation-economy-currency`.
 *
 * The feature package ships settings meant for a real title. A public browser
 * demo needs a few of them relaxed, and it needs something a visitor can
 * actually press. Both belong here rather than in the shipped package: this
 * package depends on the feature package and adds only what the demo needs.
 */

import {
  Arg,
  Bind,
  defineDomainType,
  defineMasterDataResource,
  defineOverlayDomainType,
  definePackage,
  dependencyPackage,
  PT,
  Source,
  transactionSetting,
} from "~/dsl";
import { GS2 } from "~/dsl/gs2";

import currencySurface from "../../dsl/dependency-surface.json";

// Materialization publishes the feature package's identities, so everything
// inherited from it is addressed by name; a typo is a compile error rather
// than an id that resolves to nothing.
const currency = dependencyPackage(currencySurface);
const CURRENCY_PACKAGE_ID = currency.packageId;

/** The demo shows one player with one wallet, slot 0. */
const WALLET_SLOT = 0;

/**
 * The store's `enableFakeReceipt` drives the Money2 namespace's
 * `platformSetting.fake.acceptFakeReceipt` binding. A browser demo cannot
 * complete a real store purchase, so the demo accepts the fake receipt the
 * client sends; the feature package keeps rejecting it.
 */
const CurrencyStore = defineOverlayDomainType(
  "CurrencyStore",
  currency.overlay("CurrencyStore"),
  domainType => domainType
);

/**
 * The feature package defines the store product type but ships no products —
 * a title supplies its own. The demo needs something on the shelf.
 */
const StoreProduct = defineOverlayDomainType(
  "StoreProduct",
  currency.overlay("StoreProduct"),
  domainType => domainType
);

/**
 * Money2 keeps two balances: currency granted for free and currency the player
 * paid for. The demo offers one deposit of each so a visitor can see which
 * balance moves.
 */
function depositType(name: string, label: string, description: string) {
  return defineDomainType(name, domainType =>
    domainType
      .singleEntry()
      .property(PT.int32("count").masterData().required())
      .localizedProperties({
        id: { en: { label, description } },
        count: { en: { label: "Amount", description: "How much this deposit adds." } },
      })
  );
}

const FreeDeposit = depositType(
  "FreeDeposit",
  "Free deposit",
  "Adds currency to the free balance, the way a reward would."
);

const PaidDeposit = depositType(
  "PaidDeposit",
  "Paid deposit",
  "Adds currency to the paid balance, the way a purchase would."
);

/** An exchange rate that costs nothing and deposits into the free balance. */
const FreeDepositRateModel = defineMasterDataResource(resource =>
  resource
    .model(GS2.exchange.RateModel)
    .mountLocal(FreeDeposit)
    .bindings({
      name: Bind.domainProperty(Source.direct(FreeDeposit, "id")),
    })
    .addArrayChild("acquireActions", acquireAction => {
      acquireAction
        .model(GS2.transaction.AcquireAction)
        .mountLocal(FreeDeposit)
        .bindings({
          action: Bind.transform(CURRENCY_PACKAGE_ID, "DepositFreeCurrency", [
            Arg.domainProperty("count", Source.parent(Source.direct(FreeDeposit, "count"))),
            // The demo shows one player with one wallet.
            Arg.static("slot", WALLET_SLOT),
          ]),
        });
    })
);

/**
 * The same shape, but through `DepositCurrency`: a price and a currency code
 * are what make Money2 record the deposit against the paid balance.
 */
const PaidDepositRateModel = defineMasterDataResource(resource =>
  resource
    .model(GS2.exchange.RateModel)
    .mountLocal(PaidDeposit)
    .bindings({
      name: Bind.domainProperty(Source.direct(PaidDeposit, "id")),
    })
    .addArrayChild("acquireActions", acquireAction => {
      acquireAction
        .model(GS2.transaction.AcquireAction)
        .mountLocal(PaidDeposit)
        .bindings({
          action: Bind.transform(CURRENCY_PACKAGE_ID, "DepositCurrency", [
            Arg.domainProperty("count", Source.parent(Source.direct(PaidDeposit, "count"))),
            Arg.static("currencyType", "JPY"),
            Arg.static("price", 120),
            Arg.static("slot", WALLET_SLOT),
          ]),
        });
    })
);

/** Store-side identifiers are never consumed by the fake-receipt demo path. */
function demoProduct(productId: string): Record<string, string> {
  return {
    [currency.propertyId("StoreProduct", "appleAppStoreProductId")]: productId,
    [currency.propertyId("StoreProduct", "googlePlayProductId")]: productId,
  };
}

export const foundationEconomyCurrencyDemo = definePackage(
  "foundation-economy-currency-demo",
  "0.0.0"
)
  .display({
    label: { ja: "通貨（デモ）", en: "Currency (demo)" },
    description: {
      ja: "ライブデモ用の設定上書きと無償付与を提供します。",
      en: "Supplies the live demo's setting overrides and its free currency grants.",
    },
  })
  .displayType(FreeDeposit, {
    label: { ja: "無償付与", en: "Free deposit" },
    description: {
      ja: "無償残高に加算されるデモ用の入金です。",
      en: "A demo deposit that lands in the free balance.",
    },
  })
  .displayType(PaidDeposit, {
    label: { ja: "有償付与", en: "Paid deposit" },
    description: {
      ja: "有償残高に加算されるデモ用の入金です。",
      en: "A demo deposit that lands in the paid balance.",
    },
  })
  .dependency(CURRENCY_PACKAGE_ID, "github:gs2io/gs2-studio-package")
  .domainType(CurrencyStore)
  .domainType(StoreProduct)
  .domainType(FreeDeposit)
  .domainType(PaidDeposit)

  .instance("CurrencyStore", "currencystore", {
    [currency.propertyId("CurrencyStore", "enableFakeReceipt")]: "Accept",
  })

  .instance("StoreProduct", "coin_small", demoProduct("io.gs2.demo.coin.small"))
  .instance("StoreProduct", "coin_medium", demoProduct("io.gs2.demo.coin.medium"))
  .instance("StoreProduct", "coin_large", demoProduct("io.gs2.demo.coin.large"))

  .instance("FreeDeposit", "freedeposit", { count: 100 })
  .instance("PaidDeposit", "paiddeposit", { count: 50 })

  .masterDataResource(resource =>
    resource
      .model(GS2.exchange.Namespace)
      .bindings({
        name: Bind.static("CurrencyGrant"),
        ...Bind.nulls(
          "acquireAwaitScript",
          "exchangeScript",
          "incrementalExchangeScript",
          "logSetting"
        ),
        // The demo runs transactions server-side and commits them atomically.
        // With auto-run off, `Exchange` only hands back a stamp sheet that the
        // client has to execute through the distributor — an extra round trip
        // that can leave a deposit half-applied if the page is closed mid-way.
        transactionSetting: transactionSetting({
          enableAtomicCommit: Bind.static(true),
          enableAutoRun: Bind.static(true),
        }),
      })
      .addChild(FreeDepositRateModel)
      .addChild(PaidDepositRateModel)
  )

  // The caption writes the amount the deployed master data actually holds, and
  // the button performs the deposit. Both are generated components a scene
  // wires in the Inspector, which is the whole point of the demo: nothing here
  // needs a script of its own.
  .uiComponent(FreeDeposit, ui =>
    ui
      .templateLabel(
        "CountLabel",
        "Deposit {count} free",
        { count: ui.prop("count") },
        { name: "FreeDeposit" }
      )
      .buttonAction("DepositButton", "Deposit", undefined, { name: "FreeDeposit" })
  )
  .uiComponent(PaidDeposit, ui =>
    ui
      .templateLabel(
        "CountLabel",
        "Deposit {count} paid",
        { count: ui.prop("count") },
        { name: "PaidDeposit" }
      )
      .buttonAction("DepositButton", "Deposit", undefined, { name: "PaidDeposit" })
  )

  .delegatedAction(FreeDeposit, "Deposit", {
    targetActionKey: "Gs2Exchange:RateModel.Exchange",
    targetResource: FreeDepositRateModel,
    parameterOverrides: [{ kind: "static", parameterName: "count", value: 1 }],
  })
  .delegatedAction(PaidDeposit, "Deposit", {
    targetActionKey: "Gs2Exchange:RateModel.Exchange",
    targetResource: PaidDepositRateModel,
    parameterOverrides: [{ kind: "static", parameterName: "count", value: 1 }],
  })
  .build();

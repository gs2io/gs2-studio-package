import {
  Arg,
  Bind,
  defineDomainType,
  defineMasterDataResource,
  definePackage,
  dependencyPackage,
  PT,
  Source,
  transactionSetting,
} from "~/dsl";
import { GS2 } from "~/dsl/gs2";

import currencySurface from "../../dsl/dependency-surface.json";
import shopSurface from "../../../micro-shop-currency/dsl/dependency-surface.json";

const currency = dependencyPackage(currencySurface);
const CURRENCY_PACKAGE_ID = currency.packageId;
const shop = dependencyPackage(shopSurface);

const WALLET_SLOT = 0;

/** Enable fake receipts only in demo content so a browser can exercise purchases without changing the feature defaults. */
const CurrencyStore = currency.type("CurrencyStore");

/** Author the shared shelf here so wallet and shop demos deploy identical products and prices into their dependency stacks. */
const StoreProduct = currency.type("StoreProduct");

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
            Arg.static("slot", WALLET_SLOT),
          ]),
        });
    })
);

/** Include price and currency code so this deposit exercises the paid balance separately from the free deposit. */
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

function demoProduct(
  productId: string,
  count: number,
  prices: { readonly JPY: number; readonly USD: number; readonly XXX: number }
) {
  return {
    [currency.propertyId("StoreProduct", "appleAppStoreProductId")]: productId,
    [currency.propertyId("StoreProduct", "googlePlayProductId")]: productId,
    [shop.propertyId("StoreProduct", "count")]: count,
    [shop.propertyId("StoreProduct", "prices")]: shop.inlineElements("StoreProduct", "prices", [
      { currencyType: "JPY", price: prices.JPY },
      { currencyType: "USD", price: prices.USD },
      { currencyType: "XXX", price: prices.XXX },
    ]),
  };
}

export const foundationEconomyCurrencyDemo = definePackage(
  "foundation-economy-currency-demo",
  "0.0.0"
)
  .display({
    label: { ja: "通貨（デモデータ）", en: "Currency (demo data)" },
    description: {
      ja: "ライブデモ用の設定上書き、無償付与、全デモ共通の商品棚と価格を提供します。",
      en: "Supplies the live demo's setting overrides, its free currency grants, and the store shelf and prices every demo shares.",
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
  .dependency(shop.packageId, "github:gs2io/gs2-studio-package")
  .domainType(FreeDeposit)
  .domainType(PaidDeposit)

  .instance(CurrencyStore, "currencystore", {
    [currency.propertyId("CurrencyStore", "enableFakeReceipt")]: "Accept",
  })

  .instance(
    StoreProduct,
    "coin_small",
    demoProduct("io.gs2.demo.coin.small", 10, { JPY: 100, USD: 1, XXX: 1 })
  )
  .instance(
    StoreProduct,
    "coin_medium",
    demoProduct("io.gs2.demo.coin.medium", 50, { JPY: 200, USD: 2, XXX: 2 })
  )
  .instance(
    StoreProduct,
    "coin_large",
    demoProduct("io.gs2.demo.coin.large", 250, { JPY: 300, USD: 3, XXX: 3 })
  )

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
        // Auto-run executes the deposit without requiring a second client request after the exchange.
        transactionSetting: transactionSetting({
          enableAtomicCommit: Bind.static(true),
          enableAutoRun: Bind.static(true),
        }),
      })
      .addChild(FreeDepositRateModel)
      .addChild(PaidDepositRateModel)
  )

  .uiComponent(FreeDeposit, ui =>
    ui
      .templateLabel(
        "CountLabel",
        "Deposit {count} free coins",
        { count: ui.prop("count") },
        { name: "FreeDeposit" }
      )
      .buttonAction("DepositButton", "Deposit", undefined, { name: "FreeDeposit" })
  )
  .uiComponent(PaidDeposit, ui =>
    ui
      .templateLabel(
        "CountLabel",
        "Deposit {count} paid coins",
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

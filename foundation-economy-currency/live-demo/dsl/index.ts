import {
  ActionProgram,
  Arg,
  Bind,
  defineDomainType,
  defineMasterDataResource,
  definePackage,
  defineUiComponent,
  dependencyPackage,
  instance,
  PT,
  Source,
  transactionSettingV2,
  UiItem,
  UiSource,
} from "gs2-studio-dsl";

import { liveDemoDependencies } from "../../../dsl/liveDemoDependencies";

import { GS2 } from "gs2-studio-dsl/gs2";

import currencySurface from "../../dsl/dependency-surface.json";

import shopSurface from "../../../micro-shop-currency/dsl/dependency-surface.json";

const currency = dependencyPackage(currencySurface);

const CURRENCY_PACKAGE_ID = currency.packageId;

const shop = dependencyPackage(shopSurface);

const WALLET_SLOT = 0;

const CurrencyStore = currency.type("CurrencyStore");

const StoreProduct = currency.type("StoreProduct");

function depositType(
  name: string,
  label: string,
  description: string,
  localizedDisplay: {
    readonly ja: { readonly label: string; readonly description: string };
    readonly en: { readonly label: string; readonly description: string };
  }
) {
  return defineDomainType(name, {
    singleEntry: true,
    properties: {
      count: PT.int32().masterData().required(),
    },
    localizedDisplay,
    localizedProperties: {
      id: { en: { label, description } },
      count: { en: { label: "Amount", description: "How much this deposit adds." } },
    },
  });
}

const FreeDeposit = depositType(
  "FreeDeposit",
  "Free deposit",
  "Adds currency to the free balance, the way a reward would.",
  {
    ja: { label: "無償付与", description: "無償残高に加算されるデモ用の入金です。" },
    en: { label: "Free deposit", description: "A demo deposit that lands in the free balance." },
  }
);

const PaidDeposit = depositType(
  "PaidDeposit",
  "Paid deposit",
  "Adds currency to the paid balance, the way a purchase would.",
  {
    ja: { label: "有償付与", description: "有償残高に加算されるデモ用の入金です。" },
    en: { label: "Paid deposit", description: "A demo deposit that lands in the paid balance." },
  }
);

const FreeDepositRateModel = defineMasterDataResource({
  model: GS2.exchange.RateModel,
  mount: FreeDeposit,
  bindings: {
      name: Bind.domainProperty(Source.direct(FreeDeposit, "id")),
    },
  arrayChildren: {
    acquireActions: [
      defineMasterDataResource({
  model: GS2.transaction.AcquireAction,
  mount: FreeDeposit,
  actionProgram: ActionProgram.transform(
            CURRENCY_PACKAGE_ID,
            currency.transformId("DepositFreeCurrency"),
            [
              Arg.domainProperty("count", Source.parent(Source.direct(FreeDeposit, "count"))),
              Arg.static("slot", WALLET_SLOT),
            ]
          ),
}),
    ],
  },
});

const PaidDepositRateModel = defineMasterDataResource({
  model: GS2.exchange.RateModel,
  mount: PaidDeposit,
  bindings: {
      name: Bind.domainProperty(Source.direct(PaidDeposit, "id")),
    },
  arrayChildren: {
    acquireActions: [
      defineMasterDataResource({
  model: GS2.transaction.AcquireAction,
  mount: PaidDeposit,
  actionProgram: ActionProgram.transform(CURRENCY_PACKAGE_ID, currency.transformId("DepositCurrency"), [
            Arg.domainProperty("count", Source.parent(Source.direct(PaidDeposit, "count"))),
            Arg.static("currencyType", "JPY"),
            Arg.static("price", 120),
            Arg.static("slot", WALLET_SLOT),
          ]),
}),
    ],
  },
});

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

export const foundationEconomyCurrencyDemo = definePackage({
  id: "foundation-economy-currency-demo",
  version: "0.0.1",
  display: {
    ja: {
      label: "通貨（デモデータ）",
      description: "ライブデモ用の設定上書き、無償付与、全デモ共通の商品棚と価格を提供します。",
    },
    en: {
      label: "Currency (demo data)",
      description:
        "Supplies the live demo's setting overrides, its free currency grants, and the store shelf and prices every demo shares.",
    },
  },
  dependencies: liveDemoDependencies(CURRENCY_PACKAGE_ID, shop.packageId),
  domainTypes: [FreeDeposit, PaidDeposit],
  instances: [
    instance(CurrencyStore, "currencystore", {
    [currency.propertyId("CurrencyStore", "enableFakeReceipt")]: "Accept",
  }),
    instance(StoreProduct, "coin_small", demoProduct("io.gs2.demo.coin.small", 10, { JPY: 100, USD: 1, XXX: 1 })),
    instance(StoreProduct, "coin_medium", demoProduct("io.gs2.demo.coin.medium", 50, { JPY: 200, USD: 2, XXX: 2 })),
    instance(StoreProduct, "coin_large", demoProduct("io.gs2.demo.coin.large", 250, { JPY: 300, USD: 3, XXX: 3 })),
    instance(FreeDeposit, "freedeposit", { count: 100 }),
    instance(PaidDeposit, "paiddeposit", { count: 50 }),
  ],
  delegatedActions: [
    { target: FreeDeposit, methodName: "Deposit", action: { targetActionKey: "Gs2Exchange:RateModel.Exchange", targetResource: FreeDepositRateModel, parameterOverrides: [{ parameterName: "count", source: { kind: "static", value: 1 } }] } },
    { target: PaidDeposit, methodName: "Deposit", action: { targetActionKey: "Gs2Exchange:RateModel.Exchange", targetResource: PaidDepositRateModel, parameterOverrides: [{ parameterName: "count", source: { kind: "static", value: 1 } }] } },
  ],
  masterDataResources: [
    defineMasterDataResource({
  model: GS2.exchange.Namespace,
  bindings: {
        name: Bind.static("CurrencyGrant"),
        ...Bind.nulls(
          "acquireAwaitScript",
          "exchangeScript",
          "incrementalExchangeScript",
          "logSetting"
        ),
        // Auto-run executes the deposit without requiring a second client request after the exchange.
        transactionSettingV2: transactionSettingV2(),
      },
  children: [
    FreeDepositRateModel,
    PaidDepositRateModel,
  ],
}),
  ],
  uiComponents: [
    defineUiComponent(FreeDeposit, {
  items: [
    UiItem.templateLabel("CountLabel", "Deposit {count} free coins", { count: UiSource.prop("count") }, { name: "FreeDeposit" }),
    UiItem.buttonAction("DepositButton", "Deposit", undefined, { name: "FreeDeposit" }),
  ],
}),
    defineUiComponent(PaidDeposit, {
  items: [
    UiItem.templateLabel("CountLabel", "Deposit {count} paid coins", { count: UiSource.prop("count") }, { name: "PaidDeposit" }),
    UiItem.buttonAction("DepositButton", "Deposit", undefined, { name: "PaidDeposit" }),
  ],
}),
  ],
});

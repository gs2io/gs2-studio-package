import {
  ActionProgram,
  Arg,
  Bind,
  defineDomainType,
  defineInlineElement,
  defineMasterDataResource,
  defineOverlayDomainType,
  definePackage,
  defineUiComponent,
  dependencyPackage,
  inlineElementOf,
  instance,
  type MasterDataResourceDef,
  PT,
  Source,
  transactionSettingV2,
  UiItem,
  UiSource,
} from "gs2-studio-dsl";

import { GS2 } from "gs2-studio-dsl/gs2";

import { jaEnField, jaEnId } from "../../dsl/jaEnField";

import currencySurface from "../../foundation-economy-currency/dsl/dependency-surface.json";

const currency = dependencyPackage(currencySurface);

const CurrencyType = defineDomainType("CurrencyType", {
  localizedDisplay: {
    ja: {
      label: "通貨種別",
      description: "商品の購入に利用できるゲーム内通貨の種類を設定します。",
    },
    en: {
      label: "Currency type",
      description: "Defines a type of in-game currency that can be used to purchase products.",
    },
  },
  localizedProperties: {
    id: jaEnId("通貨種別", "currency type"),
  },
});

const StorePrice = inlineElementOf(() => StoreProduct, "prices");

const DisplayItem: MasterDataResourceDef = defineMasterDataResource({
  model: GS2.showcase.DisplayItem,
  mount: StorePrice,
  bindings: {
      displayItemId: Bind.domainProperty(Source.direct(StorePrice, "id")),
      ...Bind.nulls("salesItemGroup", "salesPeriodEventId"),
      type: Bind.static("salesItem"),
    },
  arrayChildren: {
    salesItem: [
      defineMasterDataResource({
  model: GS2.showcase.SalesItem,
  mount: () => StoreProduct,
  bindings: {
          metadata: Bind.static(""),
          name: Bind.domainProperty(Source.direct(() => StoreProduct, "id")),
        },
  arrayChildren: {
    acquireActions: [
      defineMasterDataResource({
  model: GS2.transaction.AcquireAction,
  mount: () => StoreProduct,
  actionProgram: ActionProgram.transform(
                "foundation-economy-currency",
                currency.transformId("DepositCurrency"),
                [
                  // Leave wallet selection to purchase config because the buyer's slot is unknown at deploy time.
                  Arg.placeholder("slot", "#{slot}"),
                  Arg.domainProperty("count", Source.direct(() => StoreProduct, "count")),
                  Arg.domainProperty(
                    "currencyType",
                    Source.parent(Source.parent(Source.parent(Source.direct(CurrencyType, "id"))))
                  ),
                  Arg.domainProperty(
                    "price",
                    Source.parent(Source.parent(Source.direct(StorePrice, "price")))
                  ),
                ]
              ),
}),
    ],
    consumeActions: [
      defineMasterDataResource({
  model: GS2.transaction.ConsumeAction,
  mount: () => StoreProduct,
  actionProgram: ActionProgram.transform(
                "foundation-economy-currency",
                currency.transformId("VerifyReceipt"),
                [Arg.domainProperty("contentName", Source.direct(() => StoreProduct, "id"))]
              ),
}),
    ],
  },
}),
    ],
  },
});

const StorePriceSchema = defineInlineElement("StorePrice", {
  properties: {
    currencyType: PT.ref(CurrencyType).masterData().required(),
    price: PT.float64().masterData().required(),
  },
  elementKey: ["currencyType"],
  localizedDisplay: {
      ja: {
        label: "販売価格",
        description:
          "ストア商品を1つの販売通貨で売るときの価格です。ストア商品の販売価格の要素として設定します。",
      },
      en: {
        label: "Store price",
        description:
          "A store product's price in one currency, set as an element of the product's prices.",
      },
    },
  localizedProperties: {
      id: jaEnId("販売価格", "store price"),
      currencyType: jaEnField(
        "販売通貨",
        "Price currency",
        "商品の価格を表す通貨種別です。",
        "Currency type used to price the product."
      ),
      price: jaEnField(
        "価格",
        "Price",
        "指定した通貨での商品価格です。",
        "Product price in the selected currency."
      ),
    },
  delegatedActions: {
    Buy: { targetActionKey: "Gs2Showcase:DisplayItem.Buy", targetResource: DisplayItem, parameterOverrides: [{ parameterName: "quantity", source: { kind: "static", value: 1 } }] },
  },
});

const StoreProduct = defineOverlayDomainType("StoreProduct", currency.overlay("StoreProduct"), {
  properties: {
    count: PT.int32().masterData().required(),
    prices: PT.listOf(PT.inlineElement(StorePriceSchema)).masterData(),
  },
  localizedDisplay: {
    ja: { label: "ストア商品", description: "ストアで販売する商品内容と表示情報を設定します。" },
    en: {
      label: "Store product",
      description: "Defines the contents and presentation of a product sold in the store.",
    },
  },
  localizedProperties: {
        count: jaEnField(
          "付与通貨量",
          "Currency amount",
          "このストア商品を購入したときに付与する通貨量です。",
          "Amount of currency granted when this store product is purchased.",
          { ja: "通貨", en: "currency" }
        ),
        prices: jaEnField(
          "販売価格",
          "Prices",
          "販売通貨ごとのこのストア商品の価格です。",
          "Prices of this store product, one per currency it sells for."
        ),
      },
});

const Showcase = defineMasterDataResource({
  model: GS2.showcase.Showcase,
  mount: CurrencyType,
  bindings: {
      name: Bind.domainProperty(Source.direct(CurrencyType, "id")),
      salesPeriodEventId: Bind.null(),
    },
  arrayChildren: {
    displayItems: [
      DisplayItem,
    ],
  },
});

export const microShopCurrency = definePackage({
  id: "micro-shop-currency",
  version: "0.0.1",
  display: {
    ja: { label: "通貨ショップ", description: "通貨を購入できる商品と価格を扱います。" },
    en: {
      label: "Currency Shop",
      description: "A shop for purchasing currency, with configurable products and prices.",
    },
  },
  dependencies: {
    "foundation-economy-currency": "github:gs2io/gs2-studio-package",
  },
  domainTypes: [CurrencyType, StoreProduct],
  instances: [
    instance(CurrencyType, "JPY", {}),
    instance(CurrencyType, "USD", {}),
    instance(CurrencyType, "XXX", {}),
  ],
  masterDataResources: [
    defineMasterDataResource({
  model: GS2.showcase.Namespace,
  bindings: {
        name: Bind.static("ShopCurrency"),
        ...Bind.nulls("buyScript", "logSetting"),
        transactionSettingV2: transactionSettingV2(),
      },
  children: [
    Showcase,
  ],
}),
  ],
  uiComponents: [
    defineUiComponent(StoreProduct, {
  items: [
    UiItem.label("CountLabel", UiSource.prop("count"), { name: "StoreProduct" }),
    UiItem.value("CountValue", UiSource.prop("count"), { name: "StoreProduct" }),
    UiItem.value("IdValue", UiSource.prop("id"), { name: "StoreProduct" }),
    UiItem.value("AppleAppStoreProductIdValue", UiSource.prop("appleAppStoreProductId"), {
        name: "StoreProduct",
      }),
    UiItem.value("GooglePlayProductIdValue", UiSource.prop("googlePlayProductId"), {
        name: "StoreProduct",
      }),
  ],
}),
    defineUiComponent(StorePrice, {
  items: [
    UiItem.value("PriceValue", UiSource.prop("price"), { name: "StorePrice" }),
    UiItem.label("PriceLabel", UiSource.prop("price"), { name: "StorePrice" }),
  ],
}),
  ],
});

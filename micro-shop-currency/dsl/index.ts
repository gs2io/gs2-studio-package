import {
  ActionProgram,
  Arg,
  Bind,
  defineDomainType,
  defineInlineElement,
  defineMasterDataResource,
  defineOverlayDomainType,
  definePackage,
  dependencyPackage,
  inlineElementOf,
  PT,
  Source,
  transactionSettingV2,
} from "~/dsl";
import { GS2 } from "~/dsl/gs2";

import { jaEnField, jaEnId } from "../../dsl/jaEnField";

import currencySurface from "../../foundation-economy-currency/dsl/dependency-surface.json";

const currency = dependencyPackage(currencySurface);

const CurrencyType = defineDomainType("CurrencyType", dt =>
  dt.localizedProperties({
    id: jaEnId("通貨種別", "currency type"),
  })
);

const StorePrice = inlineElementOf("StoreProduct", "prices");

const DisplayItem = defineMasterDataResource(resource =>
  resource
    .model(GS2.showcase.DisplayItem)
    .mountLocal(StorePrice)
    .bindings({
      displayItemId: Bind.domainProperty(Source.direct(StorePrice, "id")),
      ...Bind.nulls("salesItemGroup", "salesPeriodEventId"),
      type: Bind.static("salesItem"),
    })
    .addArrayChild("salesItem", salesItem => {
      salesItem
        .model(GS2.showcase.SalesItem)
        .mountLocal("StoreProduct")
        .bindings({
          metadata: Bind.static(""),
          name: Bind.domainProperty(Source.direct("StoreProduct", "id")),
        })
        .addArrayChild("acquireActions", acquireAction => {
          acquireAction
            .model(GS2.transaction.AcquireAction)
            .mountLocal("StoreProduct")
            .actionProgram(
              ActionProgram.transform(
                "foundation-economy-currency",
                currency.transformId("DepositCurrency"),
                [
                  // Leave wallet selection to purchase config because the buyer's slot is unknown at deploy time.
                  Arg.placeholder("slot", "#{slot}"),
                  Arg.domainProperty("count", Source.direct("StoreProduct", "count")),
                  Arg.domainProperty(
                    "currencyType",
                    Source.parent(Source.parent(Source.parent(Source.direct(CurrencyType, "id"))))
                  ),
                  Arg.domainProperty(
                    "price",
                    Source.parent(Source.parent(Source.direct(StorePrice, "price")))
                  ),
                ]
              )
            );
        })
        .addArrayChild("consumeActions", consumeAction => {
          consumeAction
            .model(GS2.transaction.ConsumeAction)
            .mountLocal("StoreProduct")
            .actionProgram(
              ActionProgram.transform(
                "foundation-economy-currency",
                currency.transformId("VerifyReceipt"),
                [Arg.domainProperty("contentName", Source.direct("StoreProduct", "id"))]
              )
            );
        });
    })
);

const StorePriceSchema = defineInlineElement("StorePrice", dt =>
  dt
    .property(PT.prop("currencyType", PT.ref("CurrencyType")).masterData().required())
    .property(PT.float64("price").masterData().required())
    .elementKey("currencyType")
    .localizedProperties({
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
    })
    .localizedDisplay({
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
    })
    .delegatedAction("Buy", {
      targetActionKey: "Gs2Showcase:DisplayItem.Buy",
      targetResource: DisplayItem,
      parameterOverrides: [{ parameterName: "quantity", source: { kind: "static", value: 1 } }],
    })
);

const StoreProduct = defineOverlayDomainType(
  "StoreProduct",
  currency.overlay("StoreProduct"),
  domainType =>
    domainType
      .property(PT.int32("count").masterData().required())
      .property(PT.prop("prices", PT.listOf(PT.inlineElement(StorePriceSchema))).masterData())
      .localizedProperties({
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
      })
);

const Showcase = defineMasterDataResource(resource =>
  resource
    .model(GS2.showcase.Showcase)
    .mountLocal(CurrencyType)
    .bindings({
      name: Bind.domainProperty(Source.direct(CurrencyType, "id")),
      salesPeriodEventId: Bind.null(),
    })
    .addArrayChild("displayItems", DisplayItem)
);

export const microShopCurrency = definePackage("micro-shop-currency", "0.0.0")
  .display({
    ja: { label: "通貨ショップ", description: "通貨を購入できる商品と価格を扱います。" },
    en: {
      label: "Currency Shop",
      description: "A shop for purchasing currency, with configurable products and prices.",
    },
  })
  .displayType(CurrencyType, {
    ja: {
      label: "通貨種別",
      description: "商品の購入に利用できるゲーム内通貨の種類を設定します。",
    },
    en: {
      label: "Currency type",
      description: "Defines a type of in-game currency that can be used to purchase products.",
    },
  })
  .displayType(StoreProduct, {
    ja: { label: "ストア商品", description: "ストアで販売する商品内容と表示情報を設定します。" },
    en: {
      label: "Store product",
      description: "Defines the contents and presentation of a product sold in the store.",
    },
  })
  .dependency("foundation-economy-currency", "github:gs2io/gs2-studio-package")
  .domainType(CurrencyType)
  .domainType(StoreProduct)

  .instance("CurrencyType", "JPY", {})
  .instance("CurrencyType", "USD", {})
  .instance("CurrencyType", "XXX", {})

  // Ship currency axes only; consuming projects author their own products and prices.

  .uiComponent(StoreProduct, ui =>
    ui
      .label("CountLabel", ui.prop("count"), { name: "StoreProduct" })
      .value("CountValue", ui.prop("count"), { name: "StoreProduct" })
      .value("IdValue", ui.prop("id"), { name: "StoreProduct" })
      .value("AppleAppStoreProductIdValue", ui.prop("appleAppStoreProductId"), {
        name: "StoreProduct",
      })
      .value("GooglePlayProductIdValue", ui.prop("googlePlayProductId"), {
        name: "StoreProduct",
      })
  )
  .uiComponent(StorePrice, ui =>
    ui
      .value("PriceValue", ui.prop("price"), { name: "StorePrice" })
      .label("PriceLabel", ui.prop("price"), { name: "StorePrice" })
  )

  .masterDataResource(r =>
    r
      .model(GS2.showcase.Namespace)
      .bindings({
        name: Bind.static("ShopCurrency"),
        ...Bind.nulls("buyScript", "logSetting"),
        transactionSettingV2: transactionSettingV2(),
      })
      .addChild(Showcase)
  )

  .build();

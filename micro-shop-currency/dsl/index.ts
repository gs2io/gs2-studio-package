import {
  Bind,
  defineDomainType,
  defineMasterDataResource,
  defineOverlayDomainType,
  definePackage,
  PT,
  Source,
} from "~/dsl";
import { GS2 } from "~/dsl/gs2";

const CurrencyType = defineDomainType("CurrencyType", dt => dt.idDescription("Unique identifier"));

/**
 * The currency package's StoreProduct, extended here with the amount of
 * currency each product grants.
 */
const StoreProduct = defineOverlayDomainType(
  "StoreProduct",
  {
    source: {
      kind: "dependency",
      directSourcePackageId: "foundation-economy-currency",
      directSourceTypeId: "dt_JQQFPC83PRYTWMZ43RV3T4SKSB",
      sourcePackageId: "foundation-economy-currency",
      sourceTypeId: "dt_JQQFPC83PRYTWMZ43RV3T4SKSB",
    },
    compositeKeyMode: { kind: "inherit" },
  },
  domainType => domainType.property(PT.int32("count").masterData().required())
);

/** One product priced in one currency; the pair is the row identity. */
const StorePrice = defineDomainType("StorePrice", dt =>
  dt
    .idDescription("Unique identifier")
    .property(PT.prop("product", PT.ref("StoreProduct")).assetDelivery().required())
    .property(PT.prop("currencyType", PT.ref("CurrencyType")).assetDelivery().required())
    .property(PT.float64("price").masterData().required())
    .compositeKey("product", "currencyType")
);

const DisplayItem = defineMasterDataResource(resource =>
  resource
    .model(GS2.showcase.DisplayItem)
    .mountLocal(StorePrice)
    .bindings({
      displayItemId: Bind.domainProperty(Source.direct(StorePrice, "id")),
      salesItemGroup: Bind.null(),
      salesPeriodEventId: Bind.null(),
      type: Bind.static("salesItem"),
    })
    .addArrayChild("salesItem", salesItem => {
      salesItem
        .model(GS2.showcase.SalesItem)
        .mountLocal(StoreProduct)
        .bindings({
          metadata: Bind.static(""),
          name: Bind.domainProperty(Source.direct(StoreProduct, "id")),
        })
        .addArrayChild("acquireActions", acquireAction => {
          acquireAction
            .model(GS2.transaction.AcquireAction)
            .mountLocal(StoreProduct)
            .bindings({
              action: Bind.transform("foundation-economy-currency", "DepositCurrency", [
                {
                  parameterName: "count",
                  source: {
                    kind: "domainProperty",
                    source: Source.direct(StoreProduct, "count"),
                  },
                },
                {
                  parameterName: "currencyType",
                  source: {
                    kind: "domainProperty",
                    source: Source.parent(
                      Source.parent(Source.parent(Source.direct(CurrencyType, "id")))
                    ),
                  },
                },
                {
                  parameterName: "price",
                  source: {
                    kind: "domainProperty",
                    source: Source.parent(Source.parent(Source.direct(StorePrice, "price"))),
                  },
                },
              ]),
            });
        })
        .addArrayChild("consumeActions", consumeAction => {
          consumeAction
            .model(GS2.transaction.ConsumeAction)
            .mountLocal(StoreProduct)
            .bindings({
              action: Bind.transform("foundation-economy-currency", "VerifyReceipt", [
                {
                  parameterName: "contentName",
                  source: {
                    kind: "domainProperty",
                    source: Source.direct(StoreProduct, "id"),
                  },
                },
              ]),
            });
        });
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
    label: { ja: "通貨ショップ", en: "Currency Shop" },
    description: {
      ja: "通貨を購入できる商品と価格を扱うショップ機能です。",
      en: "A shop for purchasing currency, with configurable products and prices.",
    },
  })
  .displayType(CurrencyType, { label: { ja: "通貨種別", en: "Currency type" } })
  .displayType(StorePrice, { label: { ja: "販売価格", en: "Store price" } })
  .displayType(StoreProduct, { label: { ja: "ストア商品", en: "Store product" } })
  .dependency(
    "foundation-economy-currency",
    "github:gs2io/gs2-studio-package"
  )
  .domainType(CurrencyType)
  .domainType(StorePrice)
  .domainType(StoreProduct)

  .instance("CurrencyType", "JPY", {})
  .instance("CurrencyType", "USD", {})
  .instance("CurrencyType", "XXX", {})

  .instance("StoreProduct", "tier1", { count: 10 })
  .instance("StoreProduct", "tier2", { count: 50 })
  .instance("StoreProduct", "tier3", { count: 250 })
  .instance("StoreProduct", "tier4", { count: 1250 })
  .instance("StoreProduct", "tier5", { count: 6000 })

  .instance(StorePrice, "tier1.JPY", { product: "tier1", currencyType: "JPY", price: 100 })
  .instance(StorePrice, "tier1.USD", { product: "tier1", currencyType: "USD", price: 1 })
  .instance(StorePrice, "tier1.XXX", { product: "tier1", currencyType: "XXX", price: 1 })
  .instance(StorePrice, "tier2.JPY", { product: "tier2", currencyType: "JPY", price: 200 })
  .instance(StorePrice, "tier2.USD", { product: "tier2", currencyType: "USD", price: 2 })
  .instance(StorePrice, "tier2.XXX", { product: "tier2", currencyType: "XXX", price: 2 })
  .instance(StorePrice, "tier3.JPY", { product: "tier3", currencyType: "JPY", price: 300 })
  .instance(StorePrice, "tier3.USD", { product: "tier3", currencyType: "USD", price: 3 })
  .instance(StorePrice, "tier3.XXX", { product: "tier3", currencyType: "XXX", price: 3 })
  .instance(StorePrice, "tier4.JPY", { product: "tier4", currencyType: "JPY", price: 400 })
  .instance(StorePrice, "tier4.USD", { product: "tier4", currencyType: "USD", price: 4 })
  .instance(StorePrice, "tier4.XXX", { product: "tier4", currencyType: "XXX", price: 4 })
  .instance(StorePrice, "tier5.JPY", { product: "tier5", currencyType: "JPY", price: 500 })
  .instance(StorePrice, "tier5.USD", { product: "tier5", currencyType: "USD", price: 5 })
  .instance(StorePrice, "tier5.XXX", { product: "tier5", currencyType: "XXX", price: 5 })

  .uiComponent(StoreProduct, ui =>
    ui
      .label("CountLabel", ui.prop("count"), { name: "StoreProduct" })
      .value("CountValue", ui.prop("count"), { name: "StoreProduct" })
      .value("IdValue", ui.prop("id"), { name: "StoreProduct" })
      .value("AppleAppStoreProductIdValue", ui.inheritedProp("prop_A26C5NBX039V9DNV0ERPSWVPD8"), {
        name: "StoreProduct",
      })
      .value("GooglePlayProductIdValue", ui.inheritedProp("prop_Z99QWHNS8G1DEFWGT2MB00NRJA"), {
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
        buyScript: Bind.null(),
        logSetting: Bind.null(),
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
      .addChild(Showcase)
  )

  .delegatedAction(StorePrice, "Buy", {
    targetActionKey: "Gs2Showcase:DisplayItem.Buy",
    targetResource: DisplayItem,
    parameterOverrides: [{ kind: "static", parameterName: "quantity", value: 1 }],
  })
  .build();

import {
  ActionProgram,
  Arg,
  Bind,
  defineMasterDataResource,
  defineOverlayDomainType,
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

import { GS2 } from "gs2-studio-dsl/gs2";

import { jaEnField } from "../../../dsl/jaEnField";

import shopSurface from "../../dsl/dependency-surface.json";

import currencySurface from "../../../foundation-economy-currency/dsl/dependency-surface.json";

import energySurface from "../../../foundation-economy-energy/dsl/dependency-surface.json";

const shop = dependencyPackage(shopSurface);

const energy = dependencyPackage(energySurface);

const currency = dependencyPackage(currencySurface);

const WALLET_SLOT = 0;

const STAMINA = "stamina";

const PRODUCTS = [
  { id: "refill_small", recovery: 5, cost: 30 },
  { id: "refill_medium", recovery: 15, cost: 70 },
  { id: "refill_large", recovery: 40, cost: 100 },
] as const;

const EnergyProduct = defineOverlayDomainType("EnergyProduct", shop.overlay("EnergyProduct"), {
  properties: {
    cost: PT.int32().masterData().required(),
  },
  actionPropertyTransforms: [
    { targetProperty: shop.propertyId("EnergyProduct", "consumeActions"), mode: "replace", transformPackageId: currency.packageId, transformId: currency.transformId("WithdrawCurrency"), arguments: [
          { parameterName: "slot", source: { kind: "static", value: WALLET_SLOT } },
          // Set the optional payment policy explicitly so purchases accept the free balance without relying on an omitted argument.
          { parameterName: "paidOnly", source: { kind: "static", value: false } },
          {
            parameterName: "count",
            source: { kind: "domainProperty", propertyName: "cost" },
          },
        ] },
  ],
  localizedDisplay: {
    ja: {
      label: "スタミナ商品",
      description: "ライブデモで販売するスタミナ商品と、その回復量・価格です。",
    },
    en: {
      label: "Stamina product",
      description:
        "A stamina product the live demo sells, with what it refills and what it charges.",
    },
  },
  localizedProperties: {
      cost: jaEnField(
        "価格",
        "Price",
        "この商品を購入するときに消費する無償通貨の量です。",
        "Free currency spent to buy this product.",
        { ja: "通貨", en: "currency" }
      ),
    },
});

const BuyRateModel = defineMasterDataResource({
  model: GS2.exchange.RateModel,
  mount: EnergyProduct,
  bindings: { name: Bind.domainProperty(Source.direct(EnergyProduct, "id")) },
  arrayChildren: {
    acquireActions: [
      defineMasterDataResource({
  model: GS2.transaction.AcquireAction,
  mount: EnergyProduct,
  actionProgram: ActionProgram.transform(energy.packageId, energy.transformId("RecoveryEnergy"), [
            // Use published ids because these inherited properties are absent from the local overlay declarations.
            Arg.domainProperty(
              "energy",
              Source.parent(
                Source.direct(EnergyProduct, shop.propertyId("EnergyProduct", "energy"))
              )
            ),
            Arg.domainProperty(
              "value",
              Source.parent(
                Source.direct(EnergyProduct, shop.propertyId("EnergyProduct", "recoveryValue"))
              )
            ),
          ]),
}),
    ],
    consumeActions: [
      defineMasterDataResource({
  model: GS2.transaction.ConsumeAction,
  mount: EnergyProduct,
  actionProgram: ActionProgram.transform(currency.packageId, currency.transformId("WithdrawCurrency"), [
            Arg.static("slot", WALLET_SLOT),
            Arg.static("paidOnly", false),
            Arg.domainProperty("count", Source.parent(Source.direct(EnergyProduct, "cost"))),
          ]),
}),
    ],
  },
});

export const microShopEnergyDemo = definePackage({
  id: "micro-shop-energy-demo",
  version: "0.0.1",
  display: {
    ja: {
      label: "スタミナショップ（デモデータ）",
      description: "ライブデモ用に、スタミナ商品の品揃えと価格、購入の操作を揃えます。",
    },
    en: {
      label: "Stamina Shop (demo data)",
      description:
        "Supplies the stamina products the live demo sells, what each charges, and the press that buys one.",
    },
  },
  dependencies: {
    [shop.packageId]: "github:gs2io/gs2-studio-package",
    [energy.packageId]: "github:gs2io/gs2-studio-package",
    [currency.packageId]: "github:gs2io/gs2-studio-package",
    "foundation-economy-energy-demo": "github:gs2io/gs2-studio-package",
    "foundation-economy-currency-demo": "github:gs2io/gs2-studio-package",
    "micro-shop-currency": "github:gs2io/gs2-studio-package",
  },
  domainTypes: [EnergyProduct],
  instances: [
    instance(EnergyProduct, PRODUCTS[0].id, {
    [shop.propertyId("EnergyProduct", "energy")]: STAMINA,
    [shop.propertyId("EnergyProduct", "recoveryValue")]: PRODUCTS[0].recovery,
    cost: PRODUCTS[0].cost,
  }),
    instance(EnergyProduct, PRODUCTS[1].id, {
    [shop.propertyId("EnergyProduct", "energy")]: STAMINA,
    [shop.propertyId("EnergyProduct", "recoveryValue")]: PRODUCTS[1].recovery,
    cost: PRODUCTS[1].cost,
  }),
    instance(EnergyProduct, PRODUCTS[2].id, {
    [shop.propertyId("EnergyProduct", "energy")]: STAMINA,
    [shop.propertyId("EnergyProduct", "recoveryValue")]: PRODUCTS[2].recovery,
    cost: PRODUCTS[2].cost,
  }),
  ],
  delegatedActions: [
    { target: EnergyProduct, methodName: "Buy", action: { targetActionKey: "Gs2Exchange:RateModel.Exchange", targetResource: BuyRateModel, parameterOverrides: [{ parameterName: "count", source: { kind: "static", value: 1 } }] } },
  ],
  masterDataResources: [
    defineMasterDataResource({
  model: GS2.exchange.Namespace,
  bindings: {
        name: Bind.static("EnergyShop"),
        ...Bind.nulls(
          "acquireAwaitScript",
          "exchangeScript",
          "incrementalExchangeScript",
          "logSetting"
        ),
        // Auto-run avoids a second client request; atomic commit keeps charging and recovery in the same purchase.
        transactionSettingV2: transactionSettingV2(),
      },
  children: [
    BuyRateModel,
  ],
}),
  ],
  uiComponents: [
    defineUiComponent(EnergyProduct, {
  items: [
    UiItem.templateLabel("OfferLabel", "+{recovery} stamina for {cost} coins", { recovery: UiSource.prop("recoveryValue"), cost: UiSource.prop("cost") }, { name: "EnergyProduct" }),
    UiItem.buttonAction("BuyButton", "Buy", undefined, { name: "EnergyProduct" }),
  ],
}),
  ],
});

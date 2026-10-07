import {
  Arg,
  Bind,
  defineMasterDataResource,
  defineOverlayDomainType,
  definePackage,
  dependencyPackage,
  PT,
  Source,
  transactionSetting,
} from "~/dsl";
import { GS2 } from "~/dsl/gs2";

import { jaEnField } from "../../../dsl/jaEnField";
import shopSurface from "../../dsl/dependency-surface.json";
import currencySurface from "../../../foundation-economy-currency/dsl/dependency-surface.json";
import energySurface from "../../../foundation-economy-energy/dsl/dependency-surface.json";

const shop = dependencyPackage(shopSurface);
const energy = dependencyPackage(energySurface);
const currency = dependencyPackage(currencySurface);

const WALLET_SLOT = 0;

/** Match the stamina row owned by the shared energy demo rather than authoring a second meter. */
const STAMINA = "stamina";

/** Keep both repeated small purchases and one large purchase affordable from a single demo deposit. */
const PRODUCTS = [
  { id: "refill_small", recovery: 5, cost: 30 },
  { id: "refill_medium", recovery: 15, cost: 70 },
  { id: "refill_large", recovery: 40, cost: 100 },
] as const;

/** Bind each price through its authored property so generated readers recover the charge from deployed actions. */
const EnergyProduct = defineOverlayDomainType(
  "EnergyProduct",
  {
    ...shop.overlay("EnergyProduct"),
    actionPropertyTransforms: [
      {
        // Use the published property id because this DSL evaluation does not resolve the dependency closure.
        targetProperty: shop.propertyId("EnergyProduct", "consumeActions"),
        kind: "transformEntries",
        // Replace the slot so this demo owns the complete price rather than adding a second charge.
        mode: "replace",
        entries: [
          {
            transformPackageId: currency.packageId,
            transformName: "WithdrawCurrency",
            arguments: [
              { parameterName: "slot", source: { kind: "static", value: WALLET_SLOT } },
              // Set the optional payment policy explicitly so purchases accept the free balance without relying on an omitted argument.
              { parameterName: "paidOnly", source: { kind: "static", value: false } },
              {
                parameterName: "count",
                source: { kind: "domainProperty", propertyName: "cost" },
              },
            ],
          },
        ],
      },
    ],
  },
  domainType =>
    domainType
      .property(
        PT.int32("cost")
          .masterData()
          .required()
          .description("Free currency this product charges when it is bought")
      )
      .localizedProperties({
        cost: jaEnField(
          "価格",
          "Price",
          "この商品を購入するときに消費する無償通貨の量です。",
          "Free currency spent to buy this product.",
          { ja: "通貨", en: "currency" }
        ),
      })
);

const BuyRateModel = defineMasterDataResource(resource =>
  resource
    .model(GS2.exchange.RateModel)
    .mountLocal(EnergyProduct)
    .bindings({ name: Bind.domainProperty(Source.direct(EnergyProduct, "id")) })
    .addArrayChild("acquireActions", acquireAction => {
      acquireAction
        .model(GS2.transaction.AcquireAction)
        .mountLocal(EnergyProduct)
        .bindings({
          action: Bind.transform(energy.packageId, "RecoveryEnergy", [
            // Use published ids because these inherited properties are absent from the local overlay declarations.
            Arg.domainProperty(
              "energy",
              Source.parent(
                Source.direct(EnergyProduct.typeName, shop.propertyId("EnergyProduct", "energy"))
              )
            ),
            Arg.domainProperty(
              "value",
              Source.parent(
                Source.direct(
                  EnergyProduct.typeName,
                  shop.propertyId("EnergyProduct", "recoveryValue")
                )
              )
            ),
          ]),
        });
    })
    .addArrayChild("consumeActions", consumeAction => {
      consumeAction
        .model(GS2.transaction.ConsumeAction)
        .mountLocal(EnergyProduct)
        .bindings({
          action: Bind.transform(currency.packageId, "WithdrawCurrency", [
            Arg.static("slot", WALLET_SLOT),
            Arg.static("paidOnly", false),
            Arg.domainProperty("count", Source.parent(Source.direct(EnergyProduct, "cost"))),
          ]),
        });
    })
);

export const microShopEnergyDemo = definePackage("micro-shop-energy-demo", "0.0.0")
  .display({
    label: { ja: "スタミナショップ（デモデータ）", en: "Stamina Shop (demo data)" },
    description: {
      ja: "ライブデモ用に、スタミナ商品の品揃えと価格、購入の操作を揃えます。",
      en: "Supplies the stamina products the live demo sells, what each charges, and the press that buys one.",
    },
  })
  .dependency(shop.packageId, "github:gs2io/gs2-studio-package")
  .dependency(energy.packageId, "github:gs2io/gs2-studio-package")
  .dependency(currency.packageId, "github:gs2io/gs2-studio-package")
  // Reuse shared meter and wallet content so this demo cannot deploy conflicting versions of their stacks.
  .dependency("foundation-economy-energy-demo", "github:gs2io/gs2-studio-package")
  .dependency("foundation-economy-currency-demo", "github:gs2io/gs2-studio-package")
  .dependency("micro-shop-currency", "github:gs2io/gs2-studio-package")

  .displayType(EnergyProduct, {
    label: { ja: "スタミナ商品", en: "Stamina product" },
    description: {
      ja: "ライブデモで販売するスタミナ商品と、その回復量・価格です。",
      en: "A stamina product the live demo sells, with what it refills and what it charges.",
    },
  })
  .domainType(EnergyProduct)

  // Use the local type name so authored rows can combine the overlay cost with inherited property ids.
  .instance(EnergyProduct.typeName, PRODUCTS[0].id, {
    [shop.propertyId("EnergyProduct", "energy")]: STAMINA,
    [shop.propertyId("EnergyProduct", "recoveryValue")]: PRODUCTS[0].recovery,
    cost: PRODUCTS[0].cost,
  })
  .instance(EnergyProduct.typeName, PRODUCTS[1].id, {
    [shop.propertyId("EnergyProduct", "energy")]: STAMINA,
    [shop.propertyId("EnergyProduct", "recoveryValue")]: PRODUCTS[1].recovery,
    cost: PRODUCTS[1].cost,
  })
  .instance(EnergyProduct.typeName, PRODUCTS[2].id, {
    [shop.propertyId("EnergyProduct", "energy")]: STAMINA,
    [shop.propertyId("EnergyProduct", "recoveryValue")]: PRODUCTS[2].recovery,
    cost: PRODUCTS[2].cost,
  })

  .masterDataResource(resource =>
    resource
      .model(GS2.exchange.Namespace)
      .bindings({
        name: Bind.static("EnergyShop"),
        ...Bind.nulls(
          "acquireAwaitScript",
          "exchangeScript",
          "incrementalExchangeScript",
          "logSetting"
        ),
        // Auto-run avoids a second client request; atomic commit keeps charging and recovery in the same purchase.
        transactionSetting: transactionSetting({
          enableAtomicCommit: Bind.static(true),
          enableAutoRun: Bind.static(true),
        }),
      })
      .addChild(BuyRateModel)
  )

  .uiComponent(EnergyProduct, ui =>
    ui
      .templateLabel(
        "OfferLabel",
        "+{recovery} stamina for {cost} coins",
        { recovery: ui.prop("recoveryValue"), cost: ui.prop("cost") },
        { name: "EnergyProduct" }
      )
      .buttonAction("BuyButton", "Buy", undefined, { name: "EnergyProduct" })
  )

  .delegatedAction(EnergyProduct, "Buy", {
    targetActionKey: "Gs2Exchange:RateModel.Exchange",
    targetResource: BuyRateModel,
    parameterOverrides: [{ kind: "static", parameterName: "count", value: 1 }],
  })
  .build();

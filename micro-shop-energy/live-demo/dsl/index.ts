/**
 * Live demo content for `micro-shop-energy`.
 *
 * The feature package is a shop with nothing on the shelf and no till. It
 * declares what a stamina product is — how much it refills, and a slot for
 * what it costs — and the exchange rate that performs the refill. What it
 * cannot ship is the products themselves, what each one charges, or the
 * currency it charges in: a title decides all three, and the package would be
 * wrong to guess.
 *
 * So the demo supplies the shelf. Three tiers, priced so the cheapest is worth
 * buying twice and the largest is worth saving for, paid out of the free
 * balance the currency demo's deposit button fills.
 *
 * The meter being refilled is not this package's either. Rather than author a
 * second stamina row — two packages holding rows of one type leaves no answer
 * to which stack they belong in, and the deploy build says so rather than
 * picking — the demo installs the stamina demo beside it and sells into the
 * row that one already authored.
 */

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

/** The wallet the page shows and the one every purchase is drawn from. */
const WALLET_SLOT = 0;

/**
 * The stamina row the demo sells into.
 *
 * `foundation-economy-energy-demo` authors it under this id, and the generated
 * handler mounts a row by the id the master data was named from — so the name
 * is spelled here rather than derived, and a change on either side has to be
 * made on both.
 */
const STAMINA = "stamina";

/**
 * Three tiers: what each refills, and what it charges for it.
 *
 * The prices are not proportional on purpose. A visitor who presses the
 * deposit once has 100 free currency, which buys the small pack three times
 * over or the large one once — enough for the shape of a shop to show without
 * needing a second deposit.
 */
const PRODUCTS = [
  { id: "refill_small", recovery: 5, cost: 30 },
  { id: "refill_medium", recovery: 15, cost: 70 },
  { id: "refill_large", recovery: 40, cost: 100 },
] as const;

/**
 * The product, extended with what it costs.
 *
 * `consumeActions` is the slot the feature package leaves open: its rate model
 * binds an array child to it, and whatever the property resolves to is what
 * GS2 charges. The property is required and the feature package authors no
 * rows, so nothing has ever filled it — this is the first time it carries a
 * value. One withdrawal is written here and `cost` decides how big it is on
 * each tier, which is why the amount comes off the row rather than out of the
 * transform.
 *
 * `cost` is `masterData`: its value is authored here and travels into the
 * deployed consume action, which is where GS2 reads it at purchase time. The
 * page reads it back off the same row the deploy was built from.
 */
const EnergyProduct = defineOverlayDomainType(
  "EnergyProduct",
  {
    ...shop.overlay("EnergyProduct"),
    actionPropertyTransforms: [
      {
        // Addressed by id because the property belongs to the type this
        // overlay extends: a single-package build does not load its dependency
        // closure, so the name would pass through unresolved.
        targetProperty: shop.propertyId("EnergyProduct", "consumeActions"),
        kind: "transformEntries",
        // Replace, not append: the slot starts empty, and a tier that charged
        // twice would be a pricing bug rather than a second cost.
        mode: "replace",
        entries: [
          {
            transformPackageId: currency.packageId,
            transformName: "WithdrawCurrency",
            arguments: [
              { parameterName: "slot", source: { kind: "static", value: WALLET_SLOT } },
              // Free currency, which is what the deposit on the page pays in.
              // The transform leaves this optional, and an output that names it
              // drops the whole action when it is not supplied, so it is said
              // here rather than left to a default.
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

/**
 * The till.
 *
 * The feature package ships a rate model of its own, but a purchase has to be
 * pressable and a delegated action can only name a resource its own package
 * declares. So the press goes through this one, which charges the same cost
 * the property above carries and hands the refill to the stamina package's
 * `RecoveryEnergy`.
 */
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
            Arg.static("energy", STAMINA),
            // The refill amount is the feature package's property, so it is
            // addressed by id: an overlay's inherited property has no name of
            // its own here.
            Arg.domainProperty(
              "value",
              Source.parent(
                Source.direct(EnergyProduct, shop.propertyId("EnergyProduct", "recoveryValue"))
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
  // An install does not walk a package's own dependencies, so the bases are
  // named here too.
  .dependency(energy.packageId, "github:gs2io/gs2-studio-package")
  .dependency(currency.packageId, "github:gs2io/gs2-studio-package")
  // The meter to refill, and the balance to spend. Both demos author the rows
  // this one sells against, which is why they are installed rather than
  // duplicated here.
  .dependency("foundation-economy-energy-demo", "github:gs2io/gs2-studio-package")
  .dependency("foundation-economy-currency-demo", "github:gs2io/gs2-studio-package")

  .displayType(EnergyProduct, {
    label: { ja: "スタミナ商品", en: "Stamina product" },
    description: {
      ja: "ライブデモで販売するスタミナ商品と、その回復量・価格です。",
      en: "A stamina product the live demo sells, with what it refills and what it charges.",
    },
  })
  .domainType(EnergyProduct)

  .instance(EnergyProduct, PRODUCTS[0].id, {
    [shop.propertyId("EnergyProduct", "recoveryValue")]: PRODUCTS[0].recovery,
    cost: PRODUCTS[0].cost,
  })
  .instance(EnergyProduct, PRODUCTS[1].id, {
    [shop.propertyId("EnergyProduct", "recoveryValue")]: PRODUCTS[1].recovery,
    cost: PRODUCTS[1].cost,
  })
  .instance(EnergyProduct, PRODUCTS[2].id, {
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
        // The demo runs the transaction server-side and commits it atomically.
        // With auto-run off, `Exchange` only hands back a stamp sheet the
        // client has to execute through the distributor — an extra round trip
        // that can leave a visitor charged but not refilled if the page is
        // closed mid-way.
        transactionSetting: transactionSetting({
          enableAtomicCommit: Bind.static(true),
          enableAutoRun: Bind.static(true),
        }),
      })
      .addChild(BuyRateModel)
  )

  // The feature package ships no components: what a title shows of a shop is
  // the title's decision. So the demo supplies the caption and the press.
  .uiComponent(EnergyProduct, ui =>
    ui
      .templateLabel(
        "OfferLabel",
        "+{recovery} stamina for {cost}",
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

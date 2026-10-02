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

import { jaEnField, jaEnId } from "../../dsl/jaEnField";

import energySurface from "../../foundation-economy-energy/dsl/dependency-surface.json";

// Addressed by name against the identities the dependency publishes, so a
// mistake is a compile error rather than an id that resolves to nothing.
const energy = dependencyPackage(energySurface);

const EnergyProduct = defineDomainType("EnergyProduct", dt =>
  dt
    // Which stamina a product refills. A title may run more than one meter,
    // and the refill transform has to be told which one this product is for.
    .property(
      PT.prop("energy", PT.ref(energy.typeId("Energy")))
        .masterData()
        .required()
    )
    .property(PT.int32("recoveryValue").masterData().required())
    .property(PT.prop("consumeActions", PT.listOf(PT.consumeAction())).masterData().required())
    .localizedProperties({
      id: jaEnId("スタミナ商品", "stamina product"),
      energy: jaEnField(
        "回復対象",
        "Refilled stamina",
        "購入時に回復するスタミナです。",
        "The stamina this product refills when it is bought."
      ),
      recoveryValue: jaEnField(
        "回復量",
        "Recovery amount",
        "購入時に回復するスタミナ量です。",
        "Amount of stamina restored by purchasing this product.",
        { ja: "ポイント", en: "points" }
      ),
      consumeActions: jaEnField(
        "購入コスト",
        "Purchase costs",
        "商品購入時に実行する消費アクションです。",
        "Consume actions executed to purchase the product."
      ),
    })
);

const RateModel = defineMasterDataResource(resource =>
  resource
    .model(GS2.exchange.RateModel)
    .mountLocal(EnergyProduct)
    .bindings({
      name: Bind.domainProperty(Source.direct(EnergyProduct, "id")),
    })
    .addArrayChild("acquireActions", acquireAction => {
      acquireAction
        .model(GS2.transaction.AcquireAction)
        .mountLocal(EnergyProduct)
        .bindings({
          // The stamina and the recovery amount are authored on the product
          // and handed to the energy package's own RecoveryEnergy transform.
          action: Bind.transform(energy.packageId, "RecoveryEnergy", [
            Arg.domainProperty("energy", Source.parent(Source.direct(EnergyProduct, "energy"))),
            Arg.domainProperty(
              "value",
              Source.parent(Source.direct(EnergyProduct, "recoveryValue"))
            ),
          ]),
        });
    })
    .addArrayChild("consumeActions", consumeAction => {
      consumeAction
        .model(GS2.transaction.ConsumeAction)
        .mountLocal(EnergyProduct)
        .bindings({
          action: Bind.domainProperty(
            Source.parent(Source.direct(EnergyProduct, "consumeActions"))
          ),
        });
    })
);

export const microShopEnergy = definePackage("micro-shop-energy", "0.0.0")
  .display({
    label: { ja: "スタミナショップ", en: "Stamina Shop" },
    description: {
      ja: "スタミナを回復する商品を販売します。",
      en: "A shop that sells products to refill stamina.",
    },
  })
  .displayType(EnergyProduct, {
    label: { ja: "スタミナ商品", en: "Stamina product" },
    description: {
      ja: "購入時に回復するスタミナ量、価格、購入制限を設定します。",
      en: "Defines a stamina product's recovery amount, price, and purchase limits.",
    },
  })
  .dependency(energy.packageId, "github:gs2io/gs2-studio-package")
  .domainType(EnergyProduct)
  .masterDataResource(r =>
    r
      .model(GS2.exchange.Namespace)
      .bindings({
        name: Bind.static("EnergyProduct"),
        ...Bind.nulls(
          "acquireAwaitScript",
          "exchangeScript",
          "incrementalExchangeScript",
          "logSetting"
        ),
        transactionSetting: transactionSetting(),
      })
      .addChild(RateModel)
  )
  .build();

import {
  Arg,
  Bind,
  defineDomainType,
  defineMasterDataResource,
  definePackage,
  PT,
  Source,
  transactionSetting,
} from "~/dsl";
import { GS2 } from "~/dsl/gs2";

import { jaEnField, jaEnId } from "../../dsl/jaEnField";

const EnergyProduct = defineDomainType("EnergyProduct", dt =>
  dt
    .property(PT.int32("recoveryValue").masterData().required())
    .property(PT.prop("consumeActions", PT.listOf(PT.consumeAction())).masterData().required())
    .localizedProperties({
      id: jaEnId("スタミナ商品", "stamina product"),
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
          // The recovery amount is authored on the product and handed to the
          // energy package's own RecoveryEnergy transform.
          action: Bind.transform("foundation-economy-energy", "RecoveryEnergy", [
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
      ja: "スタミナを回復する商品を販売するショップ機能です。",
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
  .dependency("foundation-economy-energy", "github:gs2io/gs2-studio-package")
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

import {
  ActionProgram,
  Arg,
  Bind,
  defineDomainType,
  defineMasterDataResource,
  definePackage,
  dependencyPackage,
  PT,
  Source,
  transactionSettingV2,
} from "gs2-studio-dsl";

import { GS2 } from "gs2-studio-dsl/gs2";

import { jaEnField, jaEnId } from "../../dsl/jaEnField";

import energySurface from "../../foundation-economy-energy/dsl/dependency-surface.json";

const energy = dependencyPackage(energySurface);

const EnergyProduct = defineDomainType("EnergyProduct", {
  properties: {
    energy: PT.ref(energy.type("Energy")).masterData().required(),
    recoveryValue: PT.int32().masterData().required(),
    consumeActions: PT.listOf(PT.consumeAction()).masterData().required(),
  },
  localizedDisplay: {
    ja: {
      label: "スタミナ商品",
      description: "購入時に回復するスタミナ量、価格、購入制限を設定します。",
    },
    en: {
      label: "Stamina product",
      description: "Defines a stamina product's recovery amount, price, and purchase limits.",
    },
  },
  localizedProperties: {
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
    },
});

const RateModel = defineMasterDataResource({
  model: GS2.exchange.RateModel,
  mount: EnergyProduct,
  bindings: {
      name: Bind.domainProperty(Source.direct(EnergyProduct, "id")),
    },
  arrayChildren: {
    acquireActions: [
      defineMasterDataResource({
  model: GS2.transaction.AcquireAction,
  mount: EnergyProduct,
  actionProgram: ActionProgram.transform(energy.packageId, energy.transformId("RecoveryEnergy"), [
            Arg.domainProperty("energy", Source.parent(Source.direct(EnergyProduct, "energy"))),
            Arg.domainProperty(
              "value",
              Source.parent(Source.direct(EnergyProduct, "recoveryValue"))
            ),
          ]),
}),
    ],
    consumeActions: [
      defineMasterDataResource({
  model: GS2.transaction.ConsumeAction,
  mount: EnergyProduct,
  actionProgram: ActionProgram.domainProperty(
            Source.parent(Source.direct(EnergyProduct, "consumeActions"))
          ),
}),
    ],
  },
});

export const microShopEnergy = definePackage({
  id: "micro-shop-energy",
  version: "0.0.1",
  display: {
    ja: { label: "スタミナショップ", description: "スタミナを回復する商品を販売します。" },
    en: { label: "Stamina Shop", description: "A shop that sells products to refill stamina." },
  },
  dependencies: {
    [energy.packageId]: "github:gs2io/gs2-studio-package",
  },
  domainTypes: [EnergyProduct],
  masterDataResources: [
    defineMasterDataResource({
  model: GS2.exchange.Namespace,
  bindings: {
        name: Bind.static("EnergyProduct"),
        ...Bind.nulls(
          "acquireAwaitScript",
          "exchangeScript",
          "incrementalExchangeScript",
          "logSetting"
        ),
        transactionSettingV2: transactionSettingV2(),
      },
  children: [
    RateModel,
  ],
}),
  ],
});

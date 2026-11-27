import {
  ActionProgram,
  Arg,
  Bind,
  defineMasterDataResource,
  definePackage,
  defineUiComponent,
  dependencyPackage,
  instance,
  Source,
  transactionSettingV2,
  UiItem,
} from "gs2-studio-dsl";

import { liveDemoDependencies } from "../../../dsl/liveDemoDependencies";

import { GS2 } from "gs2-studio-dsl/gs2";

import inventorySurface from "../../dsl/dependency-surface.json";

const inventory = dependencyPackage(inventorySurface);

const Item = inventory.type("Item");

const STEP = 1;

const GainRateModel = defineMasterDataResource({
  model: GS2.exchange.RateModel,
  mount: Item,
  bindings: { name: Bind.domainProperty(Source.direct(Item, "id")) },
  arrayChildren: {
    acquireActions: [
      defineMasterDataResource({
  model: GS2.transaction.AcquireAction,
  mount: Item,
  actionProgram: ActionProgram.transform(inventory.packageId, inventory.transformId("AcquireItem"), [
            Arg.domainProperty("itemName", Source.direct(Item, "id")),
            Arg.static("count", STEP),
          ]),
}),
    ],
  },
});

const SpendRateModel = defineMasterDataResource({
  model: GS2.exchange.RateModel,
  mount: Item,
  bindings: { name: Bind.domainProperty(Source.direct(Item, "id")) },
  arrayChildren: {
    consumeActions: [
      defineMasterDataResource({
  model: GS2.transaction.ConsumeAction,
  mount: Item,
  actionProgram: ActionProgram.transform(inventory.packageId, inventory.transformId("ConsumeItem"), [
            Arg.domainProperty("itemName", Source.direct(Item, "id")),
            Arg.static("count", STEP),
          ]),
}),
    ],
  },
});

export const foundationEconomyInventoryDemo = definePackage({
  id: "foundation-economy-inventory-demo",
  version: "0.0.1",
  display: {
    ja: {
      label: "アイテム（デモデータ）",
      description: "ライブデモ用のアイテムと、入手・消費の操作を提供します。",
    },
    en: {
      label: "Items (demo data)",
      description:
        "Supplies the items used by the live demo, and the presses that gain and spend them.",
    },
  },
  dependencies: liveDemoDependencies(inventory.packageId),
  instances: [
    instance(Item, "potion", {}),
    instance(Item, "ether", {}),
    instance(Item, "elixir", {}),
  ],
  delegatedActions: [
    { target: Item, methodName: "Gain", action: { targetActionKey: "Gs2Exchange:RateModel.Exchange", targetResource: GainRateModel, parameterOverrides: [{ parameterName: "count", source: { kind: "static", value: 1 } }] } },
    { target: Item, methodName: "Spend", action: { targetActionKey: "Gs2Exchange:RateModel.Exchange", targetResource: SpendRateModel, parameterOverrides: [{ parameterName: "count", source: { kind: "static", value: 1 } }] } },
  ],
  masterDataResources: [
    defineMasterDataResource({
  model: GS2.exchange.Namespace,
  bindings: {
        name: Bind.static("ItemGain"),
        ...Bind.nulls(
          "acquireAwaitScript",
          "exchangeScript",
          "incrementalExchangeScript",
          "logSetting"
        ),
        // Auto-run executes the transaction without a second client request after the exchange.
        transactionSettingV2: transactionSettingV2(),
      },
  children: [
    GainRateModel,
  ],
}),
    defineMasterDataResource({
  model: GS2.exchange.Namespace,
  bindings: {
        name: Bind.static("ItemSpend"),
        ...Bind.nulls(
          "acquireAwaitScript",
          "exchangeScript",
          "incrementalExchangeScript",
          "logSetting"
        ),
        transactionSettingV2: transactionSettingV2(),
      },
  children: [
    SpendRateModel,
  ],
}),
  ],
  uiComponents: [
    defineUiComponent(Item, {
  items: [
    UiItem.buttonAction("GainButton", "Gain", undefined, { name: "Item" }),
    UiItem.buttonAction("SpendButton", "Spend", undefined, { name: "Item" }),
  ],
}),
  ],
});

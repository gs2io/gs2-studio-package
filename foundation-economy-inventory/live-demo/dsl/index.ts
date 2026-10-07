import {
  Arg,
  Bind,
  defineMasterDataResource,
  definePackage,
  dependencyPackage,
  Source,
  transactionSetting,
} from "~/dsl";
import { GS2 } from "~/dsl/gs2";

import inventorySurface from "../../dsl/dependency-surface.json";

const inventory = dependencyPackage(inventorySurface);

const Item = inventory.type("Item");

const STEP = 1;

/** Keep gain and spend in separate namespaces because both derive rate names from the same item ids. */
const GainRateModel = defineMasterDataResource(resource =>
  resource
    .model(GS2.exchange.RateModel)
    .mountLocal(Item)
    .bindings({ name: Bind.domainProperty(Source.direct(Item, "id")) })
    .addArrayChild("acquireActions", acquireAction => {
      acquireAction
        .model(GS2.transaction.AcquireAction)
        .mountLocal(Item)
        .bindings({
          action: Bind.transform(inventory.packageId, "AcquireItem", [
            Arg.domainProperty("itemName", Source.direct(Item, "id")),
            Arg.static("count", STEP),
          ]),
        });
    })
);

const SpendRateModel = defineMasterDataResource(resource =>
  resource
    .model(GS2.exchange.RateModel)
    .mountLocal(Item)
    .bindings({ name: Bind.domainProperty(Source.direct(Item, "id")) })
    .addArrayChild("consumeActions", consumeAction => {
      consumeAction
        .model(GS2.transaction.ConsumeAction)
        .mountLocal(Item)
        .bindings({
          action: Bind.transform(inventory.packageId, "ConsumeItem", [
            Arg.domainProperty("itemName", Source.direct(Item, "id")),
            Arg.static("count", STEP),
          ]),
        });
    })
);

export const foundationEconomyInventoryDemo = definePackage(
  "foundation-economy-inventory-demo",
  "0.0.0"
)
  .display({
    label: { ja: "アイテム（デモデータ）", en: "Items (demo data)" },
    description: {
      ja: "ライブデモ用のアイテムと、入手・消費の操作を提供します。",
      en: "Supplies the items used by the live demo, and the presses that gain and spend them.",
    },
  })
  .dependency(inventory.packageId, "github:gs2io/gs2-studio-package")

  // Start with empty stock so visitors can observe the spend control becoming available after a grant.
  .instance(Item, "potion", {})
  .instance(Item, "ether", {})
  .instance(Item, "elixir", {})

  .masterDataResource(resource =>
    resource
      .model(GS2.exchange.Namespace)
      .bindings({
        name: Bind.static("ItemGain"),
        ...Bind.nulls(
          "acquireAwaitScript",
          "exchangeScript",
          "incrementalExchangeScript",
          "logSetting"
        ),
        // Auto-run executes the transaction without a second client request after the exchange.
        transactionSetting: transactionSetting({
          enableAtomicCommit: Bind.static(true),
          enableAutoRun: Bind.static(true),
        }),
      })
      .addChild(GainRateModel)
  )

  .masterDataResource(resource =>
    resource
      .model(GS2.exchange.Namespace)
      .bindings({
        name: Bind.static("ItemSpend"),
        ...Bind.nulls(
          "acquireAwaitScript",
          "exchangeScript",
          "incrementalExchangeScript",
          "logSetting"
        ),
        transactionSetting: transactionSetting({
          enableAtomicCommit: Bind.static(true),
          enableAutoRun: Bind.static(true),
        }),
      })
      .addChild(SpendRateModel)
  )

  .uiComponent(Item, ui =>
    ui
      .buttonAction("GainButton", "Gain", undefined, { name: "Item" })
      .buttonAction("SpendButton", "Spend", undefined, { name: "Item" })
  )

  .delegatedAction(Item, "Gain", {
    targetActionKey: "Gs2Exchange:RateModel.Exchange",
    targetResource: GainRateModel,
    parameterOverrides: [{ kind: "static", parameterName: "count", value: 1 }],
  })
  .delegatedAction(Item, "Spend", {
    targetActionKey: "Gs2Exchange:RateModel.Exchange",
    targetResource: SpendRateModel,
    parameterOverrides: [{ kind: "static", parameterName: "count", value: 1 }],
  })
  .build();

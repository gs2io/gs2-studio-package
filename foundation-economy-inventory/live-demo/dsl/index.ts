/**
 * Live demo content for `foundation-economy-inventory`.
 *
 * The feature package models an item and how many are held, but ships no
 * items — which ones a title sells is a title's business. This package
 * supplies three to look at and the two presses that move them: pick one up,
 * and spend one.
 */

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

// Materialization publishes the feature package's identities, so everything
// below is addressed by name; a typo is a compile error rather than an id that
// resolves to nothing.
const inventory = dependencyPackage(inventorySurface);

const Item = inventory.type("Item");

/** One press picks up one, and one press spends one. */
const STEP = 1;

/**
 * Picking an item up, modelled as an exchange that costs nothing: the acquire
 * action is the whole of the press.
 *
 * The rate is named after the item because a delegated action on `Item` must
 * target a resource that mounts `Item` — that is how the generated loader
 * learns which rate to exchange — and each item needs its own rate.
 *
 * It lives under its own exchange namespace because `SpendRateModel` names its
 * rows the same way; sharing a namespace collides the `rateModels` array on
 * its primary key and drops the whole `CurrentRateMaster` from the template.
 */
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

/** The mirror of `GainRateModel`: spends one and grants nothing. */
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

  // Three items rather than one, because the point of an inventory is that it
  // holds more than one thing and each row counts separately. A player starts
  // with none of any of them: an empty row is what the disabled spend button
  // is there to show.
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
        // The demo runs the transaction server-side and commits it atomically.
        // With auto-run off, `Exchange` only hands back a stamp sheet the
        // client has to execute through the distributor — an extra round trip
        // that can leave an item spent but not granted if the page is closed
        // mid-way.
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

  // The stock line and the greying-out both come from the feature package:
  // reading an item is the same job in every title. What the demo adds is the
  // pair of presses that move it.
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

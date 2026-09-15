import {
  Bind,
  defineDomainType,
  defineMasterDataResource,
  definePackage,
  PT,
  Source,
  UiCond,
} from "~/dsl";
import { GS2 } from "~/dsl/gs2";

import { jaEnField, jaEnId } from "../../dsl/jaEnField";

const Item = defineDomainType("Item", dt =>
  dt.property(PT.int64("count").userData().required()).localizedProperties({
    id: jaEnId("アイテム", "item"),
    count: jaEnField(
      "所持数",
      "Owned quantity",
      "プレイヤーが所持しているアイテムの数量です。",
      "Quantity of the item owned by the player.",
      { ja: "個", en: "items" }
    ),
  })
);

const SimpleItemModel = defineMasterDataResource(resource =>
  resource
    .model(GS2.inventory.SimpleItemModel)
    .mountLocal(Item)
    .bindings({
      name: Bind.domainProperty(Source.direct(Item, "id")),
    })
);

export const foundationEconomyInventory = definePackage("foundation-economy-inventory", "0.0.0")
  .display({
    label: { ja: "アイテム", en: "Items" },
    description: {
      ja: "プレイヤーが所持するアイテムの基本的な在庫管理です。",
      en: "Basic inventory management for items the player owns.",
    },
  })
  .displayType(Item, {
    label: { ja: "アイテム", en: "Item" },
    description: {
      ja: "プレイヤーが所持する各アイテムの数量を管理します。",
      en: "Tracks the quantity of each item owned by a player.",
    },
  })
  .domainType(Item)

  .masterDataResource(r =>
    r
      .model(GS2.inventory.Namespace)
      .bindings({
        name: Bind.static("Inventory"),
      })
      .addChild(child => {
        child
          .model(GS2.inventory.SimpleInventoryModel)
          .bindings({
            name: Bind.static("Inventory"),
          })
          .addArrayChild("simpleItemModels", SimpleItemModel);
      })
  )

  .userDataResource(r =>
    r
      .model(GS2.inventory.SimpleItem)
      .linkedMasterResourceId(SimpleItemModel)
      .bindings({
        count: Bind.domainProperties([Source.direct(Item, "count")]),
        itemName: Bind.skip(),
        userId: Bind.skip(),
      })
  )

  // An item is read as what it is and how many are held, and spending it is
  // only offered while there is any. None of that is a decision a title makes,
  // so it ships with the model rather than being rebuilt per screen.
  .uiComponent(Item, ui =>
    ui
      // The item names itself: a simple item has no display name of its own,
      // and its id is what a player would call it.
      .templateLabel(
        "StockLabel",
        "{id} x{count}",
        { id: ui.prop("id"), count: ui.prop("count") },
        { name: "Item" }
      )
      .value("CountValue", ui.prop("count"), { name: "Item" })
      // Spending nothing is not an action a player should be able to take, and
      // a button that fails is worse than one that is plainly unavailable.
      .interactable("OwnedInteractable", UiCond.gt(ui.prop("count"), ui.lit(0)), { name: "Item" })
  )

  .actionTransform("AcquireItem", at =>
    at
      .category("acquire")
      .parameter("itemName", { type: PT.ref("Item") })
      .parameter("count", { type: PT.int32() })
      .output("Gs2Inventory:AcquireSimpleItemsByUserId", o =>
        o
          .resourceRef(() => SimpleItemModel)
          .mapResourceKey("namespaceName")
          .mapResourceKey("inventoryName")
          .mapPlaceholder("userId", "#{userId}")
          .mapParameter("acquireCounts[0].itemName", "itemName")
          .mapParameter("acquireCounts[0].count", "count")
      )
  )
  .actionTransform("ConsumeItem", at =>
    at
      .category("consume")
      .parameter("itemName", { type: PT.ref("Item") })
      .parameter("count", { type: PT.int32() })
      .output("Gs2Inventory:ConsumeSimpleItemsByUserId", o =>
        o
          .resourceRef(() => SimpleItemModel)
          .mapResourceKey("namespaceName")
          .mapResourceKey("inventoryName")
          .mapPlaceholder("userId", "#{userId}")
          .mapParameter("consumeCounts[0].itemName", "itemName")
          .mapParameter("consumeCounts[0].count", "count")
      )
  )
  .build();

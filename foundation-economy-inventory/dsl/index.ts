import {
  Bind,
  defineActionTransform,
  defineDomainType,
  defineMasterDataResource,
  definePackage,
  defineUiComponent,
  defineUserDataResource,
  OutputMap,
  PT,
  Source,
  UiCond,
  UiItem,
  UiSource,
} from "gs2-studio-dsl";

import { GS2 } from "gs2-studio-dsl/gs2";

import { jaEnField, jaEnId } from "../../dsl/jaEnField";

const Item = defineDomainType("Item", {
  properties: {
    count: PT.int64().userData().required(),
  },
  localizedDisplay: {
    ja: { label: "アイテム", description: "プレイヤーが所持する各アイテムの数量を管理します。" },
    en: { label: "Item", description: "Tracks the quantity of each item owned by a player." },
  },
  localizedProperties: {
    id: jaEnId("アイテム", "item"),
    count: jaEnField(
      "所持数",
      "Owned quantity",
      "プレイヤーが所持しているアイテムの数量です。",
      "Quantity of the item owned by the player.",
      { ja: "個", en: "items" }
    ),
  },
});

const SimpleItemModel = defineMasterDataResource({
  model: GS2.inventory.SimpleItemModel,
  mount: Item,
  bindings: {
      name: Bind.domainProperty(Source.direct(Item, "id")),
    },
});

const AcquireItemTransform = defineActionTransform("AcquireItem", {
  category: "acquire",
  parameters: {
    itemName: { type: PT.ref(Item) },
    count: { type: PT.int32() },
  },
  outputs: [
    {
    kind: "direct",
    actionName: "Gs2Inventory:AcquireSimpleItemsByUserId",
    resource: () => SimpleItemModel,
    parameterMappings: {
      namespaceName: OutputMap.resourceKey(),
      inventoryName: OutputMap.resourceKey(),
      userId: OutputMap.placeholder("#{userId}"),
      "acquireCounts[0].itemName": OutputMap.parameter("itemName"),
      "acquireCounts[0].count": OutputMap.parameter("count"),
    },
  },
  ],
});

const ConsumeItemTransform = defineActionTransform("ConsumeItem", {
  category: "consume",
  parameters: {
    itemName: { type: PT.ref(Item) },
    count: { type: PT.int32() },
  },
  outputs: [
    {
    kind: "direct",
    actionName: "Gs2Inventory:ConsumeSimpleItemsByUserId",
    resource: () => SimpleItemModel,
    parameterMappings: {
      namespaceName: OutputMap.resourceKey(),
      inventoryName: OutputMap.resourceKey(),
      userId: OutputMap.placeholder("#{userId}"),
      "consumeCounts[0].itemName": OutputMap.parameter("itemName"),
      "consumeCounts[0].count": OutputMap.parameter("count"),
    },
  },
  ],
});

export const foundationEconomyInventory = definePackage({
  id: "foundation-economy-inventory",
  version: "0.0.1",
  display: {
    ja: { label: "アイテム", description: "プレイヤーが所持するアイテムの在庫を管理します。" },
    en: { label: "Items", description: "Basic inventory management for items the player owns." },
  },
  domainTypes: [Item],
  masterDataResources: [
    defineMasterDataResource({
  model: GS2.inventory.Namespace,
  bindings: {
        name: Bind.static("Inventory"),
      },
  children: [
    defineMasterDataResource({
  model: GS2.inventory.SimpleInventoryModel,
  bindings: {
            name: Bind.static("Inventory"),
          },
  arrayChildren: {
    simpleItemModels: [
      SimpleItemModel,
    ],
  },
}),
  ],
}),
  ],
  userDataResources: [
    defineUserDataResource({
  model: GS2.inventory.SimpleItem,
  linkedMaster: SimpleItemModel,
  bindings: {
        count: Bind.domainProperties([Source.direct(Item, "count")]),
        itemName: Bind.skip(),
        userId: Bind.skip(),
      },
}),
  ],
  actionTransforms: [AcquireItemTransform, ConsumeItemTransform],
  uiComponents: [
    defineUiComponent(Item, {
  items: [
    UiItem.templateLabel("StockLabel", "{id} x{count}", { id: UiSource.prop("id"), count: UiSource.prop("count") }, { name: "Item" }),
    UiItem.value("CountValue", UiSource.prop("count"), { name: "Item" }),
    UiItem.interactable("OwnedInteractable", UiCond.gt(UiSource.prop("count"), UiSource.lit(0)), { name: "Item" }),
  ],
}),
  ],
});

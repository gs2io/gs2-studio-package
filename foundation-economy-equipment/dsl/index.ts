import {
  Bind,
  defineDomainType,
  defineMasterDataResource,
  definePackage,
  PT,
  Source,
  transactionSettingV2,
  UiCond,
} from "~/dsl";
import { GS2 } from "~/dsl/gs2";

import { jaEnField, jaEnId } from "../../dsl/jaEnField";

const EquipmentCategory = defineDomainType("EquipmentCategory", dt =>
  dt.localizedProperties({
    id: jaEnId("装備カテゴリ", "equipment category"),
  })
);

const Equipment = defineDomainType("Equipment", dt =>
  dt
    .property(PT.prop("category", PT.ref("EquipmentCategory")).assetDelivery().required())
    .property(PT.int32("sortValue").masterData().required())
    .property(PT.string("propertyId").userData().required())
    .localizedProperties({
      id: jaEnId("装備", "equipment item"),
      category: jaEnField(
        "装備カテゴリ",
        "Equipment category",
        "この装備が属するカテゴリです。",
        "Category this equipment belongs to."
      ),
      sortValue: jaEnField(
        "表示順",
        "Sort order",
        "装備一覧で使用する並び順の値です。",
        "Value used to order equipment in lists."
      ),
      propertyId: jaEnField(
        "装備個体ID",
        "Equipment instance ID",
        "プレイヤーが所持する装備個体の識別子です。",
        "Identifier of the equipment instance owned by the player."
      ),
    })
);

// A constant inventory name gives each player one bag, so the collection has a single entry.
const EquipmentCollection = defineDomainType("EquipmentCollection", dt =>
  dt
    .singleEntry()
    .property(PT.int32("defaultCapacity").masterData().required())
    .property(PT.int32("maximumCapacity").masterData().required())
    .property(PT.int32("currentCapacityUsage").userData().required())
    .property(PT.int32("currentMaximumCapacity").userData().required())
    .localizedProperties({
      id: jaEnId("装備所持枠", "equipment inventory"),
      defaultCapacity: jaEnField(
        "初期所持枠",
        "Initial capacity",
        "新規プレイヤーに付与する装備所持枠です。",
        "Equipment capacity granted to a new player.",
        { ja: "枠", en: "slots" }
      ),
      maximumCapacity: jaEnField(
        "最大所持枠",
        "Maximum capacity",
        "拡張できる装備所持枠の最大値です。",
        "Maximum equipment capacity a player can reach.",
        { ja: "枠", en: "slots" }
      ),
      currentCapacityUsage: jaEnField(
        "使用中の所持枠",
        "Used capacity",
        "現在装備が使用している所持枠数です。",
        "Equipment capacity currently in use.",
        { ja: "枠", en: "slots" }
      ),
      currentMaximumCapacity: jaEnField(
        "現在の所持枠",
        "Current capacity",
        "プレイヤーが現在利用できる装備所持枠です。",
        "Equipment capacity currently available to the player.",
        { ja: "枠", en: "slots" }
      ),
    })
);

const ItemModel = defineMasterDataResource(resource =>
  resource
    .model(GS2.inventory.ItemModel)
    .mountLocal(Equipment)
    .bindings({
      name: Bind.domainProperty(Source.direct(Equipment, "id")),
      sortValue: Bind.domainProperty(Source.direct(Equipment, "sortValue")),
      allowMultipleStacks: Bind.static(true),
      stackingLimit: Bind.static(1),
    })
);

const InventoryModel = defineMasterDataResource(resource =>
  resource
    .model(GS2.inventory.InventoryModel)
    .mountLocal(EquipmentCollection)
    .bindings({
      name: Bind.static("Equipment"),
      initialCapacity: Bind.domainProperty(Source.direct(EquipmentCollection, "defaultCapacity")),
      maxCapacity: Bind.domainProperty(Source.direct(EquipmentCollection, "maximumCapacity")),
      // Referenced equipment must remain available to the character wearing it.
      protectReferencedItem: Bind.static(true),
    })
    .addArrayChild("itemModels", ItemModel)
);

export const foundationEconomyEquipment = definePackage("foundation-economy-equipment", "0.0.1")
  .display({
    ja: {
      label: "装備",
      description: "プレイヤーが所持する武器や防具を、カテゴリごとに管理します。",
    },
    en: {
      label: "Equipment",
      description: "Manages the weapons and gear a player owns, grouped by category.",
    },
  })
  .displayType(EquipmentCategory, {
    ja: { label: "装備カテゴリ", description: "装備を分類するカテゴリを登録します。" },
    en: {
      label: "Equipment category",
      description: "Registers categories used to classify equipment.",
    },
  })
  .displayType(EquipmentCollection, {
    ja: {
      label: "装備所持枠",
      description: "プレイヤーが所持できる装備数の初期値・上限・現在値を管理します。",
    },
    en: {
      label: "Equipment slots",
      description:
        "Manages the initial, maximum, and current number of equipment slots a player owns.",
    },
  })
  .displayType(Equipment, {
    ja: { label: "装備", description: "ゲームに登場する装備、カテゴリ、表示順を登録します。" },
    en: {
      label: "Equipment",
      description: "Registers equipment available in the game, its category, and display order.",
    },
  })
  .domainType(EquipmentCategory)
  .domainType(Equipment)
  .domainType(EquipmentCollection)

  .masterDataResource(r =>
    r
      .model(GS2.inventory.Namespace)
      .bindings({
        name: Bind.static("Equipment"),
        ...Bind.nulls(
          "acquireScript",
          "consumeScript",
          "overflowScript",
          "simpleItemAcquireScript",
          "simpleItemConsumeScript",
          "bigItemAcquireScript",
          "bigItemConsumeScript",
          "logSetting"
        ),
        transactionSettingV2: transactionSettingV2(),
      })
      .addChild(InventoryModel)
  )

  .userDataResource(r =>
    r
      .model(GS2.inventory.Inventory)
      .linkedMasterResourceId(InventoryModel)
      .bindings({
        currentInventoryCapacityUsage: Bind.domainProperties([
          Source.direct(EquipmentCollection, "currentCapacityUsage"),
        ]),
        currentInventoryMaxCapacity: Bind.domainProperties([
          Source.direct(EquipmentCollection, "currentMaximumCapacity"),
        ]),
        inventoryId: Bind.skip(),
        inventoryName: Bind.skip(),
        userId: Bind.skip(),
      })
  )

  .userDataResource(r =>
    r
      .model(GS2.inventory.ItemSet)
      .linkedMasterResourceId(ItemModel)
      .mountLocal(Equipment)
      .bindings({
        count: Bind.skip(),
        inventoryName: Bind.skip(),
        itemName: Bind.skip(),
        itemSetId: Bind.skip(),
        name: Bind.domainProperty(Source.direct(Equipment, "propertyId")),
        sortValue: Bind.skip(),
        userId: Bind.skip(),
      })
  )

  .uiComponent(EquipmentCollection, ui =>
    ui
      // Use the player's expanded capacity rather than the authored starting capacity.
      .gauge("CapacityGauge", ui.prop("currentCapacityUsage"), ui.prop("currentMaximumCapacity"), {
        name: "EquipmentCollection",
        clamp: true,
      })
      .templateLabel(
        "CapacityLabel",
        "{currentCapacityUsage}/{currentMaximumCapacity}",
        {
          currentCapacityUsage: ui.prop("currentCapacityUsage"),
          currentMaximumCapacity: ui.prop("currentMaximumCapacity"),
        },
        { name: "EquipmentCollection" }
      )
      .interactable(
        "ExpandableInteractable",
        UiCond.lt(ui.prop("currentMaximumCapacity"), ui.prop("maximumCapacity")),
        { name: "EquipmentCollection" }
      )
      .activeToggle(
        "FullActiveToggle",
        UiCond.gte(ui.prop("currentCapacityUsage"), ui.prop("currentMaximumCapacity")),
        { name: "EquipmentCollection" }
      )
  )

  .uiComponent(Equipment, ui =>
    ui
      // Include instance identity alongside the equipment name so callers can distinguish two owned copies.
      .templateLabel("NameLabel", "{id}", { id: ui.prop("id") }, { name: "Equipment" })
      .value("PropertyIdValue", ui.prop("propertyId"), { name: "Equipment" })
  )

  .actionTransform("AcquireEquipment", at =>
    at
      .category("acquire")
      .parameter("equipment", { type: PT.ref("Equipment") })
      .output("Gs2Inventory:AcquireItemSetByUserId", o =>
        o
          .resourceRef(() => InventoryModel)
          .mapResourceKey("namespaceName")
          .mapResourceKey("inventoryName")
          .mapParameter("itemName", "equipment")
          .mapPlaceholder("userId", "#{userId}")
          .mapStatic("acquireCount", 1)
          .mapStatic("expiresAt", null)
          .mapStatic("createNewItemSet", null)
          .mapStatic("itemSetName", null)
      )
  )
  .actionTransform("DeleteEquipment", at =>
    at
      .category("consume")
      .parameter("equipment", { type: PT.ref("Equipment") })
      // Keep instance selection optional because a rate model authored at deploy time cannot name a player-owned item set.
      .parameter("equipmentPropertyId", { type: PT.string(), required: false })
      .output("Gs2Inventory:ConsumeItemSetByUserId", o =>
        o
          .resourceRef(() => InventoryModel)
          .mapResourceKey("namespaceName")
          .mapResourceKey("inventoryName")
          .mapPlaceholder("userId", "#{userId}")
          .mapParameter("itemName", "equipment")
          .mapStatic("consumeCount", 1)
          .mapParameter("itemSetName", "equipmentPropertyId")
      )
  )
  .actionTransform("AddEquipmentCapacity", at =>
    at
      .category("acquire")
      .parameter("value", { type: PT.int32() })
      .output("Gs2Inventory:AddCapacityByUserId", o =>
        o
          .resourceRef(() => InventoryModel)
          .mapResourceKey("namespaceName")
          .mapResourceKey("inventoryName")
          .mapPlaceholder("userId", "#{userId}")
          .mapParameter("addCapacityValue", "value")
      )
  )
  .build();

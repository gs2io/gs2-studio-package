import {
  Bind,
  defineDomainType,
  defineMasterDataResource,
  definePackage,
  PT,
  Source,
  transactionSetting,
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

// One bag per player, so one row: the inventory it is backed by is named by a
// constant, and a type whose identity never varies has no list to mount.
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
    })
    .addArrayChild("itemModels", ItemModel)
);

export const foundationEconomyEquipment = definePackage("foundation-economy-equipment", "0.0.0")
  .display({
    label: { ja: "装備", en: "Equipment" },
    description: {
      ja: "キャラクターに装備させる武器や防具の所持・カテゴリを管理します。",
      en: "Manages the weapons and gear characters own and equip, grouped by category.",
    },
  })
  .displayType(EquipmentCategory, {
    label: { ja: "装備カテゴリ", en: "Equipment category" },
    description: {
      ja: "装備を分類するカテゴリを登録します。",
      en: "Registers categories used to classify equipment.",
    },
  })
  .displayType(EquipmentCollection, {
    label: { ja: "装備所持枠", en: "Equipment slots" },
    description: {
      ja: "プレイヤーが所持できる装備数の初期値・上限・現在値を管理します。",
      en: "Manages the initial, maximum, and current number of equipment slots a player owns.",
    },
  })
  .displayType(Equipment, {
    label: { ja: "装備", en: "Equipment" },
    description: {
      ja: "ゲームに登場する装備、カテゴリ、表示順を登録します。",
      en: "Registers equipment available in the game, its category, and display order.",
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
        transactionSetting: transactionSetting(),
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

  // How full the bag is, and whether there is room to make it bigger, are the
  // same two readings in every title that has one, so they ship with the model.
  .uiComponent(EquipmentCollection, ui =>
    ui
      // Against the capacity the player actually has, not the one the title
      // starts them with: the whole point of an expandable bag is that the
      // ceiling moves.
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
      // Past the ceiling the title set, there is nothing left to buy, and a
      // button that fails is worse than one that is plainly unavailable.
      .interactable(
        "ExpandableInteractable",
        UiCond.lt(ui.prop("currentMaximumCapacity"), ui.prop("maximumCapacity")),
        { name: "EquipmentCollection" }
      )
      // A bag with no room left is the state the expand button exists for, so
      // anything that only matters while it is full hangs off this.
      .activeToggle(
        "FullActiveToggle",
        UiCond.gte(ui.prop("currentCapacityUsage"), ui.prop("currentMaximumCapacity")),
        { name: "EquipmentCollection" }
      )
  )

  .uiComponent(Equipment, ui =>
    ui
      // A catalogue row names the equipment; an owned row also carries the
      // instance it is, which is what tells two of the same sword apart.
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
      .parameter("equipmentPropertyId", { type: PT.string() })
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

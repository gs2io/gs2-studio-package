import { Bind, defineDomainType, defineMasterDataResource, definePackage, PT, Source } from "~/dsl";
import { GS2 } from "~/dsl/gs2";

const EquipmentCategory = defineDomainType("EquipmentCategory", dt =>
  dt.idDescription("Unique identifier")
);

const Equipment = defineDomainType("Equipment", dt =>
  dt
    .idDescription("Unique identifier")
    .property(PT.prop("category", PT.ref("EquipmentCategory")).assetDelivery().required())
    .property(PT.int32("sortValue").masterData().required())
    .property(PT.string("propertyId").userData().required())
);

const EquipmentCollection = defineDomainType("EquipmentCollection", dt =>
  dt
    .idDescription("Unique identifier")
    .property(PT.int32("defaultCapacity").masterData().required())
    .property(PT.int32("maximumCapacity").masterData().required())
    .property(PT.int32("currentCapacityUsage").userData().required())
    .property(PT.int32("currentMaximumCapacity").userData().required())
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
        acquireScript: Bind.null(),
        consumeScript: Bind.null(),
        overflowScript: Bind.null(),
        simpleItemAcquireScript: Bind.null(),
        simpleItemConsumeScript: Bind.null(),
        bigItemAcquireScript: Bind.null(),
        bigItemConsumeScript: Bind.null(),
        logSetting: Bind.null(),
        transactionSetting: {
          acquireActionUseJobQueue: Bind.static(false),
          commitScriptResultInUseDistributor: Bind.static(false),
          distributorNamespaceId: Bind.static("grn:gs2:{region}:{ownerId}:distributor:default"),
          enableAtomicCommit: Bind.static(false),
          enableAutoRun: Bind.static(false),
          queueNamespaceId: Bind.static("grn:gs2:{region}:{ownerId}:queue:default"),
          transactionUseDistributor: Bind.static(false),
        },
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

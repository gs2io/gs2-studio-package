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
  transactionSettingV2,
  UiCond,
  UiItem,
  UiSource,
} from "gs2-studio-dsl";

import { GS2 } from "gs2-studio-dsl/gs2";

import { jaEnField, jaEnId } from "../../dsl/jaEnField";

const EquipmentCategory = defineDomainType("EquipmentCategory", {
  localizedDisplay: {
    ja: { label: "装備カテゴリ", description: "装備を分類するカテゴリを登録します。" },
    en: {
      label: "Equipment category",
      description: "Registers categories used to classify equipment.",
    },
  },
  localizedProperties: {
    id: jaEnId("装備カテゴリ", "equipment category"),
  },
});

const Equipment = defineDomainType("Equipment", {
  properties: {
    category: PT.ref(EquipmentCategory).assetDelivery().required(),
    sortValue: PT.int32().masterData().required(),
    propertyId: PT.string().userData().required(),
  },
  localizedDisplay: {
    ja: { label: "装備", description: "ゲームに登場する装備、カテゴリ、表示順を登録します。" },
    en: {
      label: "Equipment",
      description: "Registers equipment available in the game, its category, and display order.",
    },
  },
  localizedProperties: {
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
    },
});

const EquipmentCollection = defineDomainType("EquipmentCollection", {
  singleEntry: true,
  properties: {
    defaultCapacity: PT.int32().masterData().required(),
    maximumCapacity: PT.int32().masterData().required(),
    currentCapacityUsage: PT.int32().userData().required(),
    currentMaximumCapacity: PT.int32().userData().required(),
  },
  localizedDisplay: {
    ja: {
      label: "装備所持枠",
      description: "プレイヤーが所持できる装備数の初期値・上限・現在値を管理します。",
    },
    en: {
      label: "Equipment slots",
      description:
        "Manages the initial, maximum, and current number of equipment slots a player owns.",
    },
  },
  localizedProperties: {
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
    },
});

const ItemModel = defineMasterDataResource({
  model: GS2.inventory.ItemModel,
  mount: Equipment,
  bindings: {
      name: Bind.domainProperty(Source.direct(Equipment, "id")),
      sortValue: Bind.domainProperty(Source.direct(Equipment, "sortValue")),
      allowMultipleStacks: Bind.static(true),
      stackingLimit: Bind.static(1),
    },
});

const InventoryModel = defineMasterDataResource({
  model: GS2.inventory.InventoryModel,
  mount: EquipmentCollection,
  bindings: {
      name: Bind.static("Equipment"),
      initialCapacity: Bind.domainProperty(Source.direct(EquipmentCollection, "defaultCapacity")),
      maxCapacity: Bind.domainProperty(Source.direct(EquipmentCollection, "maximumCapacity")),
      // Referenced equipment must remain available to the character wearing it.
      protectReferencedItem: Bind.static(true),
    },
  arrayChildren: {
    itemModels: [
      ItemModel,
    ],
  },
});

const AcquireEquipmentTransform = defineActionTransform("AcquireEquipment", {
  category: "acquire",
  parameters: {
    equipment: { type: PT.ref(Equipment) },
  },
  outputs: [
    {
    kind: "direct",
    actionName: "Gs2Inventory:AcquireItemSetByUserId",
    resource: () => InventoryModel,
    parameterMappings: {
      namespaceName: OutputMap.resourceKey(),
      inventoryName: OutputMap.resourceKey(),
      itemName: OutputMap.parameter("equipment"),
      userId: OutputMap.placeholder("#{userId}"),
      acquireCount: OutputMap.static(1),
      expiresAt: OutputMap.static(null),
      createNewItemSet: OutputMap.static(null),
      itemSetName: OutputMap.static(null),
    },
  },
  ],
});

const DeleteEquipmentTransform = defineActionTransform("DeleteEquipment", {
  category: "consume",
  parameters: {
    equipment: { type: PT.ref(Equipment) },
    equipmentPropertyId: { type: PT.string(), required: false },
  },
  outputs: [
    {
    kind: "direct",
    actionName: "Gs2Inventory:ConsumeItemSetByUserId",
    resource: () => InventoryModel,
    parameterMappings: {
      namespaceName: OutputMap.resourceKey(),
      inventoryName: OutputMap.resourceKey(),
      userId: OutputMap.placeholder("#{userId}"),
      itemName: OutputMap.parameter("equipment"),
      consumeCount: OutputMap.static(1),
      itemSetName: OutputMap.parameter("equipmentPropertyId"),
    },
  },
  ],
});

const AddEquipmentCapacityTransform = defineActionTransform("AddEquipmentCapacity", {
  category: "acquire",
  parameters: {
    value: { type: PT.int32() },
  },
  outputs: [
    {
    kind: "direct",
    actionName: "Gs2Inventory:AddCapacityByUserId",
    resource: () => InventoryModel,
    parameterMappings: {
      namespaceName: OutputMap.resourceKey(),
      inventoryName: OutputMap.resourceKey(),
      userId: OutputMap.placeholder("#{userId}"),
      addCapacityValue: OutputMap.parameter("value"),
    },
  },
  ],
});

export const foundationEconomyEquipment = definePackage({
  id: "foundation-economy-equipment",
  version: "0.0.1",
  display: {
    ja: {
      label: "装備",
      description: "プレイヤーが所持する武器や防具を、カテゴリごとに管理します。",
    },
    en: {
      label: "Equipment",
      description: "Manages the weapons and gear a player owns, grouped by category.",
    },
  },
  domainTypes: [EquipmentCategory, Equipment, EquipmentCollection],
  masterDataResources: [
    defineMasterDataResource({
  model: GS2.inventory.Namespace,
  bindings: {
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
      },
  children: [
    InventoryModel,
  ],
}),
  ],
  userDataResources: [
    defineUserDataResource({
  model: GS2.inventory.Inventory,
  linkedMaster: InventoryModel,
  bindings: {
        currentInventoryCapacityUsage: Bind.domainProperties([
          Source.direct(EquipmentCollection, "currentCapacityUsage"),
        ]),
        currentInventoryMaxCapacity: Bind.domainProperties([
          Source.direct(EquipmentCollection, "currentMaximumCapacity"),
        ]),
        inventoryId: Bind.skip(),
        inventoryName: Bind.skip(),
        userId: Bind.skip(),
      },
}),
    defineUserDataResource({
  model: GS2.inventory.ItemSet,
  mount: Equipment,
  linkedMaster: ItemModel,
  bindings: {
        count: Bind.skip(),
        inventoryName: Bind.skip(),
        itemName: Bind.skip(),
        itemSetId: Bind.skip(),
        name: Bind.domainProperty(Source.direct(Equipment, "propertyId")),
        sortValue: Bind.skip(),
        userId: Bind.skip(),
      },
}),
  ],
  actionTransforms: [AcquireEquipmentTransform, DeleteEquipmentTransform, AddEquipmentCapacityTransform],
  uiComponents: [
    defineUiComponent(EquipmentCollection, {
  items: [
    UiItem.gauge("CapacityGauge", UiSource.prop("currentCapacityUsage"), UiSource.prop("currentMaximumCapacity"), {
        name: "EquipmentCollection",
        clamp: true,
      }),
    UiItem.templateLabel("CapacityLabel", "{currentCapacityUsage}/{currentMaximumCapacity}", {
          currentCapacityUsage: UiSource.prop("currentCapacityUsage"),
          currentMaximumCapacity: UiSource.prop("currentMaximumCapacity"),
        }, { name: "EquipmentCollection" }),
    UiItem.interactable("ExpandableInteractable", UiCond.lt(UiSource.prop("currentMaximumCapacity"), UiSource.prop("maximumCapacity")), { name: "EquipmentCollection" }),
    UiItem.activeToggle("FullActiveToggle", UiCond.gte(UiSource.prop("currentCapacityUsage"), UiSource.prop("currentMaximumCapacity")), { name: "EquipmentCollection" }),
  ],
}),
    defineUiComponent(Equipment, {
  items: [
    UiItem.templateLabel("NameLabel", "{id}", { id: UiSource.prop("id") }, { name: "Equipment" }),
    UiItem.value("PropertyIdValue", UiSource.prop("propertyId"), { name: "Equipment" }),
  ],
}),
  ],
});

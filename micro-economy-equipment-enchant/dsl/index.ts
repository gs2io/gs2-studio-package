import {
  Bind,
  defineActionTransform,
  defineDomainType,
  defineMasterDataResource,
  defineOverlayDomainType,
  definePackage,
  defineUserDataResource,
  dependencyPackage,
  OutputMap,
  PT,
  Source,
  transactionSettingV2,
} from "gs2-studio-dsl";

import { GS2 } from "gs2-studio-dsl/gs2";

import { jaEnField, jaEnId } from "../../dsl/jaEnField";

import equipmentSurface from "../../foundation-economy-equipment/dsl/dependency-surface.json";

const equipment = dependencyPackage(equipmentSurface);

const EQUIPMENT_PROPERTY_ID = equipment.propertyId("Equipment", "propertyId");

const EquipmentEnchant = defineDomainType("EquipmentEnchant", {
  properties: {
    maximumParameterCount: PT.int32().masterData().required(),
  },
  localizedDisplay: {
    ja: {
      label: "エンチャント設定",
      description: "装備に付与できる効果候補と抽選ルールをまとめて設定します。",
    },
    en: {
      label: "Enchantment pool",
      description:
        "Defines the pool of effects and roll rules available when enchanting equipment.",
    },
  },
  localizedProperties: {
    id: jaEnId("エンチャント設定", "enchantment configuration"),
    maximumParameterCount: jaEnField(
      "最大効果数",
      "Maximum effect count",
      "1つの装備に付与できる追加効果の最大数です。",
      "Maximum number of bonus effects one equipment item can hold.",
      { ja: "個", en: "effects" }
    ),
  },
});

const EquipmentEnchantSlotChance = defineDomainType("EquipmentEnchantSlotChance", {
  properties: {
    enchant: PT.ref(EquipmentEnchant).assetDelivery().required(),
    count: PT.int32().masterData().required(),
    weight: PT.int32().masterData().required(),
  },
  localizedDisplay: {
    ja: {
      label: "スロット数抽選",
      description: "エンチャント時に付与される効果スロット数と確率を設定します。",
    },
    en: {
      label: "Slot chance",
      description: "Configures the probability of each effect-slot count during enchantment.",
    },
  },
  localizedProperties: {
      id: jaEnId("効果数抽選", "enchantment slot chance"),
      enchant: jaEnField(
        "エンチャント設定",
        "Enchantment configuration",
        "この効果数抽選が属するエンチャント設定です。",
        "Enchantment configuration this slot-count chance belongs to."
      ),
      count: jaEnField(
        "付与効果数",
        "Effect count",
        "抽選された場合に装備へ付与する効果数です。",
        "Number of effects added when this result is drawn.",
        { ja: "個", en: "effects" }
      ),
      weight: jaEnField(
        "抽選重み",
        "Draw weight",
        "この効果数が選ばれる相対的な重みです。",
        "Relative weight used to draw this effect count."
      ),
    },
});

const EquipmentEnchantOption = defineDomainType("EquipmentEnchantOption", {
  properties: {
    enchant: PT.ref(EquipmentEnchant).assetDelivery().required(),
    resourceName: PT.string().masterData().required(),
    resourceValue: PT.int64().masterData().required(),
    weight: PT.int32().masterData().required(),
  },
  localizedDisplay: {
    ja: {
      label: "エンチャント効果",
      description: "抽選対象となるエンチャント効果と、付与されたときの固定の効果値を設定します。",
    },
    en: {
      label: "Enchant option",
      description:
        "Defines an enchantment effect that can be rolled and the fixed value it grants.",
    },
  },
  localizedProperties: {
      id: jaEnId("エンチャント候補", "enchantment option"),
      enchant: jaEnField(
        "エンチャント設定",
        "Enchantment configuration",
        "この候補が属するエンチャント設定です。",
        "Enchantment configuration this option belongs to."
      ),
      resourceName: jaEnField(
        "効果対象",
        "Effect target",
        "追加効果を適用する能力値やリソースの名前です。",
        "Name of the stat or resource modified by this effect."
      ),
      resourceValue: jaEnField(
        "効果値",
        "Effect value",
        "対象へ加算する追加効果の値です。",
        "Value applied to the target by this bonus."
      ),
      weight: jaEnField(
        "抽選重み",
        "Draw weight",
        "この追加効果が選ばれる相対的な重みです。",
        "Relative weight used to draw this effect."
      ),
    },
});

const EquipmentEnchantment = defineDomainType("EquipmentEnchantment", {
  properties: {
    resourceName: PT.string().userData().required(),
    resourceValue: PT.int64().userData().required(),
  },
  localizedDisplay: {
    ja: {
      label: "付与済み効果",
      description: "プレイヤーの装備に実際に付与されたエンチャント効果を管理します。",
    },
    en: {
      label: "Rolled bonus",
      description: "Tracks the enchantment effects rolled onto a player's equipment.",
    },
  },
  localizedProperties: {
      id: jaEnId("付与済み効果", "rolled enchantment"),
      resourceName: jaEnField(
        "効果対象",
        "Effect target",
        "装備に付与された効果の対象名です。",
        "Name of the target modified by the rolled effect."
      ),
      resourceValue: jaEnField(
        "効果値",
        "Effect value",
        "装備に付与された追加効果の値です。",
        "Value of the rolled effect applied to the equipment."
      ),
    },
});

const Equipment = defineOverlayDomainType("Equipment", equipment.overlay("Equipment"), {
  properties: {
    enchant: PT.ref(EquipmentEnchant),
    enchantments: PT.listOf(PT.inline(EquipmentEnchantment)).userData(),
  },
  localizedDisplay: {
    ja: { label: "装備", description: "装備ごとのエンチャント設定と付与済み効果を管理します。" },
    en: {
      label: "Equipment",
      description: "Associates equipment with its enchantment configuration and rolled effects.",
    },
  },
  localizedProperties: {
      enchant: jaEnField(
        "エンチャント設定",
        "Enchantment configuration",
        "一覧ごとに 1 つのエンチャント設定を指定します。指定しないと装備の一覧は空になります。",
        "Set one enchantment configuration per list. Without it the equipment list stays empty."
      ),
      enchantments: jaEnField(
        "付与済み効果",
        "Enchantments",
        "この装備個体に付与された追加効果の一覧です。",
        "Bonus effects rolled onto this equipment instance."
      ),
    },
});

const RarityParameterModel = defineMasterDataResource({
  model: GS2.enchant.RarityParameterModel,
  mount: EquipmentEnchant,
  bindings: {
      name: Bind.domainProperty(Source.direct(EquipmentEnchant, "id")),
      metadata: Bind.static(""),
      maximumParameterCount: Bind.domainProperty(
        Source.direct(EquipmentEnchant, "maximumParameterCount")
      ),
    },
  arrayChildren: {
    parameterCounts: [
      defineMasterDataResource({
  model: GS2.enchant.RarityParameterCountModel,
  mount: EquipmentEnchantSlotChance,
  bindings: {
          count: Bind.domainProperty(Source.direct(EquipmentEnchantSlotChance, "count")),
          weight: Bind.domainProperty(Source.direct(EquipmentEnchantSlotChance, "weight")),
        },
}),
    ],
    parameters: [
      defineMasterDataResource({
  model: GS2.enchant.RarityParameterValueModel,
  mount: EquipmentEnchantOption,
  bindings: {
          name: Bind.domainProperty(Source.direct(EquipmentEnchantOption, "id")),
          metadata: Bind.static(""),
          resourceName: Bind.domainProperty(Source.direct(EquipmentEnchantOption, "resourceName")),
          resourceValue: Bind.domainProperty(
            Source.direct(EquipmentEnchantOption, "resourceValue")
          ),
          weight: Bind.domainProperty(Source.direct(EquipmentEnchantOption, "weight")),
        },
}),
    ],
  },
});

const RerollEquipmentEnchantmentTransform = defineActionTransform("RerollEquipmentEnchantment", {
  category: "acquire",
  parameters: {
    enchant: { type: PT.ref(EquipmentEnchant) },
    propertyId: { type: PT.string() },
  },
  outputs: [
    {
    kind: "direct",
    actionName: "Gs2Enchant:ReDrawRarityParameterStatusByUserId",
    resource: () => RarityParameterModel,
    parameterMappings: {
      namespaceName: OutputMap.resourceKey(),
      userId: OutputMap.placeholder("#{userId}"),
      parameterName: OutputMap.parameter("enchant"),
      propertyId: OutputMap.parameter("propertyId"),
    },
  },
  ],
});

const AddEquipmentEnchantmentSlotTransform = defineActionTransform("AddEquipmentEnchantmentSlot", {
  category: "acquire",
  parameters: {
    enchant: { type: PT.ref(EquipmentEnchant) },
    propertyId: { type: PT.string() },
    count: { type: PT.int32() },
  },
  outputs: [
    {
    kind: "direct",
    actionName: "Gs2Enchant:AddRarityParameterStatusByUserId",
    resource: () => RarityParameterModel,
    parameterMappings: {
      namespaceName: OutputMap.resourceKey(),
      userId: OutputMap.placeholder("#{userId}"),
      parameterName: OutputMap.parameter("enchant"),
      propertyId: OutputMap.parameter("propertyId"),
      count: OutputMap.parameter("count"),
    },
  },
  ],
});

const VerifyEquipmentEnchantmentTransform = defineActionTransform("VerifyEquipmentEnchantment", {
  category: "verify",
  parameters: {
    enchant: { type: PT.ref(EquipmentEnchant) },
    propertyId: { type: PT.string() },
    option: { type: PT.ref(EquipmentEnchantOption) },
  },
  outputs: [
    {
    kind: "direct",
    actionName: "Gs2Enchant:VerifyRarityParameterStatusByUserId",
    resource: () => RarityParameterModel,
    parameterMappings: {
      namespaceName: OutputMap.resourceKey(),
      parameterName: OutputMap.parameter("enchant"),
      userId: OutputMap.placeholder("#{userId}"),
      propertyId: OutputMap.parameter("propertyId"),
      verifyType: OutputMap.static("have"),
      parameterValueName: OutputMap.parameter("option"),
      parameterCount: OutputMap.static(null),
      multiplyValueSpecifyingQuantity: OutputMap.static(false),
    },
  },
  ],
});

export const microEconomyEquipmentEnchant = definePackage({
  id: "micro-economy-equipment-enchant",
  version: "0.0.1",
  display: {
    ja: {
      label: "装備エンチャント",
      description:
        "装備にランダムな追加効果を付与します。抽選されるスロット数と効果の種類・重みを設定できます。",
    },
    en: {
      label: "Equipment Enchantment",
      description:
        "Rolls random bonuses onto equipment, with configurable slot counts, options and weights.",
    },
  },
  dependencies: {
    "foundation-economy-equipment": "github:gs2io/gs2-studio-package",
  },
  domainTypes: [EquipmentEnchant, EquipmentEnchantSlotChance, EquipmentEnchantOption, EquipmentEnchantment, Equipment],
  masterDataResources: [
    defineMasterDataResource({
  model: GS2.enchant.Namespace,
  bindings: {
        name: Bind.static("EquipmentEnchant"),
        logSetting: Bind.null(),
        transactionSettingV2: transactionSettingV2(),
      },
  children: [
    RarityParameterModel,
  ],
}),
  ],
  userDataResources: [
    defineUserDataResource({
  model: GS2.enchant.RarityParameterStatus,
  mount: Equipment,
  linkedMaster: RarityParameterModel,
  bindings: {
        // Use the dependency's PropertyId to preserve inherited identity in this overlay.
        propertyId: Bind.domainProperty(Source.direct(Equipment, EQUIPMENT_PROPERTY_ID)),
        rarityParameterStatusId: Bind.skip(),
        parameterName: Bind.skip(),
        userId: Bind.skip(),
      },
  modelArrayDecodeBindings: [
    { parameterName: "parameterValues", target: Equipment, targetListProperty: "enchantments", fieldMappings: [{ fieldName: "resourceName", targetProperty: "resourceName" }, { fieldName: "resourceValue", targetProperty: "resourceValue" }], idSourceField: "name" },
  ],
}),
  ],
  actionTransforms: [RerollEquipmentEnchantmentTransform, AddEquipmentEnchantmentSlotTransform, VerifyEquipmentEnchantmentTransform],
});

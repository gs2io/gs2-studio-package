import {
  Bind,
  defineActionTransform,
  defineDomainType,
  defineMasterDataResource,
  definePackage,
  defineUserDataResource,
  dependencyPackage,
  OutputMap,
  PT,
  Source,
  transactionSettingV2,
} from "gs2-studio-dsl";

import { GS2 } from "gs2-studio-dsl/gs2";

import { CHARACTER_LEVEL_KEY_SUFFIX } from "../../dsl/characterLevelKey";

import { jaEnField, jaEnId } from "../../dsl/jaEnField";

import characterSurface from "../../foundation-economy-character/dsl/dependency-surface.json";

const character = dependencyPackage(characterSurface);

const CHARACTER_INVENTORY_MODEL_RESOURCE_ID = character.resourceId("inventory.InventoryModel");

const CHARACTER_EXPERIENCE_MODEL_RESOURCE_ID = character.resourceId("experience.ExperienceModel");

const MATERIAL_NAMESPACE_NAME = "CharacterEnhanceMaterial";

const MATERIAL_INVENTORY_NAME = "Material";

const MATERIAL_INVENTORY_MODEL_ID = `grn:gs2:{region}:{ownerId}:inventory:${MATERIAL_NAMESPACE_NAME}:simple:model:${MATERIAL_INVENTORY_NAME}`;

export function characterEnhanceMaterialItemId(materialName: string): string {
  return `grn:gs2:{region}:{ownerId}:inventory:${MATERIAL_NAMESPACE_NAME}:user:{userId}:simple:inventory:${MATERIAL_INVENTORY_NAME}:item:${materialName}`;
}

const MATERIAL_EXPERIENCE_HIERARCHY = ["experience"];

const CharacterEnhance = defineDomainType("CharacterEnhance", {
  localizedDisplay: {
    ja: {
      label: "強化レシピ",
      description:
        "キャラクター強化のレシピを登録します。強化を実行するときはこの ID で指定します。",
    },
    en: {
      label: "Enhancement recipe",
      description:
        "Registers a character enhancement recipe; an enhancement names the recipe by this ID.",
    },
  },
  localizedProperties: {
    id: jaEnId("強化レシピ", "enhancement recipe"),
  },
});

const CharacterEnhanceMaterial = defineDomainType("CharacterEnhanceMaterial", {
  properties: {
    metadata: PT.string().masterData().required(),
    count: PT.int64().userData().required(),
  },
  localizedDisplay: {
    ja: {
      label: "強化素材",
      description: "キャラクター強化に使う素材アイテムと、1 個あたりの経験値を設定します。",
    },
    en: {
      label: "Enhancement material",
      description:
        "Configures the material items used to enhance characters and the experience each one grants.",
    },
  },
  localizedProperties: {
      id: jaEnId("強化素材", "enhancement material"),
      metadata: jaEnField(
        "素材メタデータ",
        "Material metadata",
        '素材 1 個が与える経験値を持つ JSON です。{"experience": 100} のように experience に経験値を書きます。',
        'JSON carrying the experience one material grants, written under experience, e.g. {"experience": 100}.'
      ),
      count: jaEnField(
        "所持数",
        "Owned quantity",
        "プレイヤーが所持している強化素材の数量です。",
        "Quantity of the enhancement material owned by the player.",
        { ja: "個", en: "items" }
      ),
    },
});

const CharacterEnhanceBonus = defineDomainType("CharacterEnhanceBonus", {
  properties: {
    enhance: PT.ref(CharacterEnhance).assetDelivery().required(),
    rate: PT.float32().masterData().required(),
    weight: PT.int32().masterData().required(),
  },
  localizedDisplay: {
    ja: {
      label: "大成功倍率",
      description: "キャラクター強化の成功種別ごとの発生率と経験値倍率を設定します。",
    },
    en: {
      label: "Bonus rate",
      description:
        "Configures the probability and experience multiplier for each enhancement result.",
    },
  },
  localizedProperties: {
      id: jaEnId("強化ボーナス", "enhancement bonus"),
      enhance: jaEnField(
        "強化レシピ",
        "Enhancement recipe",
        "このボーナスを適用する強化レシピです。",
        "Enhancement recipe to which this bonus applies."
      ),
      rate: jaEnField(
        "経験値倍率",
        "Experience multiplier",
        "抽選されたときに獲得経験値へ適用する倍率です。",
        "Multiplier applied to experience when this bonus is drawn.",
        { ja: "倍", en: "x" }
      ),
      weight: jaEnField(
        "抽選重み",
        "Draw weight",
        "このボーナスが選ばれる相対的な重みです。",
        "Relative weight used when drawing this bonus."
      ),
    },
});

const RateModel = defineMasterDataResource({
  model: GS2.enhance.RateModel,
  mount: CharacterEnhance,
  bindings: {
      name: Bind.domainProperty(Source.direct(CharacterEnhance, "id")),
      description: Bind.static(""),
      metadata: Bind.static(""),
      // Share the suffix with character status reads so enhancement updates the displayed level.
      acquireExperienceSuffix: Bind.static(CHARACTER_LEVEL_KEY_SUFFIX),
      acquireExperienceHierarchy: Bind.static(MATERIAL_EXPERIENCE_HIERARCHY),
      materialInventoryModelId: Bind.static(MATERIAL_INVENTORY_MODEL_ID),
    },
  grnFieldMounts: [
    { parameterName: "targetInventoryModelId", mountedResource: CHARACTER_INVENTORY_MODEL_RESOURCE_ID, keyMappings: [
      { grnKeyName: "namespaceName", sourceKeyName: "namespaceName" },
      { grnKeyName: "inventoryName", sourceKeyName: "inventoryName" },
    ] },
    { parameterName: "experienceModelId", mountedResource: CHARACTER_EXPERIENCE_MODEL_RESOURCE_ID, keyMappings: [
      { grnKeyName: "namespaceName", sourceKeyName: "namespaceName" },
      { grnKeyName: "experienceName", sourceKeyName: "experienceName" },
    ] },
  ],
  arrayChildren: {
    bonusRates: [
      defineMasterDataResource({
  model: GS2.enhance.BonusRate,
  mount: CharacterEnhanceBonus,
  bindings: {
          rate: Bind.domainProperty(Source.direct(CharacterEnhanceBonus, "rate")),
          weight: Bind.domainProperty(Source.direct(CharacterEnhanceBonus, "weight")),
        },
}),
    ],
  },
});

const MaterialItemModel = defineMasterDataResource({
  model: GS2.inventory.SimpleItemModel,
  mount: CharacterEnhanceMaterial,
  bindings: {
      name: Bind.domainProperty(Source.direct(CharacterEnhanceMaterial, "id")),
      metadata: Bind.domainProperty(Source.direct(CharacterEnhanceMaterial, "metadata")),
    },
});

const AcquireCharacterEnhanceMaterialTransform = defineActionTransform("AcquireCharacterEnhanceMaterial", {
  category: "acquire",
  parameters: {
    material: { type: PT.ref(CharacterEnhanceMaterial) },
    count: { type: PT.int32() },
  },
  outputs: [
    {
    kind: "direct",
    actionName: "Gs2Inventory:AcquireSimpleItemsByUserId",
    resource: () => MaterialItemModel,
    parameterMappings: {
      namespaceName: OutputMap.resourceKey(),
      inventoryName: OutputMap.resourceKey(),
      userId: OutputMap.placeholder("#{userId}"),
      "acquireCounts[0].itemName": OutputMap.parameter("material"),
      "acquireCounts[0].count": OutputMap.parameter("count"),
    },
  },
  ],
});

const EnhanceCharacterTransform = defineActionTransform("EnhanceCharacter", {
  category: "acquire",
  parameters: {
    enhance: { type: PT.ref(CharacterEnhance) },
    targetItemSetId: { type: PT.string() },
    materialItemSetId: { type: PT.string() },
    count: { type: PT.int32() },
  },
  outputs: [
    {
    kind: "direct",
    actionName: "Gs2Enhance:DirectEnhanceByUserId",
    resource: () => RateModel,
    parameterMappings: {
      namespaceName: OutputMap.resourceKey(),
      rateName: OutputMap.parameter("enhance"),
      userId: OutputMap.placeholder("#{userId}"),
      targetItemSetId: OutputMap.parameter("targetItemSetId"),
      "materials[0].materialItemSetId": OutputMap.parameter("materialItemSetId"),
      "materials[0].count": OutputMap.parameter("count"),
      config: OutputMap.static(null),
    },
  },
  ],
});

export const microEconomyCharacterEnhance = definePackage({
  id: "micro-economy-character-enhance",
  version: "0.0.1",
  display: {
    ja: {
      label: "キャラクター強化",
      description:
        "強化素材アイテムを消費してキャラクターに経験値を与えます。大成功の倍率も設定できます。",
    },
    en: {
      label: "Character Enhancement",
      description:
        "Enhances a character with material items, turning them into experience, with configurable bonus multipliers.",
    },
  },
  dependencies: {
    "foundation-economy-character": "github:gs2io/gs2-studio-package",
  },
  domainTypes: [CharacterEnhance, CharacterEnhanceMaterial, CharacterEnhanceBonus],
  masterDataResources: [
    defineMasterDataResource({
  model: GS2.enhance.Namespace,
  bindings: {
        name: Bind.static("CharacterEnhance"),
        transactionSettingV2: transactionSettingV2(),
      },
  children: [
    RateModel,
  ],
}),
    defineMasterDataResource({
  model: GS2.inventory.Namespace,
  bindings: {
        name: Bind.static(MATERIAL_NAMESPACE_NAME),
      },
  children: [
    defineMasterDataResource({
  model: GS2.inventory.SimpleInventoryModel,
  bindings: {
            name: Bind.static(MATERIAL_INVENTORY_NAME),
          },
  arrayChildren: {
    simpleItemModels: [
      MaterialItemModel,
    ],
  },
}),
  ],
}),
  ],
  userDataResources: [
    defineUserDataResource({
  model: GS2.inventory.SimpleItem,
  linkedMaster: MaterialItemModel,
  bindings: {
        count: Bind.domainProperties([Source.direct(CharacterEnhanceMaterial, "count")]),
        itemName: Bind.skip(),
        userId: Bind.skip(),
      },
}),
  ],
  actionTransforms: [AcquireCharacterEnhanceMaterialTransform, EnhanceCharacterTransform],
});

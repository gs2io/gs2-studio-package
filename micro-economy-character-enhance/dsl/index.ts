import {
  Bind,
  defineDomainType,
  defineMasterDataResource,
  definePackage,
  dependencyPackage,
  PT,
  Source,
  transactionSetting,
} from "~/dsl";
import { GS2 } from "~/dsl/gs2";

import { CHARACTER_LEVEL_KEY_SUFFIX } from "../../dsl/characterLevelKey";
import { jaEnField, jaEnId } from "../../dsl/jaEnField";

import characterSurface from "../../foundation-economy-character/dsl/dependency-surface.json";

// Addressed by name against the identities the dependency publishes, so a
// mistake is a compile error rather than an id that resolves to nothing.
const character = dependencyPackage(characterSurface);

/** Resources this package points at inside `foundation-economy-character`. */
const CHARACTER_INVENTORY_MODEL_RESOURCE_ID = character.resourceId("inventory.InventoryModel");
const CHARACTER_EXPERIENCE_MODEL_RESOURCE_ID = character.resourceId("experience.ExperienceModel");

/** The GS2-Inventory namespace and simple inventory holding enhancement materials. */
const MATERIAL_NAMESPACE_NAME = "CharacterEnhanceMaterial";
const MATERIAL_INVENTORY_NAME = "Material";

/**
 * The material inventory as the RateModel names it. GS2-Enhance tells a simple
 * inventory from a standard one by this GRN's form, and the catalog only knows
 * the standard `:model:` form, so it is written out here rather than mounted.
 */
const MATERIAL_INVENTORY_MODEL_ID = `grn:gs2:{region}:{ownerId}:inventory:${MATERIAL_NAMESPACE_NAME}:simple:model:${MATERIAL_INVENTORY_NAME}`;

/**
 * GRN of one material, as `EnhanceCharacter` takes it.
 *
 * The user segment is a literal `{userId}`, not the `#{userId}` placeholder.
 * GS2-Enhance never reads it for a simple material: the material is consumed
 * from the user running the enhancement, and its worth is looked up by
 * namespace, inventory and item alone. A placeholder would only be a hazard —
 * passed through a transaction config value it is left unreplaced, and the
 * `#` fails the simple item GRN pattern. GS2-Enhance normalizes `{region}` /
 * `{ownerId}` itself.
 */
export function characterEnhanceMaterialItemId(materialName: string): string {
  return `grn:gs2:{region}:{ownerId}:inventory:${MATERIAL_NAMESPACE_NAME}:user:{userId}:simple:inventory:${MATERIAL_INVENTORY_NAME}:item:${materialName}`;
}

/** Where in a material's metadata GS2-Enhance reads the experience it is worth. */
const MATERIAL_EXPERIENCE_HIERARCHY = ["experience"];

/**
 * A recipe for enhancing a character with material items: the materials are
 * consumed and the experience they are worth is added to the character's
 * level. Its id is the name of the GS2-Enhance RateModel, which is what an
 * enhancement names when it runs.
 *
 * Everything else about a recipe is fixed by the packages it joins: the target
 * is a character from `foundation-economy-character`, the materials are this
 * package's own items, and the experience lands on the character's level
 * status. So the type holds nothing but its id; the bonus draws a recipe
 * offers are `CharacterEnhanceBonus` rows that reference it.
 */
const CharacterEnhance = defineDomainType("CharacterEnhance", dt =>
  dt.localizedProperties({
    id: jaEnId("強化レシピ", "enhancement recipe"),
  })
);

/**
 * An item spent to enhance a character, and the stock a player holds of it.
 * GS2-Enhance reads a material's worth from the item's metadata JSON, at
 * `MATERIAL_EXPERIENCE_HIERARCHY`, so `metadata` has to carry it there.
 */
const CharacterEnhanceMaterial = defineDomainType("CharacterEnhanceMaterial", dt =>
  dt
    .property(
      PT.string("metadata")
        .masterData()
        .required()
        .description(
          'Item metadata JSON carrying the experience it grants, e.g. {"experience": 100}'
        )
    )
    .property(PT.int64("count").userData().required())
    .localizedProperties({
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
    })
);

/**
 * A chance for the enhancement to pay out more than it should — the "great
 * success" every upgrade screen wants. Weights are drawn against each other.
 */
const CharacterEnhanceBonus = defineDomainType("CharacterEnhanceBonus", dt =>
  dt
    .property(PT.prop("enhance", PT.ref("CharacterEnhance")).assetDelivery().required())
    .property(
      PT.float32("rate").masterData().required().description("Experience multiplier when drawn")
    )
    .property(PT.int32("weight").masterData().required().description("Relative draw weight"))
    .localizedProperties({
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
    })
);

const RateModel = defineMasterDataResource(resource =>
  resource
    .model(GS2.enhance.RateModel)
    .mountLocal(CharacterEnhance)
    .bindings({
      name: Bind.domainProperty(Source.direct(CharacterEnhance, "id")),
      description: Bind.static(""),
      metadata: Bind.static(""),
      // GS2-Enhance adds the experience to `targetItemSetId + suffix`, which is
      // the key the character package gives the level status.
      acquireExperienceSuffix: Bind.static(CHARACTER_LEVEL_KEY_SUFFIX),
      acquireExperienceHierarchy: Bind.static(MATERIAL_EXPERIENCE_HIERARCHY),
      materialInventoryModelId: Bind.static(MATERIAL_INVENTORY_MODEL_ID),
    })
    .grnFieldMount("targetInventoryModelId", CHARACTER_INVENTORY_MODEL_RESOURCE_ID, [
      { grnKeyName: "namespaceName", sourceKeyName: "namespaceName" },
      { grnKeyName: "inventoryName", sourceKeyName: "inventoryName" },
    ])
    .grnFieldMount("experienceModelId", CHARACTER_EXPERIENCE_MODEL_RESOURCE_ID, [
      { grnKeyName: "namespaceName", sourceKeyName: "namespaceName" },
      { grnKeyName: "experienceName", sourceKeyName: "experienceName" },
    ])
    .addArrayChild("bonusRates", bonusRate => {
      bonusRate
        .model(GS2.enhance.BonusRate)
        .mountLocal(CharacterEnhanceBonus)
        .bindings({
          rate: Bind.domainProperty(Source.direct(CharacterEnhanceBonus, "rate")),
          weight: Bind.domainProperty(Source.direct(CharacterEnhanceBonus, "weight")),
        });
    })
);

const MaterialItemModel = defineMasterDataResource(resource =>
  resource
    .model(GS2.inventory.SimpleItemModel)
    .mountLocal(CharacterEnhanceMaterial)
    .bindings({
      name: Bind.domainProperty(Source.direct(CharacterEnhanceMaterial, "id")),
      metadata: Bind.domainProperty(Source.direct(CharacterEnhanceMaterial, "metadata")),
    })
);

export const microEconomyCharacterEnhance = definePackage(
  "micro-economy-character-enhance",
  "0.0.0"
)
  .display({
    label: { ja: "キャラクター強化", en: "Character Enhancement" },
    description: {
      ja: "強化素材アイテムを消費してキャラクターに経験値を与えます。大成功の倍率も設定できます。",
      en: "Enhances a character with material items, turning them into experience, with configurable bonus multipliers.",
    },
  })
  .displayType(CharacterEnhance, {
    label: { ja: "強化レシピ", en: "Enhancement recipe" },
    description: {
      ja: "キャラクター強化のレシピを登録します。強化を実行するときはこの ID で指定します。",
      en: "Registers a character enhancement recipe; an enhancement names the recipe by this ID.",
    },
  })
  .displayType(CharacterEnhanceMaterial, {
    label: { ja: "強化素材", en: "Enhancement material" },
    description: {
      ja: "キャラクター強化に使う素材アイテムと、1 個あたりの経験値を設定します。",
      en: "Configures the material items used to enhance characters and the experience each one grants.",
    },
  })
  .displayType(CharacterEnhanceBonus, {
    label: { ja: "大成功倍率", en: "Bonus rate" },
    description: {
      ja: "キャラクター強化の成功種別ごとの発生率と経験値倍率を設定します。",
      en: "Configures the probability and experience multiplier for each enhancement result.",
    },
  })
  .dependency("foundation-economy-character", "github:gs2io/gs2-studio-package")
  .domainType(CharacterEnhance)
  .domainType(CharacterEnhanceMaterial)
  .domainType(CharacterEnhanceBonus)

  .masterDataResource(r =>
    r
      .model(GS2.enhance.Namespace)
      .bindings({
        name: Bind.static("CharacterEnhance"),
        transactionSetting: transactionSetting(),
      })
      .addChild(RateModel)
  )

  .masterDataResource(r =>
    r
      .model(GS2.inventory.Namespace)
      .bindings({
        name: Bind.static(MATERIAL_NAMESPACE_NAME),
      })
      .addChild(child => {
        child
          .model(GS2.inventory.SimpleInventoryModel)
          .bindings({
            name: Bind.static(MATERIAL_INVENTORY_NAME),
          })
          .addArrayChild("simpleItemModels", MaterialItemModel);
      })
  )

  .userDataResource(r =>
    r
      .model(GS2.inventory.SimpleItem)
      .linkedMasterResourceId(MaterialItemModel)
      .bindings({
        count: Bind.domainProperties([Source.direct(CharacterEnhanceMaterial, "count")]),
        itemName: Bind.skip(),
        userId: Bind.skip(),
      })
  )

  .actionTransform("AcquireCharacterEnhanceMaterial", at =>
    at
      .category("acquire")
      .parameter("material", { type: PT.ref("CharacterEnhanceMaterial") })
      .parameter("count", { type: PT.int32() })
      .output("Gs2Inventory:AcquireSimpleItemsByUserId", o =>
        o
          .resourceRef(() => MaterialItemModel)
          .mapResourceKey("namespaceName")
          .mapResourceKey("inventoryName")
          .mapPlaceholder("userId", "#{userId}")
          .mapParameter("acquireCounts[0].itemName", "material")
          .mapParameter("acquireCounts[0].count", "count")
      )
  )
  // `targetItemSetId` is the character's bare `propertyId` (its item set GRN):
  // GS2-Enhance appends the recipe's suffix itself. `materialItemSetId` is the
  // GRN of the player's stock of one material — build it with
  // `characterEnhanceMaterialItemId`. The recipe is a transform parameter
  // because the RateModel's name is per recipe, which a resource key cannot
  // resolve.
  .actionTransform("EnhanceCharacter", at =>
    at
      .category("acquire")
      .parameter("enhance", { type: PT.ref("CharacterEnhance") })
      .parameter("targetItemSetId", { type: PT.string() })
      .parameter("materialItemSetId", { type: PT.string() })
      .parameter("count", { type: PT.int32() })
      .output("Gs2Enhance:DirectEnhanceByUserId", o =>
        o
          .resourceRef(() => RateModel)
          .mapResourceKey("namespaceName")
          .mapParameter("rateName", "enhance")
          .mapPlaceholder("userId", "#{userId}")
          .mapParameter("targetItemSetId", "targetItemSetId")
          .mapParameter("materials[0].materialItemSetId", "materialItemSetId")
          .mapParameter("materials[0].count", "count")
          .mapStatic("config", null)
      )
  )

  .build();

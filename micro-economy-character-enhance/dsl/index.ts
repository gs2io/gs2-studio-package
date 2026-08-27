import { Bind, defineDomainType, defineMasterDataResource, definePackage, PT, Source } from "~/dsl";
import { GS2 } from "~/dsl/gs2";

/** Resources this package points at inside `foundation-economy-character`. */
const CHARACTER_INVENTORY_MODEL_RESOURCE_ID = "62805db8-2e40-4a2c-a1c4-38e0c07d49f8";
const CHARACTER_EXPERIENCE_MODEL_RESOURCE_ID = "8d1e96cf-5e79-4920-ada7-997eeb2776fe";

/**
 * A recipe for feeding characters to a character: the materials are consumed
 * and their worth becomes experience on the target. Characters are both the
 * target and the material, so both inventories point at the character package.
 *
 * The package stops at configuration. GS2-Enhance's actions identify the
 * target and the materials by ItemSet GRN — a runtime value an action
 * transform cannot type (transform parameters carry domain types, and a GRN is
 * neither) — so the enhance call itself is made through the generated SDK
 * rather than wrapped here.
 */
const CharacterEnhance = defineDomainType("CharacterEnhance", dt =>
  dt
    .idDescription("Unique identifier")
    .property(
      PT.string("acquireExperienceSuffix")
        .masterData()
        .required()
        .description("Item metadata suffix the granted experience is read from")
    )
);

/**
 * A chance for the enhancement to pay out more than it should — the "great
 * success" every upgrade screen wants. Weights are drawn against each other.
 */
const CharacterEnhanceBonus = defineDomainType("CharacterEnhanceBonus", dt =>
  dt
    .idDescription("Unique identifier")
    .property(PT.prop("enhance", PT.ref("CharacterEnhance")).assetDelivery().required())
    .property(
      PT.float32("rate").masterData().required().description("Experience multiplier when drawn")
    )
    .property(PT.int32("weight").masterData().required().description("Relative draw weight"))
);

const RateModel = defineMasterDataResource(resource =>
  resource
    .model(GS2.enhance.RateModel)
    .mountLocal(CharacterEnhance)
    .bindings({
      name: Bind.domainProperty(Source.direct(CharacterEnhance, "id")),
      description: Bind.static(""),
      metadata: Bind.static(""),
      acquireExperienceSuffix: Bind.domainProperty(
        Source.direct(CharacterEnhance, "acquireExperienceSuffix")
      ),
      acquireExperienceHierarchy: Bind.static([]),
    })
    .grnFieldMount("targetInventoryModelId", CHARACTER_INVENTORY_MODEL_RESOURCE_ID, [
      { grnKeyName: "namespaceName", sourceKeyName: "namespaceName" },
    ])
    .grnKeyBinding(
      "targetInventoryModelId",
      "inventoryName",
      Bind.domainProperty(Source.direct(CharacterEnhance, "id"))
    )
    .grnFieldMount("materialInventoryModelId", CHARACTER_INVENTORY_MODEL_RESOURCE_ID, [
      { grnKeyName: "namespaceName", sourceKeyName: "namespaceName" },
    ])
    .grnKeyBinding(
      "materialInventoryModelId",
      "inventoryName",
      Bind.domainProperty(Source.direct(CharacterEnhance, "id"))
    )
    .grnFieldMount("experienceModelId", CHARACTER_EXPERIENCE_MODEL_RESOURCE_ID, [
      { grnKeyName: "experienceName", sourceKeyName: "experienceName" },
    ])
    .grnKeyBinding("experienceModelId", "namespaceName", Bind.static("CharacterExperience"))
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

export const microEconomyCharacterEnhance = definePackage(
  "micro-economy-character-enhance",
  "0.0.0"
)
  .display({
    label: { ja: "キャラクター強化", en: "Character Enhancement" },
    description: {
      ja: "手持ちのキャラクターを素材にして、別のキャラクターに経験値を与えます。大成功の倍率も設定できます。",
      en: "Feeds characters to another character as material, turning them into experience, with configurable bonus multipliers.",
    },
  })
  .displayType(CharacterEnhance, { label: { ja: "強化レシピ", en: "Enhancement recipe" } })
  .displayType(CharacterEnhanceBonus, { label: { ja: "大成功倍率", en: "Bonus rate" } })
  .dependency(
    "foundation-economy-character",
    "file:../../../foundation-economy-character/packages/foundation-economy-character"
  )
  .domainType(CharacterEnhance)
  .domainType(CharacterEnhanceBonus)

  .masterDataResource(r =>
    r
      .model(GS2.enhance.Namespace)
      .bindings({
        name: Bind.static("CharacterEnhance"),
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
      .addChild(RateModel)
  )

  .build();

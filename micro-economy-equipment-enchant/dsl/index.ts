import {
  Bind,
  defineDomainType,
  defineMasterDataResource,
  defineOverlayDomainType,
  definePackage,
  PT,
  Source,
} from "~/dsl";
import { GS2 } from "~/dsl/gs2";

/** Types and properties this package points at inside `foundation-economy-equipment`. */
const EQUIPMENT_TYPE_ID = "dt_R7W960WC22J1FD8E239HDFMD8D";
const EQUIPMENT_PROPERTY_ID = "prop_S5796CZNBGWDHWSSHHT1EC00T6";

/**
 * A pool of random bonuses a piece of equipment can roll, and how many it
 * rolls. Rarity parameters are the "affix" flavour of GS2-Enchant: a weighted
 * draw of distinct options, rather than a fixed budget split across stats.
 */
const EquipmentEnchant = defineDomainType("EquipmentEnchant", dt =>
  dt
    .idDescription("Unique identifier")
    .property(
      PT.int32("maximumParameterCount")
        .masterData()
        .required()
        .description("Most bonuses a single piece can hold")
    )
);

/** How likely it is to roll exactly this many bonuses. */
const EquipmentEnchantSlotChance = defineDomainType("EquipmentEnchantSlotChance", dt =>
  dt
    .idDescription("Unique identifier")
    .property(PT.prop("enchant", PT.ref("EquipmentEnchant")).assetDelivery().required())
    .property(PT.int32("count").masterData().required().description("Number of bonuses rolled"))
    .property(PT.int32("weight").masterData().required().description("Relative draw weight"))
);

/** One bonus the pool can produce. */
const EquipmentEnchantOption = defineDomainType("EquipmentEnchantOption", dt =>
  dt
    .idDescription("Unique identifier")
    .property(PT.prop("enchant", PT.ref("EquipmentEnchant")).assetDelivery().required())
    .property(
      PT.string("resourceName").masterData().required().description("Stat this bonus applies to")
    )
    .property(PT.int64("resourceValue").masterData().required().description("How much it applies"))
    .property(PT.int32("weight").masterData().required().description("Relative draw weight"))
);

/** One bonus actually rolled onto one player's piece of equipment. */
const EquipmentEnchantment = defineDomainType("EquipmentEnchantment", dt =>
  dt
    .idDescription("Unique identifier")
    .property(PT.string("resourceName").userData().required())
    .property(PT.int64("resourceValue").userData().required())
);

/** The rolled bonuses, added to the equipment package's own type. */
const Equipment = defineOverlayDomainType(
  "Equipment",
  {
    source: {
      kind: "dependency",
      directSourcePackageId: "foundation-economy-equipment",
      directSourceTypeId: EQUIPMENT_TYPE_ID,
      sourcePackageId: "foundation-economy-equipment",
      sourceTypeId: EQUIPMENT_TYPE_ID,
    },
  },
  domainType =>
    domainType.property(
      PT.prop("enchantments", PT.listOf(PT.inline("EquipmentEnchantment"))).userData()
    )
);

const RarityParameterModel = defineMasterDataResource(resource =>
  resource
    .model(GS2.enchant.RarityParameterModel)
    .mountLocal(EquipmentEnchant)
    .bindings({
      name: Bind.domainProperty(Source.direct(EquipmentEnchant, "id")),
      metadata: Bind.static(""),
      maximumParameterCount: Bind.domainProperty(
        Source.direct(EquipmentEnchant, "maximumParameterCount")
      ),
    })
    .addArrayChild("parameterCounts", parameterCount => {
      parameterCount
        .model(GS2.enchant.RarityParameterCountModel)
        .mountLocal(EquipmentEnchantSlotChance)
        .bindings({
          count: Bind.domainProperty(Source.direct(EquipmentEnchantSlotChance, "count")),
          weight: Bind.domainProperty(Source.direct(EquipmentEnchantSlotChance, "weight")),
        });
    })
    .addArrayChild("parameters", parameter => {
      parameter
        .model(GS2.enchant.RarityParameterValueModel)
        .mountLocal(EquipmentEnchantOption)
        .bindings({
          name: Bind.domainProperty(Source.direct(EquipmentEnchantOption, "id")),
          metadata: Bind.static(""),
          resourceName: Bind.domainProperty(Source.direct(EquipmentEnchantOption, "resourceName")),
          resourceValue: Bind.domainProperty(
            Source.direct(EquipmentEnchantOption, "resourceValue")
          ),
          weight: Bind.domainProperty(Source.direct(EquipmentEnchantOption, "weight")),
        });
    })
);

export const microEconomyEquipmentEnchant = definePackage(
  "micro-economy-equipment-enchant",
  "0.0.0"
)
  .display({
    label: { ja: "装備エンチャント", en: "Equipment Enchantment" },
    description: {
      ja: "装備にランダムな追加効果を付与します。抽選されるスロット数と効果の種類・重みを設定できます。",
      en: "Rolls random bonuses onto equipment, with configurable slot counts, options and weights.",
    },
  })
  .displayType(EquipmentEnchant, { label: { ja: "エンチャント設定", en: "Enchantment pool" } })
  .displayType(EquipmentEnchantSlotChance, { label: { ja: "スロット数抽選", en: "Slot chance" } })
  .displayType(EquipmentEnchantOption, { label: { ja: "エンチャント効果", en: "Enchant option" } })
  .displayType(EquipmentEnchantment, { label: { ja: "付与済み効果", en: "Rolled bonus" } })
  .displayType(Equipment, { label: { ja: "装備", en: "Equipment" } })
  .dependency(
    "foundation-economy-equipment",
    "github:gs2io/gs2-studio-package"
  )
  .domainType(EquipmentEnchant)
  .domainType(EquipmentEnchantSlotChance)
  .domainType(EquipmentEnchantOption)
  .domainType(EquipmentEnchantment)
  .domainType(Equipment)

  .masterDataResource(r =>
    r
      .model(GS2.enchant.Namespace)
      .bindings({
        name: Bind.static("EquipmentEnchant"),
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
      .addChild(RarityParameterModel)
  )

  .userDataResource(r =>
    r
      .model(GS2.enchant.RarityParameterStatus)
      .mountLocal(Equipment)
      .linkedMasterResourceId(RarityParameterModel)
      .bindings({
        // An overlay's inherited properties have no local name, so the source
        // PropertyId is written directly.
        propertyId: Bind.domainProperty(Source.direct("Equipment", EQUIPMENT_PROPERTY_ID)),
        rarityParameterStatusId: Bind.skip(),
        parameterName: Bind.skip(),
        userId: Bind.skip(),
      })
      .modelArrayDecodeBinding(
        "parameterValues",
        Equipment,
        "enchantments",
        [
          { fieldName: "resourceName", targetPropertyName: "resourceName" },
          { fieldName: "resourceValue", targetPropertyName: "resourceValue" },
        ],
        "name"
      )
  )

  .actionTransform("RerollEquipmentEnchantment", at =>
    at
      .category("acquire")
      .parameter("enchant", { type: PT.ref("EquipmentEnchant") })
      .parameter("propertyId", { type: PT.string() })
      .output("Gs2Enchant:ReDrawRarityParameterStatusByUserId", o =>
        o
          .resourceRef(() => RarityParameterModel)
          .mapResourceKey("namespaceName")
          .mapPlaceholder("userId", "#{userId}")
          .mapParameter("parameterName", "enchant")
          .mapParameter("propertyId", "propertyId")
      )
  )
  .actionTransform("AddEquipmentEnchantmentSlot", at =>
    at
      .category("acquire")
      .parameter("enchant", { type: PT.ref("EquipmentEnchant") })
      .parameter("propertyId", { type: PT.string() })
      .parameter("count", { type: PT.int32() })
      .output("Gs2Enchant:AddRarityParameterStatusByUserId", o =>
        o
          .resourceRef(() => RarityParameterModel)
          .mapResourceKey("namespaceName")
          .mapPlaceholder("userId", "#{userId}")
          .mapParameter("parameterName", "enchant")
          .mapParameter("propertyId", "propertyId")
          .mapParameter("count", "count")
      )
  )
  .actionTransform("VerifyEquipmentEnchantment", at =>
    at
      .category("verify")
      .parameter("enchant", { type: PT.ref("EquipmentEnchant") })
      .parameter("propertyId", { type: PT.string() })
      .parameter("option", { type: PT.ref("EquipmentEnchantOption") })
      .output("Gs2Enchant:VerifyRarityParameterStatusByUserId", o =>
        o
          .resourceRef(() => RarityParameterModel)
          .mapResourceKey("namespaceName")
          .mapParameter("parameterName", "enchant")
          .mapPlaceholder("userId", "#{userId}")
          .mapParameter("propertyId", "propertyId")
          .mapStatic("verifyType", "have")
          .mapParameter("parameterValueName", "option")
          .mapStatic("parameterCount", null)
          .mapStatic("multiplyValueSpecifyingQuantity", false)
      )
  )
  .build();

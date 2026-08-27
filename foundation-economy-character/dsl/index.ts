import {
  Bind,
  defineDomainType,
  defineMasterDataResource,
  definePackage,
  PT,
  Source,
  UiCond,
} from "~/dsl";
import { GS2 } from "~/dsl/gs2";

const CharacterExperience = defineDomainType("CharacterExperience", dt =>
  dt
    .idDescription("Unique identifier")
    .singleEntry()
    .property(PT.prop("threshold", PT.listOf(PT.int64())).masterData().required())
    .property(PT.int32("defaultLevelCap").masterData().required())
    .property(PT.int32("maxLevelCap").masterData().required())
);

const Character = defineDomainType("Character", dt =>
  dt
    .idDescription("Unique identifier")
    .property(PT.int32("sort").masterData().required())
    .property(PT.string("propertyId").userData().required())
    .property(PT.int64("level").userData().required())
    .property(PT.int64("levelCap").userData().required())
    .property(PT.int64("experience").userData().required())
);

const CharacterCollection = defineDomainType("CharacterCollection", dt =>
  dt
    .idDescription("Unique identifier")
    .singleEntry()
    .property(PT.int32("maximumCapacity").masterData().required())
    .property(PT.int32("defaultCapacity").masterData().required())
    .property(PT.int32("currentCpacityUsage").userData().required())
    .property(PT.int32("currentCpacity").userData().required())
);

const ExperienceModel = defineMasterDataResource(resource =>
  resource
    .model(GS2.experience.ExperienceModel)
    .mountLocal(CharacterExperience)
    .bindings({
      name: Bind.static("Experience"),
      defaultRankCap: Bind.domainProperty(Source.direct(CharacterExperience, "defaultLevelCap")),
      maxRankCap: Bind.domainProperty(Source.direct(CharacterExperience, "maxLevelCap")),
      defaultExperience: Bind.null(),
    })
    .addArrayChild("rankThreshold", threshold => {
      threshold
        .model(GS2.experience.Threshold)
        .mountLocal(CharacterExperience)
        .bindings({
          values: Bind.domainProperty(Source.direct(CharacterExperience, "threshold")),
          metadata: Bind.null(),
        });
    })
);

const ItemModel = defineMasterDataResource(resource =>
  resource
    .model(GS2.inventory.ItemModel)
    .mountLocal(Character)
    .bindings({
      name: Bind.domainProperty(Source.direct(Character, "id")),
      sortValue: Bind.domainProperty(Source.direct(Character, "sort")),
      allowMultipleStacks: Bind.static(true),
      stackingLimit: Bind.static(1),
    })
);

const InventoryModel = defineMasterDataResource(resource =>
  resource
    .model(GS2.inventory.InventoryModel)
    .mountLocal(CharacterCollection)
    .bindings({
      name: Bind.static("Character"),
      initialCapacity: Bind.domainProperty(Source.direct(CharacterCollection, "defaultCapacity")),
      maxCapacity: Bind.domainProperty(Source.direct(CharacterCollection, "maximumCapacity")),
    })
    .addArrayChild("itemModels", ItemModel)
);

export const foundationEconomyCharacter = definePackage("foundation-economy-character", "0.0.0")
  .display({
    label: { ja: "キャラクター", en: "Characters" },
    description: {
      ja: "キャラクターの所持・レベル・経験値を扱います。",
      en: "Handles character ownership, level, and experience.",
    },
  })
  .displayType(CharacterCollection, { label: { ja: "キャラクター所持枠", en: "Character slots" } })
  .displayType(CharacterExperience, {
    label: { ja: "キャラクター経験値", en: "Character experience" },
  })
  .displayType(Character, { label: { ja: "キャラクター", en: "Character" } })
  .domainType(CharacterExperience)
  .domainType(Character)
  .domainType(CharacterCollection)

  .masterDataResource(r =>
    r
      .model(GS2.experience.Namespace)
      .bindings({
        name: Bind.static("CharacterExperience"),
        changeExperienceScript: Bind.null(),
        changeRankScript: Bind.null(),
        changeRankCapScript: Bind.null(),
        overflowExperienceScript: Bind.null(),
        rankCapScriptId: Bind.null(),
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
      .addChild(ExperienceModel)
  )

  .masterDataResource(r =>
    r
      .model(GS2.inventory.Namespace)
      .bindings({
        name: Bind.static("Character"),
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
      .model(GS2.experience.Status)
      .linkedMasterResourceId(ExperienceModel)
      .mountLocal(Character)
      .bindings({
        propertyId: Bind.domainProperty(Source.direct(Character, "propertyId")),
        rankValue: Bind.domainProperties([Source.direct(Character, "level")]),
        rankCapValue: Bind.domainProperties([Source.direct(Character, "levelCap")]),
        experienceValue: Bind.domainProperties([Source.direct(Character, "experience")]),
        experienceName: Bind.skip(),
        statusId: Bind.skip(),
        userId: Bind.skip(),
      })
  )

  .userDataResource(r =>
    r
      .model(GS2.inventory.Inventory)
      .linkedMasterResourceId(InventoryModel)
      .bindings({
        currentInventoryCapacityUsage: Bind.domainProperties([
          Source.direct(CharacterCollection, "currentCpacityUsage"),
        ]),
        currentInventoryMaxCapacity: Bind.domainProperties([
          Source.direct(CharacterCollection, "currentCpacity"),
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
      .bindings({
        count: Bind.skip(),
        inventoryName: Bind.skip(),
        itemName: Bind.skip(),
        itemSetId: Bind.domainProperties([Source.direct(Character, "propertyId")]),
        name: Bind.skip(),
        sortValue: Bind.skip(),
        userId: Bind.skip(),
      })
  )

  .actionTransform("AcquireCharacter", at =>
    at
      .category("acquire")
      .parameter("character", { type: PT.ref("Character") })
      .parameter("count", { type: PT.int32() })
      .output("Gs2Inventory:AcquireItemSetByUserId", o =>
        o
          .resourceRef(() => ItemModel)
          .mapResourceKey("namespaceName")
          .mapResourceKey("inventoryName")
          .mapParameter("itemName", "character")
          .mapPlaceholder("userId", "#{userId}")
          .mapParameter("acquireCount", "count")
          .mapStatic("expiresAt", null)
          .mapStatic("createNewItemSet", null)
          .mapStatic("itemSetName", null)
      )
  )
  .actionTransform("AddCharacterCapacity", at =>
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
  .actionTransform("AcquireCharacterExperience", at =>
    at
      .category("acquire")
      .parameter("propertyId", { type: PT.ref("Character") })
      .parameter("value", { type: PT.int32() })
      .output("Gs2Experience:AddExperienceByUserId", o =>
        o
          .resourceRef(() => ExperienceModel)
          .mapResourceKey("namespaceName")
          .mapPlaceholder("userId", "#{userId}")
          .mapStatic("experienceName", "")
          .mapParameter("propertyId", "propertyId")
          .mapParameter("experienceValue", "value")
          .mapStatic("truncateExperienceWhenRankUp", null)
      )
  )
  .actionTransform("ByeCharacter", at =>
    at
      .category("consume")
      .parameter("character", { type: PT.ref("Character") })
      .parameter("propertyId", { type: PT.string() })
      .output("Gs2Inventory:ConsumeItemSetByUserId", o =>
        o
          .resourceRef(() => ItemModel)
          .mapResourceKey("namespaceName")
          .mapResourceKey("inventoryName")
          .mapPlaceholder("userId", "#{userId}")
          .mapParameter("itemName", "character")
          .mapStatic("consumeCount", 1)
          .mapParameter("itemSetName", "propertyId")
      )
  )
  .actionTransform("IncreaseCharacterLevelCap", at =>
    at
      .category("acquire")
      .parameter("propertyId", { type: PT.ref("Character") })
      .parameter("value", { type: PT.int64() })
      .output("Gs2Experience:AddRankCapByUserId", o =>
        o
          .resourceRef(() => ExperienceModel)
          .mapResourceKey("namespaceName")
          .mapPlaceholder("userId", "#{userId}")
          .mapResourceKey("experienceName")
          .mapParameter("propertyId", "propertyId")
          .mapParameter("rankCapValue", "value")
      )
  )
  .uiComponent(Character, ui =>
    ui
      .label("LevelLabel", ui.prop("level"), { name: "Character" })
      .label("LevelCapLabel", ui.prop("levelCap"), { name: "Character" })
      .label("ExperienceLabel", ui.prop("experience"), { name: "Character" })
      .activeToggle("LevelActiveToggle", UiCond.eq(ui.prop("level"), ui.prop("levelCap")), {
        name: "CharacterReachLevelCap",
      })
      .interactable("LevelInteractable", UiCond.eq(ui.prop("level"), ui.prop("levelCap")), {
        name: "CharacterReachLevelCap",
      })
      .value("IdValue", ui.prop("id"), { name: "Character" })
      .value("PropertyIdValue", ui.prop("propertyId"), { name: "Character" })
  )
  .build();

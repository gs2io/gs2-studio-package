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

import { CHARACTER_LEVEL_KEY_SUFFIX } from "../../dsl/characterLevelKey";

import { jaEnField, jaEnId } from "../../dsl/jaEnField";

const CharacterExperience = defineDomainType("CharacterExperience", {
  singleEntry: true,
  properties: {
    threshold: PT.listOf(PT.int64()).masterData().required(),
    defaultLevelCap: PT.int32().masterData().required(),
    maxLevelCap: PT.int32().masterData().required(),
  },
  localizedDisplay: {
    ja: {
      label: "キャラクター経験値",
      description: "レベルアップに必要な経験値と、初期・最大レベル上限を設定します。",
    },
    en: {
      label: "Character experience",
      description: "Sets level-up experience thresholds and the initial and maximum level caps.",
    },
  },
  localizedProperties: {
      id: jaEnId("キャラクター経験値設定", "character experience configuration"),
      threshold: jaEnField(
        "必要経験値テーブル",
        "Experience thresholds",
        "各レベルへ到達するために必要な累積経験値です。",
        "Cumulative experience required to reach each level.",
        { ja: "経験値", en: "experience" }
      ),
      defaultLevelCap: jaEnField(
        "初期レベル上限",
        "Initial level cap",
        "キャラクターに最初に適用するレベル上限です。",
        "Initial level cap applied to a character.",
        { ja: "レベル", en: "levels" }
      ),
      maxLevelCap: jaEnField(
        "最大レベル上限",
        "Maximum level cap",
        "キャラクターが到達できるレベル上限の最大値です。",
        "Highest level cap a character can reach.",
        { ja: "レベル", en: "levels" }
      ),
    },
});

const Character = defineDomainType("Character", {
  properties: {
    sort: PT.int32().masterData().required(),
    propertyId: PT.string().userData().required(),
    level: PT.int64().userData().required(),
    levelCap: PT.int64().userData().required(),
    experience: PT.int64().userData().required(),
    nextLevelExperience: PT.int64().userData().required(),
  },
  localizedDisplay: {
    ja: {
      label: "キャラクター",
      description: "ゲームに登場するキャラクターと表示順を登録します。",
    },
    en: {
      label: "Character",
      description: "Registers the characters available in the game and their display order.",
    },
  },
  localizedProperties: {
      id: jaEnId("キャラクター", "character"),
      sort: jaEnField(
        "表示順",
        "Sort order",
        "キャラクター一覧で使用する並び順の値です。",
        "Value used to order characters in lists."
      ),
      propertyId: jaEnField(
        "キャラクター個体ID",
        "Character instance ID",
        "プレイヤーが所持するキャラクター個体の識別子です。",
        "Identifier of the character instance owned by the player."
      ),
      level: jaEnField(
        "現在レベル",
        "Current level",
        "キャラクターの現在レベルです。",
        "Current level of the character.",
        { ja: "レベル", en: "levels" }
      ),
      levelCap: jaEnField(
        "現在のレベル上限",
        "Current level cap",
        "キャラクターに現在適用されているレベル上限です。",
        "Level cap currently applied to the character.",
        { ja: "レベル", en: "levels" }
      ),
      experience: jaEnField(
        "現在経験値",
        "Current experience",
        "キャラクターが現在獲得している累積経験値です。",
        "Cumulative experience currently earned by the character.",
        { ja: "経験値", en: "experience" }
      ),
      nextLevelExperience: jaEnField(
        "次レベルまでの必要経験値",
        "Experience for the next level",
        "次のレベルに到達するために必要な累積経験値です。レベル上限に達している場合は 0 です。",
        "Cumulative experience needed to reach the next level; 0 once the level cap is reached.",
        { ja: "経験値", en: "experience" }
      ),
    },
});

const CharacterCollection = defineDomainType("CharacterCollection", {
  singleEntry: true,
  properties: {
    maximumCapacity: PT.int32().masterData().required(),
    defaultCapacity: PT.int32().masterData().required(),
    currentCpacityUsage: PT.int32().userData().required(),
    currentCpacity: PT.int32().userData().required(),
  },
  localizedDisplay: {
    ja: {
      label: "キャラクター所持枠",
      description: "プレイヤーが所持できるキャラクター数の上限と初期値を設定します。",
    },
    en: {
      label: "Character slots",
      description: "Sets the maximum and initial number of characters a player can own.",
    },
  },
  localizedProperties: {
      id: jaEnId("キャラクター所持枠", "character inventory"),
      maximumCapacity: jaEnField(
        "最大所持枠",
        "Maximum capacity",
        "拡張できるキャラクター所持枠の最大値です。",
        "Maximum character capacity a player can reach.",
        { ja: "枠", en: "slots" }
      ),
      defaultCapacity: jaEnField(
        "初期所持枠",
        "Initial capacity",
        "新規プレイヤーに付与するキャラクター所持枠です。",
        "Character capacity granted to a new player.",
        { ja: "枠", en: "slots" }
      ),
      currentCpacityUsage: jaEnField(
        "使用中の所持枠",
        "Used capacity",
        "現在キャラクターが使用している所持枠数です。",
        "Character capacity currently in use.",
        { ja: "枠", en: "slots" }
      ),
      currentCpacity: jaEnField(
        "現在の所持枠",
        "Current capacity",
        "プレイヤーが現在利用できるキャラクター所持枠です。",
        "Character capacity currently available to the player.",
        { ja: "枠", en: "slots" }
      ),
    },
});

const ExperienceModel = defineMasterDataResource({
  model: GS2.experience.ExperienceModel,
  mount: CharacterExperience,
  bindings: {
      name: Bind.static("Experience"),
      defaultRankCap: Bind.domainProperty(Source.direct(CharacterExperience, "defaultLevelCap")),
      maxRankCap: Bind.domainProperty(Source.direct(CharacterExperience, "maxLevelCap")),
      defaultExperience: Bind.null(),
    },
  arrayChildren: {
    rankThreshold: [
      defineMasterDataResource({
  model: GS2.experience.Threshold,
  mount: CharacterExperience,
  bindings: {
          values: Bind.domainProperty(Source.direct(CharacterExperience, "threshold")),
          metadata: Bind.null(),
        },
}),
    ],
  },
});

const ItemModel = defineMasterDataResource({
  model: GS2.inventory.ItemModel,
  mount: Character,
  bindings: {
      name: Bind.domainProperty(Source.direct(Character, "id")),
      sortValue: Bind.domainProperty(Source.direct(Character, "sort")),
      allowMultipleStacks: Bind.static(true),
      stackingLimit: Bind.static(1),
    },
});

const InventoryModel = defineMasterDataResource({
  model: GS2.inventory.InventoryModel,
  mount: CharacterCollection,
  bindings: {
      name: Bind.static("Character"),
      initialCapacity: Bind.domainProperty(Source.direct(CharacterCollection, "defaultCapacity")),
      maxCapacity: Bind.domainProperty(Source.direct(CharacterCollection, "maximumCapacity")),
    },
  arrayChildren: {
    itemModels: [
      ItemModel,
    ],
  },
});

const AcquireCharacterTransform = defineActionTransform("AcquireCharacter", {
  category: "acquire",
  parameters: {
    character: { type: PT.ref(Character) },
    count: { type: PT.int32() },
  },
  outputs: [
    {
    kind: "direct",
    actionName: "Gs2Inventory:AcquireItemSetByUserId",
    resource: () => ItemModel,
    parameterMappings: {
      namespaceName: OutputMap.resourceKey(),
      inventoryName: OutputMap.resourceKey(),
      itemName: OutputMap.parameter("character"),
      userId: OutputMap.placeholder("#{userId}"),
      acquireCount: OutputMap.parameter("count"),
      expiresAt: OutputMap.static(null),
      createNewItemSet: OutputMap.static(null),
      itemSetName: OutputMap.static(null),
    },
  },
  ],
});

const AddCharacterCapacityTransform = defineActionTransform("AddCharacterCapacity", {
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

const AcquireCharacterExperienceTransform = defineActionTransform("AcquireCharacterExperience", {
  category: "acquire",
  parameters: {
    propertyId: { type: PT.ref(Character) },
    value: { type: PT.int32() },
  },
  outputs: [
    {
    kind: "direct",
    actionName: "Gs2Experience:AddExperienceByUserId",
    resource: () => ExperienceModel,
    parameterMappings: {
      namespaceName: OutputMap.resourceKey(),
      userId: OutputMap.placeholder("#{userId}"),
      experienceName: OutputMap.resourceKey(),
      propertyId: OutputMap.parameter("propertyId"),
      experienceValue: OutputMap.parameter("value"),
      truncateExperienceWhenRankUp: OutputMap.static(null),
    },
  },
  ],
});

const IncreaseCharacterLevelCapTransform = defineActionTransform("IncreaseCharacterLevelCap", {
  category: "acquire",
  parameters: {
    propertyId: { type: PT.ref(Character) },
    value: { type: PT.int64() },
  },
  outputs: [
    {
    kind: "direct",
    actionName: "Gs2Experience:AddRankCapByUserId",
    resource: () => ExperienceModel,
    parameterMappings: {
      namespaceName: OutputMap.resourceKey(),
      userId: OutputMap.placeholder("#{userId}"),
      experienceName: OutputMap.resourceKey(),
      propertyId: OutputMap.parameter("propertyId"),
      rankCapValue: OutputMap.parameter("value"),
    },
  },
  ],
});

export const foundationEconomyCharacter = definePackage({
  id: "foundation-economy-character",
  version: "0.0.1",
  display: {
    ja: { label: "キャラクター", description: "キャラクターの所持・レベル・経験値を扱います。" },
    en: { label: "Characters", description: "Handles character ownership, level, and experience." },
  },
  domainTypes: [CharacterExperience, Character, CharacterCollection],
  masterDataResources: [
    defineMasterDataResource({
  model: GS2.experience.Namespace,
  bindings: {
        name: Bind.static("CharacterExperience"),
        ...Bind.nulls(
          "changeExperienceScript",
          "changeRankScript",
          "changeRankCapScript",
          "overflowExperienceScript",
          "rankCapScriptId",
          "logSetting"
        ),
        transactionSettingV2: transactionSettingV2(),
      },
  children: [
    ExperienceModel,
  ],
}),
    defineMasterDataResource({
  model: GS2.inventory.Namespace,
  bindings: {
        name: Bind.static("Character"),
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
  model: GS2.experience.Status,
  mount: Character,
  linkedMaster: ExperienceModel,
  bindings: {
        // Match the suffixed key used by enhancement so reads and experience grants address the same status.
        propertyId: Bind.domainPropertyKey(
          Source.direct(Character, "propertyId"),
          CHARACTER_LEVEL_KEY_SUFFIX
        ),
        rankValue: Bind.domainProperties([Source.direct(Character, "level")]),
        rankCapValue: Bind.domainProperties([Source.direct(Character, "levelCap")]),
        experienceValue: Bind.domainProperties([Source.direct(Character, "experience")]),
        nextRankUpExperienceValue: Bind.domainProperties([
          Source.direct(Character, "nextLevelExperience"),
        ]),
        experienceName: Bind.skip(),
        statusId: Bind.skip(),
        userId: Bind.skip(),
      },
}),
    defineUserDataResource({
  model: GS2.inventory.Inventory,
  linkedMaster: InventoryModel,
  bindings: {
        currentInventoryCapacityUsage: Bind.domainProperties([
          Source.direct(CharacterCollection, "currentCpacityUsage"),
        ]),
        currentInventoryMaxCapacity: Bind.domainProperties([
          Source.direct(CharacterCollection, "currentCpacity"),
        ]),
        inventoryId: Bind.skip(),
        inventoryName: Bind.skip(),
        userId: Bind.skip(),
      },
}),
    defineUserDataResource({
  model: GS2.inventory.ItemSet,
  linkedMaster: ItemModel,
  bindings: {
        count: Bind.skip(),
        inventoryName: Bind.skip(),
        itemName: Bind.skip(),
        itemSetId: Bind.domainProperties([Source.direct(Character, "propertyId")]),
        name: Bind.skip(),
        sortValue: Bind.skip(),
        userId: Bind.skip(),
      },
}),
  ],
  actionTransforms: [AcquireCharacterTransform, AddCharacterCapacityTransform, AcquireCharacterExperienceTransform, IncreaseCharacterLevelCapTransform],
  uiComponents: [
    defineUiComponent(Character, {
  items: [
    UiItem.templateLabel("LevelLabel", "{level}/{levelCap}", { level: UiSource.prop("level"), levelCap: UiSource.prop("levelCap") }, { name: "Character" }),
    UiItem.gauge("ExperienceGauge", UiSource.prop("experience"), UiSource.bandUpper(CharacterExperience, "threshold", UiSource.prop("experience")), {
          name: "Character",
          clamp: true,
          min: UiSource.bandLower(CharacterExperience, "threshold", UiSource.prop("experience")),
        }),
    UiItem.activeToggle("LevelActiveToggle", UiCond.eq(UiSource.prop("level"), UiSource.prop("levelCap")), {
        name: "CharacterReachLevelCap",
      }),
    UiItem.interactable("LevelInteractable", UiCond.eq(UiSource.prop("level"), UiSource.prop("levelCap")), {
        name: "CharacterReachLevelCap",
      }),
    UiItem.value("IdValue", UiSource.prop("id"), { name: "Character" }),
    UiItem.value("PropertyIdValue", UiSource.prop("propertyId"), { name: "Character" }),
  ],
}),
  ],
});

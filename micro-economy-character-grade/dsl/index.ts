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

import { CHARACTER_LEVEL_KEY_SUFFIX } from "../../dsl/characterLevelKey";

import { jaEnField, jaEnId } from "../../dsl/jaEnField";

import characterSurface from "../../foundation-economy-character/dsl/dependency-surface.json";

const character = dependencyPackage(characterSurface);

const CHARACTER_PROPERTY_ID = character.propertyId("Character", "propertyId");

const CHARACTER_EXPERIENCE_MODEL_RESOURCE_ID = character.resourceId("experience.ExperienceModel");

const CharacterGradeStep = defineDomainType("CharacterGradeStep", {
  properties: {
    rankCapValue: PT.int64().masterData().required(),
    propertyIdRegex: PT.string().masterData().required(),
    gradeUpPropertyIdRegex: PT.string().masterData().required(),
  },
  localizedDisplay: {
    ja: {
      label: "グレード段階",
      description: "対象キャラクターの条件、グレードアップ先、ランク上限を設定します。",
    },
    en: {
      label: "Grade step",
      description:
        "Defines eligible characters, the grade-up target, and rank cap for a grade step.",
    },
  },
  localizedProperties: {
      id: jaEnId("グレード段階", "grade step"),
      rankCapValue: jaEnField(
        "レベル上限",
        "Level cap",
        "このグレードで到達可能になるレベル上限です。",
        "Level cap unlocked by this grade.",
        { ja: "レベル", en: "levels" }
      ),
      propertyIdRegex: jaEnField(
        "対象キャラクター条件",
        "Target character pattern",
        "このグレード段階を適用できるキャラクターの正規表現です。照合対象はキャラクター個体ID（アイテムセットの GRN）にレベル用の接尾辞 `:level` を付けた値です。",
        "Regular expression matching characters eligible for this grade. It is matched against the character instance ID (its item set GRN) with the level suffix `:level` appended."
      ),
      gradeUpPropertyIdRegex: jaEnField(
        "素材キャラクター条件",
        "Material character pattern",
        "グレードアップ素材として消費できるキャラクターの正規表現です。照合対象はキャラクター個体ID（アイテムセットの GRN）にレベル用の接尾辞 `:level` を付けた値です。",
        "Regular expression matching characters that may be consumed for grade-up. It is matched against the character instance ID (its item set GRN) with the level suffix `:level` appended."
      ),
    },
});

const Character = defineOverlayDomainType("Character", character.overlay("Character"), {
  properties: {
    grade: PT.int64().userData().required(),
  },
  localizedDisplay: {
    ja: {
      label: "キャラクター",
      description: "プレイヤーが所持するキャラクターごとの現在グレードを管理します。",
    },
    en: {
      label: "Character",
      description: "Tracks the current grade of each character owned by a player.",
    },
  },
  localizedProperties: {
    grade: jaEnField(
      "現在グレード",
      "Current grade",
      "キャラクターが現在到達しているグレードです。",
      "Current grade reached by the character.",
      { ja: "段階", en: "grades" }
    ),
  },
});

const GradeModel = defineMasterDataResource({
  model: GS2.grade.GradeModel,
  bindings: {
      name: Bind.static("CharacterGrade"),
      metadata: Bind.static(""),
    },
  grnFieldMounts: [
    { parameterName: "experienceModelId", mountedResource: CHARACTER_EXPERIENCE_MODEL_RESOURCE_ID, keyMappings: [
      { grnKeyName: "namespaceName", sourceKeyName: "namespaceName" },
      { grnKeyName: "experienceName", sourceKeyName: "experienceName" },
    ] },
  ],
  arrayChildren: {
    gradeEntries: [
      defineMasterDataResource({
  model: GS2.grade.GradeEntryModel,
  mount: CharacterGradeStep,
  bindings: {
          metadata: Bind.static(""),
          rankCapValue: Bind.domainProperty(Source.direct(CharacterGradeStep, "rankCapValue")),
          propertyIdRegex: Bind.domainProperty(
            Source.direct(CharacterGradeStep, "propertyIdRegex")
          ),
          gradeUpPropertyIdRegex: Bind.domainProperty(
            Source.direct(CharacterGradeStep, "gradeUpPropertyIdRegex")
          ),
        },
}),
    ],
  },
});

const PromoteCharacterGradeTransform = defineActionTransform("PromoteCharacterGrade", {
  category: "acquire",
  parameters: {
    propertyId: { type: PT.string() },
    gradeValue: { type: PT.int64() },
  },
  outputs: [
    {
    kind: "direct",
    actionName: "Gs2Grade:AddGradeByUserId",
    resource: () => GradeModel,
    parameterMappings: {
      namespaceName: OutputMap.resourceKey(),
      userId: OutputMap.placeholder("#{userId}"),
      gradeName: OutputMap.resourceKey(),
      propertyId: OutputMap.parameter("propertyId"),
      gradeValue: OutputMap.parameter("gradeValue"),
    },
  },
  ],
});

const ApplyCharacterGradeRankCapTransform = defineActionTransform("ApplyCharacterGradeRankCap", {
  category: "acquire",
  parameters: {
    propertyId: { type: PT.string() },
  },
  outputs: [
    {
    kind: "direct",
    actionName: "Gs2Grade:ApplyRankCapByUserId",
    resource: () => GradeModel,
    parameterMappings: {
      namespaceName: OutputMap.resourceKey(),
      userId: OutputMap.placeholder("#{userId}"),
      gradeName: OutputMap.resourceKey(),
      propertyId: OutputMap.parameter("propertyId"),
    },
  },
  ],
});

const VerifyCharacterGradeReachedTransform = defineActionTransform("VerifyCharacterGradeReached", {
  category: "verify",
  parameters: {
    propertyId: { type: PT.string() },
    gradeValue: { type: PT.int64() },
  },
  outputs: [
    {
    kind: "direct",
    actionName: "Gs2Grade:VerifyGradeByUserId",
    resource: () => GradeModel,
    parameterMappings: {
      namespaceName: OutputMap.resourceKey(),
      userId: OutputMap.placeholder("#{userId}"),
      gradeName: OutputMap.resourceKey(),
      verifyType: OutputMap.static("greaterEqual"),
      propertyId: OutputMap.parameter("propertyId"),
      gradeValue: OutputMap.parameter("gradeValue"),
      multiplyValueSpecifyingQuantity: OutputMap.static(false),
    },
  },
  ],
});

export const microEconomyCharacterGrade = definePackage({
  id: "micro-economy-character-grade",
  version: "0.0.1",
  display: {
    ja: {
      label: "キャラクター限界突破",
      description:
        "キャラクターのグレードを上げてレベル上限を引き上げます。段階ごとに上限値と対象キャラクターを設定できます。",
    },
    en: {
      label: "Character Grades",
      description:
        "Promotes a character through grades, each raising its level cap, with per-step caps and eligibility.",
    },
  },
  dependencies: {
    "foundation-economy-character": "github:gs2io/gs2-studio-package",
  },
  domainTypes: [CharacterGradeStep, Character],
  masterDataResources: [
    defineMasterDataResource({
  model: GS2.grade.Namespace,
  bindings: {
        name: Bind.static("CharacterGrade"),
        ...Bind.nulls("changeGradeScript", "logSetting"),
        transactionSettingV2: transactionSettingV2(),
      },
  children: [
    GradeModel,
  ],
}),
  ],
  userDataResources: [
    defineUserDataResource({
  model: GS2.grade.Status,
  mount: Character,
  linkedMaster: GradeModel,
  bindings: {
        gradeValue: Bind.domainProperties([Source.direct(Character, "grade")]),
        // Preserve the inherited PropertyId and level suffix so grade updates and character experience reads use the same status key.
        propertyId: Bind.domainPropertyKey(
          Source.direct(Character, CHARACTER_PROPERTY_ID),
          CHARACTER_LEVEL_KEY_SUFFIX
        ),
        statusId: Bind.skip(),
        gradeName: Bind.skip(),
        userId: Bind.skip(),
      },
}),
  ],
  actionTransforms: [PromoteCharacterGradeTransform, ApplyCharacterGradeRankCapTransform, VerifyCharacterGradeReachedTransform],
});

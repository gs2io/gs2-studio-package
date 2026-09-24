import {
  Bind,
  defineDomainType,
  defineMasterDataResource,
  defineOverlayDomainType,
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

/** Resources and properties this package points at inside `foundation-economy-character`. */
const CHARACTER_PROPERTY_ID = character.propertyId("Character", "propertyId");
const CHARACTER_EXPERIENCE_MODEL_RESOURCE_ID = character.resourceId("experience.ExperienceModel");

/**
 * A grade a character can be promoted to, and the level cap that promotion
 * buys. Grades are what "limit break" screens move through: each step raises
 * the cap the experience package will then let the character level towards.
 */
const CharacterGradeStep = defineDomainType("CharacterGradeStep", dt =>
  dt
    .property(
      PT.int64("rankCapValue")
        .masterData()
        .required()
        .description("Level cap this grade raises the character to")
    )
    .property(
      PT.string("propertyIdRegex")
        .masterData()
        .required()
        .description("Which characters this step applies to")
    )
    .property(
      PT.string("gradeUpPropertyIdRegex")
        .masterData()
        .required()
        .description("Which characters may be spent to reach it")
    )
    .localizedProperties({
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
    })
);

/** The character's current grade, added to the character package's own type. */
const Character = defineOverlayDomainType("Character", character.overlay("Character"), domainType =>
  domainType
    .property(PT.int64("grade").userData().required().description("Grades promoted so far"))
    .localizedProperties({
      grade: jaEnField(
        "現在グレード",
        "Current grade",
        "キャラクターが現在到達しているグレードです。",
        "Current grade reached by the character.",
        { ja: "段階", en: "grades" }
      ),
    })
);

const GradeModel = defineMasterDataResource(resource =>
  resource
    .model(GS2.grade.GradeModel)
    .bindings({
      name: Bind.static("CharacterGrade"),
      metadata: Bind.static(""),
    })
    .grnFieldMount("experienceModelId", CHARACTER_EXPERIENCE_MODEL_RESOURCE_ID, [
      { grnKeyName: "namespaceName", sourceKeyName: "namespaceName" },
      { grnKeyName: "experienceName", sourceKeyName: "experienceName" },
    ])
    .addArrayChild("gradeEntries", gradeEntry => {
      gradeEntry
        .model(GS2.grade.GradeEntryModel)
        .mountLocal(CharacterGradeStep)
        .bindings({
          metadata: Bind.static(""),
          rankCapValue: Bind.domainProperty(Source.direct(CharacterGradeStep, "rankCapValue")),
          propertyIdRegex: Bind.domainProperty(
            Source.direct(CharacterGradeStep, "propertyIdRegex")
          ),
          gradeUpPropertyIdRegex: Bind.domainProperty(
            Source.direct(CharacterGradeStep, "gradeUpPropertyIdRegex")
          ),
        });
    })
);

export const microEconomyCharacterGrade = definePackage("micro-economy-character-grade", "0.0.0")
  .display({
    label: { ja: "キャラクター限界突破", en: "Character Grades" },
    description: {
      ja: "キャラクターのグレードを上げてレベル上限を引き上げます。段階ごとに上限値と対象キャラクターを設定できます。",
      en: "Promotes a character through grades, each raising its level cap, with per-step caps and eligibility.",
    },
  })
  .displayType(CharacterGradeStep, {
    label: { ja: "グレード段階", en: "Grade step" },
    description: {
      ja: "対象キャラクターの条件、グレードアップ先、ランク上限を設定します。",
      en: "Defines eligible characters, the grade-up target, and rank cap for a grade step.",
    },
  })
  .displayType(Character, {
    label: { ja: "キャラクター", en: "Character" },
    description: {
      ja: "プレイヤーが所持するキャラクターごとの現在グレードを管理します。",
      en: "Tracks the current grade of each character owned by a player.",
    },
  })
  .dependency("foundation-economy-character", "github:gs2io/gs2-studio-package")
  .domainType(CharacterGradeStep)
  .domainType(Character)

  .masterDataResource(r =>
    r
      .model(GS2.grade.Namespace)
      .bindings({
        name: Bind.static("CharacterGrade"),
        ...Bind.nulls("changeGradeScript", "logSetting"),
        transactionSetting: transactionSetting(),
      })
      .addChild(GradeModel)
  )

  .userDataResource(r =>
    r
      .model(GS2.grade.Status)
      .mountLocal(Character)
      .linkedMasterResourceId(GradeModel)
      .bindings({
        gradeValue: Bind.domainProperties([Source.direct(Character, "grade")]),
        // An overlay's inherited properties have no local name, so the source
        // PropertyId is written directly. GS2-Grade applies a rank cap to the
        // experience status with this same key, so it carries the level suffix.
        propertyId: Bind.domainPropertyKey(
          Source.direct("Character", CHARACTER_PROPERTY_ID),
          CHARACTER_LEVEL_KEY_SUFFIX
        ),
        statusId: Bind.skip(),
        gradeName: Bind.skip(),
        userId: Bind.skip(),
      })
  )

  // Every grade transform takes the grade status key, which is the level
  // status key (the character's `propertyId` plus the level suffix): GS2-Grade
  // hands it unchanged to the experience status when it applies a rank cap.
  .actionTransform("PromoteCharacterGrade", at =>
    at
      .category("acquire")
      .parameter("propertyId", { type: PT.string() })
      .parameter("gradeValue", { type: PT.int64() })
      .output("Gs2Grade:AddGradeByUserId", o =>
        o
          .resourceRef(() => GradeModel)
          .mapResourceKey("namespaceName")
          .mapPlaceholder("userId", "#{userId}")
          .mapResourceKey("gradeName")
          .mapParameter("propertyId", "propertyId")
          .mapParameter("gradeValue", "gradeValue")
      )
  )
  .actionTransform("ApplyCharacterGradeRankCap", at =>
    at
      .category("acquire")
      .parameter("propertyId", { type: PT.string() })
      .output("Gs2Grade:ApplyRankCapByUserId", o =>
        o
          .resourceRef(() => GradeModel)
          .mapResourceKey("namespaceName")
          .mapPlaceholder("userId", "#{userId}")
          .mapResourceKey("gradeName")
          .mapParameter("propertyId", "propertyId")
      )
  )
  .actionTransform("VerifyCharacterGradeReached", at =>
    at
      .category("verify")
      .parameter("propertyId", { type: PT.string() })
      .parameter("gradeValue", { type: PT.int64() })
      .output("Gs2Grade:VerifyGradeByUserId", o =>
        o
          .resourceRef(() => GradeModel)
          .mapResourceKey("namespaceName")
          .mapPlaceholder("userId", "#{userId}")
          .mapResourceKey("gradeName")
          .mapStatic("verifyType", "greaterEqual")
          .mapParameter("propertyId", "propertyId")
          .mapParameter("gradeValue", "gradeValue")
          .mapStatic("multiplyValueSpecifyingQuantity", false)
      )
  )
  .build();

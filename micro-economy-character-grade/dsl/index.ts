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

/** Resources and properties this package points at inside `foundation-economy-character`. */
const CHARACTER_TYPE_ID = "dt_RJSJ8JFQJXEWGQDWXMPKAW04Y5";
const CHARACTER_PROPERTY_ID = "prop_37JJ37ED8GWPZH1A1H4P7DJ5KD";
const CHARACTER_EXPERIENCE_MODEL_RESOURCE_ID = "8d1e96cf-5e79-4920-ada7-997eeb2776fe";

/**
 * A grade a character can be promoted to, and the level cap that promotion
 * buys. Grades are what "limit break" screens move through: each step raises
 * the cap the experience package will then let the character level towards.
 */
const CharacterGradeStep = defineDomainType("CharacterGradeStep", dt =>
  dt
    .idDescription("Unique identifier")
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
);

/** The character's current grade, added to the character package's own type. */
const Character = defineOverlayDomainType(
  "Character",
  {
    source: {
      kind: "dependency",
      directSourcePackageId: "foundation-economy-character",
      directSourceTypeId: CHARACTER_TYPE_ID,
      sourcePackageId: "foundation-economy-character",
      sourceTypeId: CHARACTER_TYPE_ID,
    },
  },
  domainType =>
    domainType.property(
      PT.int64("grade").userData().required().description("Grades promoted so far")
    )
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
  .displayType(CharacterGradeStep, { label: { ja: "グレード段階", en: "Grade step" } })
  .displayType(Character, { label: { ja: "キャラクター", en: "Character" } })
  .dependency(
    "foundation-economy-character",
    "github:gs2io/gs2-studio-package"
  )
  .domainType(CharacterGradeStep)
  .domainType(Character)

  .masterDataResource(r =>
    r
      .model(GS2.grade.Namespace)
      .bindings({
        name: Bind.static("CharacterGrade"),
        changeGradeScript: Bind.null(),
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
        // PropertyId is written directly.
        propertyId: Bind.domainProperty(Source.direct("Character", CHARACTER_PROPERTY_ID)),
        statusId: Bind.skip(),
        gradeName: Bind.skip(),
        userId: Bind.skip(),
      })
  )

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

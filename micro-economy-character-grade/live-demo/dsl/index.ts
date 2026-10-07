import {
  Arg,
  Bind,
  defineMasterDataResource,
  definePackage,
  dependencyPackage,
  Source,
  transactionSetting,
  UiCond,
} from "~/dsl";
import { GS2 } from "~/dsl/gs2";

import { CHARACTER_LEVEL_KEY_PLACEHOLDER } from "../../../dsl/characterLevelKey";
import gradeSurface from "../../dsl/dependency-surface.json";
import characterDemoSurface from "../../../foundation-economy-character/live-demo/dsl/dependency-surface.json";
import characterSurface from "../../../foundation-economy-character/dsl/dependency-surface.json";

const grade = dependencyPackage(gradeSurface);
const character = dependencyPackage(characterSurface);
const characterDemo = dependencyPackage(characterDemoSurface);

const Character = grade.type("Character");
const CharacterGradeStep = grade.type("CharacterGradeStep");

const GRADE = grade.propertyId("Character", "grade");
const LEVEL = character.propertyId("Character", "level");
const LEVEL_CAP = character.propertyId("Character", "levelCap");
const PROPERTY_ID = character.propertyId("Character", "propertyId");

/** Keep the grade caps within the shared character curve, starting at its default cap. */
const GRADE_CAPS = [10, 20, 30] as const;

const MAX_GRADE = GRADE_CAPS.length;

/** Keep the experience grant large enough to demonstrate successive caps in a few presses. */
const TRAIN_HARD_EXPERIENCE = 1000;

/** Supply the instance id at click time because the owned character does not exist at deployment; grade and experience address the same suffixed status key. */
const LimitBreakRateModel = defineMasterDataResource(resource =>
  resource
    .model(GS2.exchange.RateModel)
    .mountLocal(Character)
    .bindings({ name: Bind.domainProperty(Source.direct(Character, "id")) })
    .addArrayChild("acquireActions", acquireAction => {
      acquireAction
        .model(GS2.transaction.AcquireAction)
        .mountLocal(Character)
        .bindings({
          action: Bind.transform(grade.packageId, "PromoteCharacterGrade", [
            Arg.placeholder("propertyId", CHARACTER_LEVEL_KEY_PLACEHOLDER),
            Arg.static("gradeValue", 1),
          ]),
        });
    })
);

const TrainHardRateModel = defineMasterDataResource(resource =>
  resource
    .model(GS2.exchange.RateModel)
    .mountLocal(Character)
    .bindings({ name: Bind.domainProperty(Source.direct(Character, "id")) })
    .addArrayChild("acquireActions", acquireAction => {
      acquireAction
        .model(GS2.transaction.AcquireAction)
        .mountLocal(Character)
        .bindings({
          action: Bind.transform(character.packageId, "AcquireCharacterExperience", [
            Arg.placeholder("propertyId", CHARACTER_LEVEL_KEY_PLACEHOLDER),
            Arg.static("value", TRAIN_HARD_EXPERIENCE),
          ]),
        });
    })
);

function gradeStep(rankCapValue: number) {
  return { rankCapValue, propertyIdRegex: ".*", gradeUpPropertyIdRegex: ".*" };
}

const PROPERTY_ID_CONFIG = {
  kind: "listEntries",
  parameterName: "config",
  entries: [
    {
      kind: "fields",
      fields: [
        { name: "key", source: { kind: "static", value: "propertyId" } },
        { name: "value", source: { kind: "domainProperty", propertyName: PROPERTY_ID } },
      ],
    },
  ],
} as const;

export const microEconomyCharacterGradeDemo = definePackage(
  "micro-economy-character-grade-demo",
  "0.0.0"
)
  .display({
    label: { ja: "キャラクター限界突破（デモデータ）", en: "Character Grades (demo data)" },
    description: {
      ja: "ライブデモ用の限界突破の段階表と、限界突破・強い訓練の操作を提供します。",
      en: "Supplies the grade steps the live demo raises through, and the presses that train and break the limit.",
    },
  })
  .dependency(grade.packageId, "github:gs2io/gs2-studio-package")
  // Declare the character package because training directly calls its AcquireCharacterExperience transform.
  .dependency(character.packageId, "github:gs2io/gs2-studio-package")
  // Reuse the shared roster and level curve so this demo cannot deploy conflicting character content.
  .dependency(characterDemo.packageId, "github:gs2io/gs2-studio-package")

  // Grade rows use lexical id order; pad ids before a tenth grade would sort ahead of grade2.
  .instance(CharacterGradeStep, "grade1", gradeStep(GRADE_CAPS[0]))
  .instance(CharacterGradeStep, "grade2", gradeStep(GRADE_CAPS[1]))
  .instance(CharacterGradeStep, "grade3", gradeStep(GRADE_CAPS[2]))

  .masterDataResource(resource =>
    resource
      .model(GS2.exchange.Namespace)
      .bindings({
        name: Bind.static("CharacterLimitBreak"),
        ...Bind.nulls(
          "acquireAwaitScript",
          "exchangeScript",
          "incrementalExchangeScript",
          "logSetting"
        ),
        // Auto-run executes the transaction without a second client request after the exchange.
        transactionSetting: transactionSetting({
          enableAtomicCommit: Bind.static(true),
          enableAutoRun: Bind.static(true),
        }),
      })
      .addChild(LimitBreakRateModel)
  )
  .masterDataResource(resource =>
    resource
      .model(GS2.exchange.Namespace)
      .bindings({
        name: Bind.static("CharacterGradeTrain"),
        ...Bind.nulls(
          "acquireAwaitScript",
          "exchangeScript",
          "incrementalExchangeScript",
          "logSetting"
        ),
        transactionSetting: transactionSetting({
          enableAtomicCommit: Bind.static(true),
          enableAutoRun: Bind.static(true),
        }),
      })
      .addChild(TrainHardRateModel)
  )

  .uiComponent(Character, ui =>
    ui
      .templateLabel(
        "GradeLabel",
        "Grade {grade}",
        { grade: ui.inheritedProp(GRADE) },
        { name: "Character" }
      )
      // Combine cap and remaining-grade checks in one interactable because two components would overwrite the same button flag.
      .interactable(
        "LimitBreakInteractable",
        UiCond.and(
          UiCond.eq(ui.inheritedProp(LEVEL), ui.inheritedProp(LEVEL_CAP)),
          UiCond.lt(ui.inheritedProp(GRADE), ui.lit(MAX_GRADE))
        ),
        { name: "Character" }
      )
      .buttonAction("LimitBreakButton", "LimitBreak", undefined, { name: "Character" })
      .buttonAction("TrainHardButton", "TrainHard", undefined, { name: "Character" })
  )

  .delegatedAction(Character, "LimitBreak", {
    targetActionKey: "Gs2Exchange:RateModel.Exchange",
    targetResource: LimitBreakRateModel,
    parameterOverrides: [{ kind: "static", parameterName: "count", value: 1 }, PROPERTY_ID_CONFIG],
  })
  .delegatedAction(Character, "TrainHard", {
    targetActionKey: "Gs2Exchange:RateModel.Exchange",
    targetResource: TrainHardRateModel,
    parameterOverrides: [{ kind: "static", parameterName: "count", value: 1 }, PROPERTY_ID_CONFIG],
  })
  .build();

import {
  ActionProgram,
  Arg,
  Bind,
  defineMasterDataResource,
  definePackage,
  defineUiComponent,
  dependencyPackage,
  instance,
  Source,
  transactionSettingV2,
  UiCond,
  UiItem,
  UiSource,
} from "gs2-studio-dsl";

import { GS2 } from "gs2-studio-dsl/gs2";

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

const GRADE_CAPS = [10, 20, 30] as const;

const MAX_GRADE = GRADE_CAPS.length;

const TRAIN_HARD_EXPERIENCE = 1000;

const LimitBreakRateModel = defineMasterDataResource({
  model: GS2.exchange.RateModel,
  mount: Character,
  bindings: { name: Bind.domainProperty(Source.direct(Character, "id")) },
  arrayChildren: {
    acquireActions: [
      defineMasterDataResource({
  model: GS2.transaction.AcquireAction,
  mount: Character,
  actionProgram: ActionProgram.transform(grade.packageId, grade.transformId("PromoteCharacterGrade"), [
            Arg.placeholder("propertyId", CHARACTER_LEVEL_KEY_PLACEHOLDER),
            Arg.static("gradeValue", 1),
          ]),
}),
    ],
  },
});

const TrainHardRateModel = defineMasterDataResource({
  model: GS2.exchange.RateModel,
  mount: Character,
  bindings: { name: Bind.domainProperty(Source.direct(Character, "id")) },
  arrayChildren: {
    acquireActions: [
      defineMasterDataResource({
  model: GS2.transaction.AcquireAction,
  mount: Character,
  actionProgram: ActionProgram.transform(
            character.packageId,
            character.transformId("AcquireCharacterExperience"),
            [
              Arg.placeholder("propertyId", CHARACTER_LEVEL_KEY_PLACEHOLDER),
              Arg.static("value", TRAIN_HARD_EXPERIENCE),
            ]
          ),
}),
    ],
  },
});

function gradeStep(rankCapValue: number) {
  return { rankCapValue, propertyIdRegex: ".*", gradeUpPropertyIdRegex: ".*" };
}

const PROPERTY_ID_CONFIG = {
  parameterName: "config",
  source: {
    kind: "listEntries",

    entries: [
      {
        kind: "fields",
        fields: [
          { name: "key", source: { kind: "static", value: "propertyId" } },
          { name: "value", source: { kind: "domainProperty", propertyName: PROPERTY_ID } },
        ],
      },
    ],
  },
} as const;

export const microEconomyCharacterGradeDemo = definePackage({
  id: "micro-economy-character-grade-demo",
  version: "0.0.1",
  display: {
    ja: {
      label: "キャラクター限界突破（デモデータ）",
      description: "ライブデモ用の限界突破の段階表と、限界突破・強い訓練の操作を提供します。",
    },
    en: {
      label: "Character Grades (demo data)",
      description:
        "Supplies the grade steps the live demo raises through, and the presses that train and break the limit.",
    },
  },
  dependencies: {
    [grade.packageId]: "github:gs2io/gs2-studio-package",
    [character.packageId]: "github:gs2io/gs2-studio-package",
    [characterDemo.packageId]: "github:gs2io/gs2-studio-package",
  },
  instances: [
    instance(CharacterGradeStep, "grade1", gradeStep(GRADE_CAPS[0])),
    instance(CharacterGradeStep, "grade2", gradeStep(GRADE_CAPS[1])),
    instance(CharacterGradeStep, "grade3", gradeStep(GRADE_CAPS[2])),
  ],
  delegatedActions: [
    { target: Character, methodName: "LimitBreak", action: { targetActionKey: "Gs2Exchange:RateModel.Exchange", targetResource: LimitBreakRateModel, parameterOverrides: [
      { parameterName: "count", source: { kind: "static", value: 1 } },
      PROPERTY_ID_CONFIG,
    ] } },
    { target: Character, methodName: "TrainHard", action: { targetActionKey: "Gs2Exchange:RateModel.Exchange", targetResource: TrainHardRateModel, parameterOverrides: [
      { parameterName: "count", source: { kind: "static", value: 1 } },
      PROPERTY_ID_CONFIG,
    ] } },
  ],
  masterDataResources: [
    defineMasterDataResource({
  model: GS2.exchange.Namespace,
  bindings: {
        name: Bind.static("CharacterLimitBreak"),
        ...Bind.nulls(
          "acquireAwaitScript",
          "exchangeScript",
          "incrementalExchangeScript",
          "logSetting"
        ),
        // Auto-run executes the transaction without a second client request after the exchange.
        transactionSettingV2: transactionSettingV2(),
      },
  children: [
    LimitBreakRateModel,
  ],
}),
    defineMasterDataResource({
  model: GS2.exchange.Namespace,
  bindings: {
        name: Bind.static("CharacterGradeTrain"),
        ...Bind.nulls(
          "acquireAwaitScript",
          "exchangeScript",
          "incrementalExchangeScript",
          "logSetting"
        ),
        transactionSettingV2: transactionSettingV2(),
      },
  children: [
    TrainHardRateModel,
  ],
}),
  ],
  uiComponents: [
    defineUiComponent(Character, {
  items: [
    UiItem.templateLabel("GradeLabel", "Grade {grade}", { grade: UiSource.inheritedProp(GRADE) }, { name: "Character" }),
    UiItem.interactable("LimitBreakInteractable", UiCond.and(
          UiCond.eq(UiSource.inheritedProp(LEVEL), UiSource.inheritedProp(LEVEL_CAP)),
          UiCond.lt(UiSource.inheritedProp(GRADE), UiSource.lit(MAX_GRADE))
        ), { name: "Character" }),
    UiItem.buttonAction("LimitBreakButton", "LimitBreak", undefined, { name: "Character" }),
    UiItem.buttonAction("TrainHardButton", "TrainHard", undefined, { name: "Character" }),
  ],
}),
  ],
});

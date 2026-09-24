/**
 * Live demo content for `micro-economy-character-grade`.
 *
 * A limit break raises how far a character can level. What is worth watching
 * is the cap moving: a character trained to 10/10 stops gaining levels, one
 * press later it reads 10/20, and training carries it past 10.
 *
 * The feature package is the grade table and the grade a character holds; it
 * ships no steps and nothing a player presses. GS2 raises the grade through
 * `AddGradeByUserId`, which also applies the step's cap to the character's
 * experience status, so the press here is an exchange whose only acquire
 * action is that promotion. `Gs2Enhance:Unleash`, the operation a game would
 * normally call, is not reachable from a client (no Ez action, no Bind loader,
 * not in the application policy), so the exchange is the whole mechanism.
 *
 * GS2 reads grade N from the table's entry N-1, and a character's grade status
 * starts at 1 when it is first read. So the first entry is the cap a character
 * starts with — the experience model's default of 10 — and each press moves
 * one entry down the table. The button stops being pressable at the last
 * grade: a further promotion would still raise the grade number, but not the
 * cap, because the last entry keeps applying.
 *
 * The roster, the recruit and the level curve are
 * `foundation-economy-character-demo`'s, installed beside this package rather
 * than written out again: they live in stacks every demo holding a roster
 * deploys, and a second author of them would be a second version, and the
 * last deploy would win. That demo's curve is long enough for a cap of 30 for
 * this reason. What this demo authors lands in stacks only it deploys: the
 * grade steps, the limit break, and a training press that grants enough
 * experience to reach each cap in a few presses — the character demo's own
 * training takes about sixty to the first cap and over a hundred to each after.
 */

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

/**
 * The cap each grade applies, grade 1 first. The first has to match the
 * character demo's default level cap and the last its maximum, which that
 * demo's curve is sized for.
 */
const GRADE_CAPS = [10, 20, 30] as const;

/** The highest grade the table holds; a promotion past it moves no cap. */
const MAX_GRADE = GRADE_CAPS.length;

/** Enough experience per press to reach the next cap in a handful of presses. */
const TRAIN_HARD_EXPERIENCE = 1000;

/**
 * Promotes the character it is mounted on by one grade. Named after the
 * character, like the character demo's training: a delegated action on
 * `Character` must target a resource that mounts `Character`, which is how the
 * generated loader learns which rate a row's button trades. The target is the
 * character's grade status, keyed like its level status by the `propertyId`
 * GS2 mints at recruit time plus the level suffix, so the row carries a
 * `#{propertyId}` placeholder and the click fills it.
 */
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

/** The character demo's training, with enough experience to be worth a demo. */
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

/** One grade step: its cap, applying to every character. */
function gradeStep(rankCapValue: number) {
  return { rankCapValue, propertyIdRegex: ".*", gradeUpPropertyIdRegex: ".*" };
}

/** Fills a rate's `#{propertyId}` placeholder with the pressed character's. */
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
  // The grade overlays a type the character package owns, and an install does
  // not walk a package's own dependencies, so the base package is named too.
  // It also owns `AcquireCharacterExperience`, which the training trades for.
  .dependency(character.packageId, "github:gs2io/gs2-studio-package")
  // The roster, the recruit and the level curve.
  .dependency(characterDemo.packageId, "github:gs2io/gs2-studio-package")

  // Rows are laid out in lexical id order, which is the grade order here as
  // long as there are fewer than ten; zero-pad the ids before adding a tenth.
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
        // Run and commit server-side, like the character demo's exchanges.
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
        // Run and commit server-side, like the character demo's exchanges.
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
      // Pressable only at the cap and while a step is left. The character
      // package's own `LevelInteractable` is not wired to this button as well:
      // two interactables on one button fight over the same flag.
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

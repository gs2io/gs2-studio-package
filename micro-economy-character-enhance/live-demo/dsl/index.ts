/**
 * Live demo content for `micro-economy-character-enhance`.
 *
 * Enhancing spends material items to level a character up. What is worth
 * watching is both ends of the trade moving on one press: a material's count
 * drops by one, and the character's level bar jumps by what that material is
 * worth.
 *
 * The feature package is the recipe, its bonus draws and the material
 * inventory; it ships no rows and nothing a player presses. This package adds
 * a recipe with its normal and great-success draws, two materials and the
 * presses: one to pick up a material, and one per material to spend it on a
 * character. Each press is an exchange whose
 * only acquire action is the package's own transform, so the enhancement runs
 * server-side like every other demo press.
 *
 * The roster, the recruit and the level curve are
 * `foundation-economy-character-demo`'s, installed beside this package rather
 * than written out again: they live in stacks every demo holding a roster
 * deploys, and a second author of them would be a second version, and the
 * last deploy would win. The material values are sized against that curve so
 * the first press shows: from a fresh character a potion reaches level 4 and
 * an elixir level 7, and a great success (×1.5) lifts either a little more.
 * Later presses move the bar less, as the thresholds widen.
 */

import {
  Arg,
  Bind,
  defineMasterDataResource,
  definePackage,
  dependencyPackage,
  Source,
  transactionSetting,
} from "~/dsl";
import { GS2 } from "~/dsl/gs2";

import enhanceSurface from "../../dsl/dependency-surface.json";
import { characterEnhanceMaterialItemId } from "../../dsl/index";
import characterDemoSurface from "../../../foundation-economy-character/live-demo/dsl/dependency-surface.json";
import characterSurface from "../../../foundation-economy-character/dsl/dependency-surface.json";

const enhance = dependencyPackage(enhanceSurface);
const character = dependencyPackage(characterSurface);
const characterDemo = dependencyPackage(characterDemoSurface);

const Character = character.type("Character");
const CharacterEnhance = enhance.type("CharacterEnhance");
const CharacterEnhanceBonus = enhance.type("CharacterEnhanceBonus");
const CharacterEnhanceMaterial = enhance.type("CharacterEnhanceMaterial");

const PROPERTY_ID = character.propertyId("Character", "propertyId");
const MATERIAL_COUNT = enhance.propertyId("CharacterEnhanceMaterial", "count");

/** The one recipe the presses run. */
const RECIPE = "Basic";

/** The materials, and the experience one of each is worth. */
const POTION = "ExperiencePotion";
const ELIXIR = "ExperienceElixir";
const POTION_EXPERIENCE = 300;
const ELIXIR_EXPERIENCE = 1000;

/** A material's metadata, in the shape the recipe's hierarchy reads. */
function materialMetadata(experience: number): string {
  return JSON.stringify({ experience });
}

/** One bonus draw of the recipe: its multiplier and relative weight. */
function bonus(rate: number, weight: number) {
  return {
    [enhance.propertyId("CharacterEnhanceBonus", "enhance")]: RECIPE,
    [enhance.propertyId("CharacterEnhanceBonus", "rate")]: rate,
    [enhance.propertyId("CharacterEnhanceBonus", "weight")]: weight,
  };
}

/**
 * Picks up one of the material it is mounted on, for nothing. Named after the
 * material because a delegated action on `CharacterEnhanceMaterial` must
 * target a resource that mounts it — that is how the generated loader learns
 * which rate a row's button trades.
 */
const GetMaterialRateModel = defineMasterDataResource(resource =>
  resource
    .model(GS2.exchange.RateModel)
    .mountLocal(CharacterEnhanceMaterial)
    .bindings({ name: Bind.domainProperty(Source.direct(CharacterEnhanceMaterial, "id")) })
    .addArrayChild("acquireActions", acquireAction => {
      acquireAction
        .model(GS2.transaction.AcquireAction)
        .mountLocal(CharacterEnhanceMaterial)
        .bindings({
          action: Bind.transform(enhance.packageId, "AcquireCharacterEnhanceMaterial", [
            Arg.domainProperty("material", Source.direct(CharacterEnhanceMaterial, "id")),
            Arg.static("count", 1),
          ]),
        });
    })
);

/**
 * Spends one of `materialName` on the character it is mounted on. Named after
 * the character for the same reason as the material rate. The target is the
 * character's bare `propertyId` — its item set GRN, minted by GS2 at recruit
 * time — so the row carries a `#{propertyId}` placeholder and the click fills
 * it. GS2-Enhance appends the level suffix itself, so this is not the level
 * status key the training presses use.
 */
function enhanceRateModel(materialName: string) {
  return defineMasterDataResource(resource =>
    resource
      .model(GS2.exchange.RateModel)
      .mountLocal(Character)
      .bindings({ name: Bind.domainProperty(Source.direct(Character, "id")) })
      .addArrayChild("acquireActions", acquireAction => {
        acquireAction
          .model(GS2.transaction.AcquireAction)
          .mountLocal(Character)
          .bindings({
            action: Bind.transform(enhance.packageId, "EnhanceCharacter", [
              Arg.static("enhance", RECIPE),
              Arg.placeholder("targetItemSetId", "#{propertyId}"),
              Arg.static("materialItemSetId", characterEnhanceMaterialItemId(materialName)),
              Arg.static("count", 1),
            ]),
          });
      })
  );
}

const EnhanceWithPotionRateModel = enhanceRateModel(POTION);
const EnhanceWithElixirRateModel = enhanceRateModel(ELIXIR);

/**
 * An exchange namespace that runs and commits server-side, like every demo
 * press. Each rate gets its own: the character rates are all named after the
 * characters, and sharing a namespace collides the `rateModels` array on its
 * primary key and drops the whole `CurrentRateMaster` from the template.
 */
function exchangeNamespaceBindings(name: string) {
  return {
    name: Bind.static(name),
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
  };
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

export const microEconomyCharacterEnhanceDemo = definePackage(
  "micro-economy-character-enhance-demo",
  "0.0.0"
)
  .display({
    label: { ja: "キャラクター強化（デモデータ）", en: "Character Enhancement (demo data)" },
    description: {
      ja: "ライブデモ用の強化レシピ・強化素材と、素材の入手・キャラクター強化の操作を提供します。",
      en: "Supplies the recipe and materials the live demo enhances with, and the presses that get materials and spend them on a character.",
    },
  })
  .dependency(enhance.packageId, "github:gs2io/gs2-studio-package")
  // The enhancement targets a type the character package owns, and an install
  // does not walk a package's own dependencies, so the base package is named too.
  .dependency(character.packageId, "github:gs2io/gs2-studio-package")
  // The roster, the recruit and the level curve.
  .dependency(characterDemo.packageId, "github:gs2io/gs2-studio-package")

  .instance(CharacterEnhance, RECIPE, {})
  // Mostly a plain enhancement, sometimes a great one.
  .instance(CharacterEnhanceBonus, "normal", bonus(1.0, 80))
  .instance(CharacterEnhanceBonus, "great", bonus(1.5, 20))
  .instance(CharacterEnhanceMaterial, POTION, {
    [enhance.propertyId("CharacterEnhanceMaterial", "metadata")]:
      materialMetadata(POTION_EXPERIENCE),
  })
  .instance(CharacterEnhanceMaterial, ELIXIR, {
    [enhance.propertyId("CharacterEnhanceMaterial", "metadata")]:
      materialMetadata(ELIXIR_EXPERIENCE),
  })

  .masterDataResource(resource =>
    resource
      .model(GS2.exchange.Namespace)
      .bindings(exchangeNamespaceBindings("CharacterEnhanceMaterialGet"))
      .addChild(GetMaterialRateModel)
  )
  .masterDataResource(resource =>
    resource
      .model(GS2.exchange.Namespace)
      .bindings(exchangeNamespaceBindings("CharacterEnhanceWithPotion"))
      .addChild(EnhanceWithPotionRateModel)
  )
  .masterDataResource(resource =>
    resource
      .model(GS2.exchange.Namespace)
      .bindings(exchangeNamespaceBindings("CharacterEnhanceWithElixir"))
      .addChild(EnhanceWithElixirRateModel)
  )

  .uiComponent(CharacterEnhanceMaterial, ui =>
    ui
      // A simple item has no display name of its own; its id is what a player
      // would call it.
      .templateLabel(
        "StockLabel",
        "{id} x{count}",
        { id: ui.prop("id"), count: ui.inheritedProp(MATERIAL_COUNT) },
        { name: "CharacterEnhanceMaterial" }
      )
      .buttonAction("GetButton", "Get", undefined, { name: "CharacterEnhanceMaterial" })
  )
  // Not greyed out while the material runs out: the count lives on the
  // material row, and a character row's condition can only read its own
  // properties. Enhancing with nothing fails server-side and changes nothing.
  .uiComponent(Character, ui =>
    ui
      .buttonAction("EnhanceWithPotionButton", "EnhanceWithPotion", undefined, {
        name: "Character",
      })
      .buttonAction("EnhanceWithElixirButton", "EnhanceWithElixir", undefined, {
        name: "Character",
      })
  )

  .delegatedAction(CharacterEnhanceMaterial, "Get", {
    targetActionKey: "Gs2Exchange:RateModel.Exchange",
    targetResource: GetMaterialRateModel,
    parameterOverrides: [{ kind: "static", parameterName: "count", value: 1 }],
  })
  .delegatedAction(Character, "EnhanceWithPotion", {
    targetActionKey: "Gs2Exchange:RateModel.Exchange",
    targetResource: EnhanceWithPotionRateModel,
    parameterOverrides: [{ kind: "static", parameterName: "count", value: 1 }, PROPERTY_ID_CONFIG],
  })
  .delegatedAction(Character, "EnhanceWithElixir", {
    targetActionKey: "Gs2Exchange:RateModel.Exchange",
    targetResource: EnhanceWithElixirRateModel,
    parameterOverrides: [{ kind: "static", parameterName: "count", value: 1 }, PROPERTY_ID_CONFIG],
  })
  .build();

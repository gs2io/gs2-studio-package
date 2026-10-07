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

const RECIPE = "Basic";

const POTION = "potion";
const ELIXIR = "elixir";
const POTION_EXPERIENCE = 300;
const ELIXIR_EXPERIENCE = 1000;

/** Match the recipe metadata path so material experience can be read from the deployed item metadata. */
function materialMetadata(experience: number): string {
  return JSON.stringify({ experience });
}

function bonus(rate: number, weight: number) {
  return {
    [enhance.propertyId("CharacterEnhanceBonus", "enhance")]: RECIPE,
    [enhance.propertyId("CharacterEnhanceBonus", "rate")]: rate,
    [enhance.propertyId("CharacterEnhanceBonus", "weight")]: weight,
  };
}

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

/** Supply the owned item-set id at click time because it does not exist when the rate is deployed. Pass the bare id because the recipe supplies the experience suffix. */
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

/** Separate namespaces because potion and elixir rates derive identical character names; auto-run avoids a second execution request. */
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
  // Declare the character package because these rates target its owned instances.
  .dependency(character.packageId, "github:gs2io/gs2-studio-package")
  // Reuse the shared roster and level curve so this demo cannot deploy conflicting character content.
  .dependency(characterDemo.packageId, "github:gs2io/gs2-studio-package")

  .instance(CharacterEnhance, RECIPE, {})
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
      .templateLabel(
        "StockLabel",
        "{id} x{count}",
        { id: ui.prop("id"), count: ui.inheritedProp(MATERIAL_COUNT) },
        { name: "CharacterEnhanceMaterial" }
      )
      .buttonAction("GetButton", "Get", undefined, { name: "CharacterEnhanceMaterial" })
  )
  // Material stock belongs to another row, so a character-local condition cannot disable this button when stock is empty.
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

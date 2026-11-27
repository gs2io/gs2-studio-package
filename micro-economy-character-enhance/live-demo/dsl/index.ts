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
  UiItem,
  UiSource,
} from "gs2-studio-dsl";

import { liveDemoDependencies } from "../../../dsl/liveDemoDependencies";

import { GS2 } from "gs2-studio-dsl/gs2";

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

const GetMaterialRateModel = defineMasterDataResource({
  model: GS2.exchange.RateModel,
  mount: CharacterEnhanceMaterial,
  bindings: { name: Bind.domainProperty(Source.direct(CharacterEnhanceMaterial, "id")) },
  arrayChildren: {
    acquireActions: [
      defineMasterDataResource({
  model: GS2.transaction.AcquireAction,
  mount: CharacterEnhanceMaterial,
  actionProgram: ActionProgram.transform(
            enhance.packageId,
            enhance.transformId("AcquireCharacterEnhanceMaterial"),
            [
              Arg.domainProperty("material", Source.direct(CharacterEnhanceMaterial, "id")),
              Arg.static("count", 1),
            ]
          ),
}),
    ],
  },
});

function enhanceRateModel(materialName: string) {
  return defineMasterDataResource({
  model: GS2.exchange.RateModel,
  mount: Character,
  bindings: { name: Bind.domainProperty(Source.direct(Character, "id")) },
  arrayChildren: {
    acquireActions: [
      defineMasterDataResource({
  model: GS2.transaction.AcquireAction,
  mount: Character,
  actionProgram: ActionProgram.transform(enhance.packageId, enhance.transformId("EnhanceCharacter"), [
              Arg.static("enhance", RECIPE),
              Arg.placeholder("targetItemSetId", "#{propertyId}"),
              Arg.static("materialItemSetId", characterEnhanceMaterialItemId(materialName)),
              Arg.static("count", 1),
            ]),
}),
    ],
  },
});
}

const EnhanceWithPotionRateModel = enhanceRateModel(POTION);

const EnhanceWithElixirRateModel = enhanceRateModel(ELIXIR);

function exchangeNamespaceBindings(name: string) {
  return {
    name: Bind.static(name),
    ...Bind.nulls(
      "acquireAwaitScript",
      "exchangeScript",
      "incrementalExchangeScript",
      "logSetting"
    ),
    transactionSettingV2: transactionSettingV2(),
  };
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

export const microEconomyCharacterEnhanceDemo = definePackage({
  id: "micro-economy-character-enhance-demo",
  version: "0.0.1",
  display: {
    ja: {
      label: "キャラクター強化（デモデータ）",
      description:
        "ライブデモ用の強化レシピ・強化素材と、素材の入手・キャラクター強化の操作を提供します。",
    },
    en: {
      label: "Character Enhancement (demo data)",
      description:
        "Supplies the recipe and materials the live demo enhances with, and the presses that get materials and spend them on a character.",
    },
  },
  dependencies: liveDemoDependencies(
    enhance.packageId,
    character.packageId,
    characterDemo.packageId
  ),
  instances: [
    instance(CharacterEnhance, RECIPE, {}),
    instance(CharacterEnhanceBonus, "normal", bonus(1.0, 80)),
    instance(CharacterEnhanceBonus, "great", bonus(1.5, 20)),
    instance(CharacterEnhanceMaterial, POTION, {
    [enhance.propertyId("CharacterEnhanceMaterial", "metadata")]:
      materialMetadata(POTION_EXPERIENCE),
  }),
    instance(CharacterEnhanceMaterial, ELIXIR, {
    [enhance.propertyId("CharacterEnhanceMaterial", "metadata")]:
      materialMetadata(ELIXIR_EXPERIENCE),
  }),
  ],
  delegatedActions: [
    { target: CharacterEnhanceMaterial, methodName: "Get", action: { targetActionKey: "Gs2Exchange:RateModel.Exchange", targetResource: GetMaterialRateModel, parameterOverrides: [{ parameterName: "count", source: { kind: "static", value: 1 } }] } },
    { target: Character, methodName: "EnhanceWithPotion", action: { targetActionKey: "Gs2Exchange:RateModel.Exchange", targetResource: EnhanceWithPotionRateModel, parameterOverrides: [
      { parameterName: "count", source: { kind: "static", value: 1 } },
      PROPERTY_ID_CONFIG,
    ] } },
    { target: Character, methodName: "EnhanceWithElixir", action: { targetActionKey: "Gs2Exchange:RateModel.Exchange", targetResource: EnhanceWithElixirRateModel, parameterOverrides: [
      { parameterName: "count", source: { kind: "static", value: 1 } },
      PROPERTY_ID_CONFIG,
    ] } },
  ],
  masterDataResources: [
    defineMasterDataResource({
  model: GS2.exchange.Namespace,
  bindings: exchangeNamespaceBindings("CharacterEnhanceMaterialGet"),
  children: [
    GetMaterialRateModel,
  ],
}),
    defineMasterDataResource({
  model: GS2.exchange.Namespace,
  bindings: exchangeNamespaceBindings("CharacterEnhanceWithPotion"),
  children: [
    EnhanceWithPotionRateModel,
  ],
}),
    defineMasterDataResource({
  model: GS2.exchange.Namespace,
  bindings: exchangeNamespaceBindings("CharacterEnhanceWithElixir"),
  children: [
    EnhanceWithElixirRateModel,
  ],
}),
  ],
  uiComponents: [
    defineUiComponent(CharacterEnhanceMaterial, {
  items: [
    UiItem.templateLabel("StockLabel", "{id} x{count}", { id: UiSource.prop("id"), count: UiSource.inheritedProp(MATERIAL_COUNT) }, { name: "CharacterEnhanceMaterial" }),
    UiItem.buttonAction("GetButton", "Get", undefined, { name: "CharacterEnhanceMaterial" }),
  ],
}),
    defineUiComponent(Character, {
  items: [
    UiItem.buttonAction("EnhanceWithPotionButton", "EnhanceWithPotion", undefined, {
        name: "Character",
      }),
    UiItem.buttonAction("EnhanceWithElixirButton", "EnhanceWithElixir", undefined, {
        name: "Character",
      }),
  ],
}),
  ],
});

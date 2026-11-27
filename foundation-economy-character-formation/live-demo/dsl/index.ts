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

import { liveDemoDependencies } from "../../../dsl/liveDemoDependencies";

import { GS2 } from "gs2-studio-dsl/gs2";

import formationSurface from "../../dsl/dependency-surface.json";

import characterDemoSurface from "../../../foundation-economy-character/live-demo/dsl/dependency-surface.json";

import characterSurface from "../../../foundation-economy-character/dsl/dependency-surface.json";

const formation = dependencyPackage(formationSurface);

const character = dependencyPackage(characterSurface);

const characterDemo = dependencyPackage(characterDemoSurface);

const CharacterFormation = formation.type("CharacterFormation");

const CharacterFormationSlot = formation.type("CharacterFormationSlot");

const CURRENT_SAVE_AREA = formation.propertyId("CharacterFormation", "currentSaveArea");

const MAXIMUM_SAVE_AREA = formation.propertyId("CharacterFormation", "maximumSaveArea");

const CHARACTER_ITEM_SET_REGEX =
  "grn:gs2:{region}:{ownerId}:inventory:Character:user:{userId}:inventory:Character:item:.*";

function slot() {
  return {
    [formation.propertyId("CharacterFormationSlot", "propertyRegex")]: CHARACTER_ITEM_SET_REGEX,
  };
}

const ExpandRateModel = defineMasterDataResource({
  model: GS2.exchange.RateModel,
  mount: CharacterFormation,
  bindings: { name: Bind.domainProperty(Source.direct(CharacterFormation, "id")) },
  arrayChildren: {
    acquireActions: [
      defineMasterDataResource({
  model: GS2.transaction.AcquireAction,
  mount: CharacterFormation,
  actionProgram: ActionProgram.transform(formation.packageId, formation.transformId("IncreaseSaveArea"), [
            Arg.static("value", 1),
          ]),
}),
    ],
  },
});

export const foundationEconomyCharacterFormationDemo = definePackage({
  id: "foundation-economy-character-formation-demo",
  version: "0.0.1",
  display: {
    ja: {
      label: "パーティ編成（デモデータ）",
      description: "ライブデモ用の編成スロットと枠の拡張を提供します。",
    },
    en: {
      label: "Party Formation (demo data)",
      description: "Supplies the formation slots and the save-area expansion the live demo uses.",
    },
  },
  dependencies: liveDemoDependencies(
    formation.packageId,
    character.packageId,
    characterDemo.packageId
  ),
  instances: [
    instance(CharacterFormation, "characterformation", {
    [formation.propertyId("CharacterFormation", "initialSaveArea")]: 2,
    [MAXIMUM_SAVE_AREA]: 4,
  }),
    instance(CharacterFormationSlot, "slot1", slot()),
    instance(CharacterFormationSlot, "slot2", slot()),
    instance(CharacterFormationSlot, "slot3", slot()),
  ],
  delegatedActions: [
    { target: CharacterFormation, methodName: "Expand", action: { targetActionKey: "Gs2Exchange:RateModel.Exchange", targetResource: ExpandRateModel, parameterOverrides: [{ parameterName: "count", source: { kind: "static", value: 1 } }] } },
  ],
  masterDataResources: [
    defineMasterDataResource({
  model: GS2.exchange.Namespace,
  bindings: {
        name: Bind.static("CharacterFormationExpand"),
        ...Bind.nulls(
          "acquireAwaitScript",
          "exchangeScript",
          "incrementalExchangeScript",
          "logSetting"
        ),
        transactionSettingV2: transactionSettingV2(),
      },
  children: [
    ExpandRateModel,
  ],
}),
  ],
  uiComponents: [
    defineUiComponent(CharacterFormation, {
  items: [
    UiItem.templateLabel("SaveAreaLabel", "{currentSaveArea} of {maximumSaveArea} parties", {
          currentSaveArea: UiSource.inheritedProp(CURRENT_SAVE_AREA),
          maximumSaveArea: UiSource.inheritedProp(MAXIMUM_SAVE_AREA),
        }, { name: "CharacterFormation" }),
    UiItem.interactable("ExpandInteractable", UiCond.lt(UiSource.inheritedProp(CURRENT_SAVE_AREA), UiSource.inheritedProp(MAXIMUM_SAVE_AREA)), { name: "CharacterFormation" }),
    UiItem.buttonAction("ExpandButton", "Expand", undefined, { name: "CharacterFormation" }),
  ],
}),
  ],
});

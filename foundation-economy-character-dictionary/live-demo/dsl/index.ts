import {
  ActionProgram,
  Arg,
  Bind,
  defineMasterDataResource,
  definePackage,
  defineUiComponent,
  dependencyPackage,
  Source,
  transactionSettingV2,
  UiItem,
} from "gs2-studio-dsl";

import { liveDemoDependencies } from "../../../dsl/liveDemoDependencies";

import { GS2 } from "gs2-studio-dsl/gs2";

import dictionarySurface from "../../dsl/dependency-surface.json";

import characterSurface from "../../../foundation-economy-character/dsl/dependency-surface.json";

import characterDemoSurface from "../../../foundation-economy-character/live-demo/dsl/dependency-surface.json";

const dictionary = dependencyPackage(dictionarySurface);

const character = dependencyPackage(characterSurface);

const characterDemo = dependencyPackage(characterDemoSurface);

const Character = dictionary.type("Character");

const CHARACTER_PACKAGE_ID = "foundation-economy-character";

const DexRecruitRateModel = defineMasterDataResource({
  model: GS2.exchange.RateModel,
  mount: Character,
  bindings: { name: Bind.domainProperty(Source.direct(Character, "id")) },
  arrayChildren: {
    acquireActions: [
      defineMasterDataResource({
  model: GS2.transaction.AcquireAction,
  mount: Character,
  actionProgram: ActionProgram.transform(CHARACTER_PACKAGE_ID, character.transformId("AcquireCharacter"), [
            Arg.domainProperty("character", Source.direct(Character, "id")),
            Arg.static("count", 1),
          ]),
}),
      defineMasterDataResource({
  model: GS2.transaction.AcquireAction,
  mount: Character,
  actionProgram: ActionProgram.transform(
            dictionary.packageId,
            dictionary.transformId("MarkCharacterDictionary"),
            [Arg.domainProperty("character", Source.direct(Character, "id"))]
          ),
}),
    ],
  },
});

export const foundationEconomyCharacterDictionaryDemo = definePackage({
  id: "foundation-economy-character-dictionary-demo",
  version: "0.0.1",
  display: {
    ja: {
      label: "キャラクター図鑑（デモデータ）",
      description: "ライブデモ用のキャラクター一覧と、勧誘して図鑑を埋める操作を提供します。",
    },
    en: {
      label: "Character Dex (demo data)",
      description:
        "Supplies the roster the live demo shows, and the press that recruits one into the dex.",
    },
  },
  dependencies: liveDemoDependencies(
    dictionary.packageId,
    characterDemo.packageId,
    CHARACTER_PACKAGE_ID
  ),
  delegatedActions: [
    { target: Character, methodName: "Recruit", action: { targetActionKey: "Gs2Exchange:RateModel.Exchange", targetResource: DexRecruitRateModel, parameterOverrides: [{ parameterName: "count", source: { kind: "static", value: 1 } }] } },
  ],
  masterDataResources: [
    defineMasterDataResource({
  model: GS2.exchange.Namespace,
  bindings: {
        name: Bind.static("CharacterDexRecruit"),
        ...Bind.nulls(
          "acquireAwaitScript",
          "exchangeScript",
          "incrementalExchangeScript",
          "logSetting"
        ),
        // Auto-run executes the combined transaction without a second request from the page.
        transactionSettingV2: transactionSettingV2(),
      },
  children: [
    DexRecruitRateModel,
  ],
}),
  ],
  uiComponents: [
    defineUiComponent(Character, {
  items: [
    UiItem.buttonAction("RecruitButton", "Recruit", undefined, { name: "Character" }),
  ],
}),
  ],
});

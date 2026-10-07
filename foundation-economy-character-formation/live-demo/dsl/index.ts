/** Reuse the shared character demo content so formation does not deploy a second version of its roster and recruit rates. */

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

const ExpandRateModel = defineMasterDataResource(resource =>
  resource
    .model(GS2.exchange.RateModel)
    .mountLocal(CharacterFormation)
    .bindings({ name: Bind.domainProperty(Source.direct(CharacterFormation, "id")) })
    .addArrayChild("acquireActions", acquireAction => {
      acquireAction
        .model(GS2.transaction.AcquireAction)
        .mountLocal(CharacterFormation)
        .bindings({
          action: Bind.transform(formation.packageId, "IncreaseSaveArea", [Arg.static("value", 1)]),
        });
    })
);

export const foundationEconomyCharacterFormationDemo = definePackage(
  "foundation-economy-character-formation-demo",
  "0.0.0"
)
  .display({
    label: { ja: "パーティ編成（デモデータ）", en: "Party Formation (demo data)" },
    description: {
      ja: "ライブデモ用の編成スロットと枠の拡張を提供します。",
      en: "Supplies the formation slots and the save-area expansion the live demo uses.",
    },
  })
  .dependency(formation.packageId, "github:gs2io/gs2-studio-package")
  .dependency(character.packageId, "github:gs2io/gs2-studio-package")
  .dependency(characterDemo.packageId, "github:gs2io/gs2-studio-package")

  .instance(CharacterFormation, "characterformation", {
    [formation.propertyId("CharacterFormation", "initialSaveArea")]: 2,
    [MAXIMUM_SAVE_AREA]: 4,
  })
  .instance(CharacterFormationSlot, "slot1", slot())
  .instance(CharacterFormationSlot, "slot2", slot())
  .instance(CharacterFormationSlot, "slot3", slot())

  .masterDataResource(resource =>
    resource
      .model(GS2.exchange.Namespace)
      .bindings({
        name: Bind.static("CharacterFormationExpand"),
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
      .addChild(ExpandRateModel)
  )

  .uiComponent(CharacterFormation, ui =>
    ui
      .templateLabel(
        "SaveAreaLabel",
        "{currentSaveArea} of {maximumSaveArea} parties",
        {
          currentSaveArea: ui.inheritedProp(CURRENT_SAVE_AREA),
          maximumSaveArea: ui.inheritedProp(MAXIMUM_SAVE_AREA),
        },
        { name: "CharacterFormation" }
      )
      .interactable(
        "ExpandInteractable",
        UiCond.lt(ui.inheritedProp(CURRENT_SAVE_AREA), ui.inheritedProp(MAXIMUM_SAVE_AREA)),
        { name: "CharacterFormation" }
      )
      .buttonAction("ExpandButton", "Expand", undefined, { name: "CharacterFormation" })
  )

  .delegatedAction(CharacterFormation, "Expand", {
    targetActionKey: "Gs2Exchange:RateModel.Exchange",
    targetResource: ExpandRateModel,
    parameterOverrides: [{ kind: "static", parameterName: "count", value: 1 }],
  })
  .build();

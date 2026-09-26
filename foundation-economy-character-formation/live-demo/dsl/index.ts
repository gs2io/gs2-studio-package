/**
 * Live demo content for `foundation-economy-character-formation`.
 *
 * A party is a named set of slots, and the player keeps several parties side
 * by side. What is worth watching is the party list: putting a recruited
 * character in fills the first empty slot of the party being edited, taking
 * it out empties that slot again, and Expand adds one more party.
 *
 * The feature package is the formation model and the presses GS2 offers; it
 * ships no party shape and nothing a player presses. This package adds one
 * shape ("characterformation": three slots, two parties to start with, at most
 * four) and the Expand press. GS2-Formation has no client action that grows
 * the number of parties, so Expand is an exchange whose only acquire action is
 * the package's own transform, run and committed server-side.
 *
 * Putting a character in is not a delegated action: the slot value has to be
 * signed by the inventory that holds the character, so the page asks the
 * inventory for a signed item set and hands it to the formation itself.
 *
 * The characters and the recruit press are other packages' and are installed
 * beside this one rather than written out again: their rows live in stacks
 * every demo holding them deploys, and a second author of them would be a
 * second version, and the last deploy would win.
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

/** Any character item set the player holds in the character inventory. */
const CHARACTER_ITEM_SET_REGEX =
  "grn:gs2:{region}:{ownerId}:inventory:Character:user:{userId}:inventory:Character:item:.*";

function slot() {
  return { [formation.propertyId("CharacterFormationSlot", "propertyRegex")]: CHARACTER_ITEM_SET_REGEX };
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
      // Past the most parties the title allows, there is nothing left to
      // expand, and a button that fails is worse than one plainly unavailable.
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

/**
 * Live demo content for `micro-economy-equipment-loadout`.
 *
 * Each character keeps its own equipment slots, and a slot only takes the
 * equipment its pattern matches. What is worth watching is that refusal: a
 * sword goes in the weapon slot, and a shield sent to the same slot comes back
 * refused by GS2 itself, because the slot's pattern names the weapons.
 *
 * The feature package is the property form and nothing a player presses. This
 * package adds the two slots. Putting a piece on is not a delegated action:
 * the slot value has to be signed by the inventory that holds the equipment,
 * so the page asks the inventory for a signed item set and hands it to the
 * formation itself.
 *
 * The characters, the equipment and the presses that hand them out are other
 * packages' and are installed beside this one rather than written out again:
 * their rows live in stacks every demo holding them deploys, and a second
 * author of them would be a second version, and the last deploy would win.
 */

import { definePackage, dependencyPackage } from "~/dsl";

import loadoutSurface from "../../dsl/dependency-surface.json";
import characterDemoSurface from "../../../foundation-economy-character/live-demo/dsl/dependency-surface.json";
import characterSurface from "../../../foundation-economy-character/dsl/dependency-surface.json";
import equipmentDemoSurface from "../../../foundation-economy-equipment/live-demo/dsl/dependency-surface.json";
import equipmentSurface from "../../../foundation-economy-equipment/dsl/dependency-surface.json";

const loadout = dependencyPackage(loadoutSurface);
const character = dependencyPackage(characterSurface);
const characterDemo = dependencyPackage(characterDemoSurface);
const equipment = dependencyPackage(equipmentSurface);
const equipmentDemo = dependencyPackage(equipmentDemoSurface);

const EquipmentSlot = loadout.type("EquipmentSlot");

/**
 * An equipment item set the player holds, of one of the named items. GS2
 * matches the pattern anywhere in the property id, so it is anchored at both
 * ends, and the item set name is left open: every take is a set of its own.
 */
function equipmentOf(...itemNames: readonly string[]): string {
  return (
    "^grn:gs2:{region}:{ownerId}:inventory:Equipment:user:{userId}:inventory:Equipment:" +
    `item:(${itemNames.join("|")}):itemSet:[^:]+$`
  );
}

function slot(...itemNames: readonly string[]) {
  return { [loadout.propertyId("EquipmentSlot", "propertyRegex")]: equipmentOf(...itemNames) };
}

export const microEconomyEquipmentLoadoutDemo = definePackage(
  "micro-economy-equipment-loadout-demo",
  "0.0.0"
)
  .display({
    label: { ja: "装備の装着（デモデータ）", en: "Equipment Loadout (demo data)" },
    description: {
      ja: "ライブデモ用の武器スロットと防具スロットを提供します。",
      en: "Supplies the weapon and armor slots the live demo uses.",
    },
  })
  .dependency(loadout.packageId, "github:gs2io/gs2-studio-package")
  .dependency(character.packageId, "github:gs2io/gs2-studio-package")
  .dependency(characterDemo.packageId, "github:gs2io/gs2-studio-package")
  .dependency(equipment.packageId, "github:gs2io/gs2-studio-package")
  .dependency(equipmentDemo.packageId, "github:gs2io/gs2-studio-package")

  .instance(EquipmentSlot, "weapon", slot("iron-sword", "oak-staff"))
  .instance(EquipmentSlot, "armor", slot("steel-shield"))
  .build();

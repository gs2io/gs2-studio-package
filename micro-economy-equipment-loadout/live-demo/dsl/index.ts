/** Reuse the shared character and equipment demos so this demo cannot replace their catalogs with different stack content. */

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

/** Anchor the whole item-set GRN to reject partial matches while leaving the future owned instance name unconstrained. */
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

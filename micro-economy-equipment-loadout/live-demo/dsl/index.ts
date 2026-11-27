import {
  definePackage,
  dependencyPackage,
  instance,
} from "gs2-studio-dsl";

import { liveDemoDependencies } from "../../../dsl/liveDemoDependencies";

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

function equipmentOf(...itemNames: readonly string[]): string {
  return (
    "^grn:gs2:{region}:{ownerId}:inventory:Equipment:user:{userId}:inventory:Equipment:" +
    `item:(${itemNames.join("|")}):itemSet:[^:]+$`
  );
}

function slot(...itemNames: readonly string[]) {
  return { [loadout.propertyId("EquipmentSlot", "propertyRegex")]: equipmentOf(...itemNames) };
}

export const microEconomyEquipmentLoadoutDemo = definePackage({
  id: "micro-economy-equipment-loadout-demo",
  version: "0.0.1",
  display: {
    ja: {
      label: "装備の装着（デモデータ）",
      description: "ライブデモ用の武器スロットと防具スロットを提供します。",
    },
    en: {
      label: "Equipment Loadout (demo data)",
      description: "Supplies the weapon and armor slots the live demo uses.",
    },
  },
  dependencies: liveDemoDependencies(
    loadout.packageId,
    character.packageId,
    characterDemo.packageId,
    equipment.packageId,
    equipmentDemo.packageId
  ),
  instances: [
    instance(EquipmentSlot, "weapon", slot("iron-sword", "oak-staff")),
    instance(EquipmentSlot, "armor", slot("steel-shield")),
  ],
});

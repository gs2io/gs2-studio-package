// Send only the changed slot so stale reads cannot overwrite untouched equipment.
// Leave slot-pattern and exclusive-ownership checks to the server so the demo displays its refusals.
#nullable enable

using System.Collections.Generic;
using System.Threading.Tasks;

using Gs2.Core.Exception;
using Gs2.Gs2Formation.Exception;
using Gs2.Unity.Core;
using Gs2.Unity.Gs2Formation.Model;
using Gs2.Unity.Util;

using InventoryItemSet = Gs2.Gs2Inventory.Model.ItemSet;

namespace GS2Studio.Showroom.Demo
{
    internal static class LoadoutCommands
    {
        public const string Namespace = "CharacterEquipment";

        public const string FormModel = "CharacterEquipment";

        /// <summary>Keep the inventory slot kind when clearing a slot; an empty body does not replace its type.</summary>
        private const string PropertyType = "gs2_inventory";

        public static async Task<string> Equip(
            Gs2Domain gs2, IGameSession session, string characterPropertyId, string slotName, string equipmentPropertyId)
        {
            var signed = await gs2.Inventory
                .Namespace(InventoryItemSet.GetNamespaceNameFromGrn(equipmentPropertyId))
                .Me(session)
                .Inventory(InventoryItemSet.GetInventoryNameFromGrn(equipmentPropertyId))
                // Sign the exact item set so separate pieces of the same item remain distinct.
                .ItemSet(
                    InventoryItemSet.GetItemNameFromGrn(equipmentPropertyId),
                    InventoryItemSet.GetItemSetNameFromGrn(equipmentPropertyId))
                .GetItemWithSignatureAsync();

            try
            {
                await new Gs2Bind.Gs2Formation.PropertyFormLoader(Namespace, FormModel, characterPropertyId)
                    .SetPropertyForm(
                        gs2, session,
                        new[]
                        {
                            new EzSlotWithSignature
                            {
                                Name = slotName,
                                PropertyType = PropertyType,
                                Body = signed.Body,
                                Signature = signed.Signature,
                            },
                        });
            }
            catch (PropertyIdNotMatchRegexException)
            {
                return $"GS2 refused: {ItemName(equipmentPropertyId)} does not fit the {slotName} slot.";
            }
            catch (Gs2Exception error) when (RefusedByScript(error, "alreadyEquipped"))
            {
                return $"GS2 refused: {ItemName(equipmentPropertyId)} is worn by another character. Take it off there first.";
            }
            catch (Gs2Exception error) when (RefusedByScript(error, "sameItemTwice"))
            {
                return $"GS2 refused: take off the {ItemName(equipmentPropertyId)} in this slot first, then put this one on.";
            }
            catch (Gs2Exception error) when (RefusedByScript(error, "wornTwice"))
            {
                return $"GS2 refused: {ItemName(equipmentPropertyId)} is already in another slot of this character.";
            }
            // The subscribed board displays the result, so a successful write needs no additional log line.
            return "";
        }

        /// <summary>Match the package-authored loadout.equipment tokens inside script error details; wrapper text is not a stable discriminator. This exception is registered in check-demo-written-code.</summary>
        private static bool RefusedByScript(Gs2Exception error, string reason)
        {
            if (error.Errors == null) return false;
            foreach (var detail in error.Errors)
            {
                if (detail.Message != null && detail.Message.Contains($"loadout.equipment.{reason}")) return true;
            }
            return false;
        }

        public static async Task<string> Unequip(
            Gs2Domain gs2, IGameSession session, string characterPropertyId, string slotName)
        {
            await new Gs2Bind.Gs2Formation.PropertyFormLoader(Namespace, FormModel, characterPropertyId)
                .SetPropertyForm(
                    gs2, session,
                    new[]
                    {
                        new EzSlotWithSignature
                        {
                            Name = slotName,
                            PropertyType = PropertyType,
                            Body = null,
                            Signature = null,
                        },
                    });
            return "";
        }

        /// <summary>Read slot names from the master shape because a stored form does not enumerate every empty slot.</summary>
        public static async Task<IReadOnlyList<string>> SlotNames(Gs2Domain gs2, IGameSession session)
        {
            var model = await new Gs2Bind.Gs2Formation.PropertyFormModelLoader(Namespace, FormModel).Load(gs2, session);
            var names = new List<string>();
            if (model?.Slots == null) return names;
            foreach (var slot in model.Slots)
            {
                if (!string.IsNullOrEmpty(slot.Name)) names.Add(slot.Name);
            }
            return names;
        }

        public static string ItemName(string propertyId)
        {
            var name = InventoryItemSet.GetItemNameFromGrn(propertyId);
            return string.IsNullOrEmpty(name) ? propertyId : name;
        }
    }
}

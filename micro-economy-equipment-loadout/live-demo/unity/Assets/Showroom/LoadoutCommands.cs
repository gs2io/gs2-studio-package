// Putting a piece of equipment on a character and taking it off again.
//
// A character's loadout is a GS2-Formation property form: one form per
// character, keyed by the character's own item set id, whose slots each hold
// the property id of a piece of equipment. The formation only takes a property
// id the inventory holding it has signed, so the page asks the equipment
// inventory for a signed copy of the item set tapped and hands the body and the
// signature to the formation. That is why these are written by hand rather
// than generated.
//
// Each slot names the equipment it accepts with a pattern, and GS2 checks the
// signed item set against it. The loadout package also runs a script before
// every save that keeps one piece on one character: it marks a piece put on in
// the item set's referenceOf and refuses one another character already wears.
// Both refusals come from GS2, not from the page: that is what the demo is for.
//
// Setting a form merges by slot name: slots the call does not name stay as
// they are, a named slot is replaced, and a named slot with no body is
// emptied. So both presses send exactly one slot.
//
// The board runs each press through `ShowroomPress`, which keeps two presses
// from racing to the same form, and hands in the signed-in client.
//
// Nothing here reloads or invalidates anything. Setting a form puts the new
// form into the SDK cache, and the loadout board subscribes to it.
#nullable enable

using System.Collections.Generic;
using System.Threading.Tasks;

using Gs2.Core.Exception;
using Gs2.Unity.Core;
using Gs2.Unity.Gs2Formation.Model;
using Gs2.Unity.Util;

using InventoryItemSet = Gs2.Gs2Inventory.Model.ItemSet;

namespace GS2Studio.Showroom.Demo
{
    /// <summary>
    /// The two presses that change a loadout, and the reads they share with
    /// the board.
    /// </summary>
    internal static class LoadoutCommands
    {
        /// <summary>The formation namespace the feature package deploys.</summary>
        public const string Namespace = "CharacterEquipment";

        /// <summary>The one loadout shape the feature package defines.</summary>
        public const string FormModel = "CharacterEquipment";

        /// <summary>
        /// What a slot holds. GS2 requires it on every slot sent, the emptying
        /// one included, and silently drops a slot of any other type.
        /// </summary>
        private const string PropertyType = "gs2_inventory";

        /// <summary>
        /// Puts the equipment in the character's slot, replacing whatever was
        /// there. Returns the page's line when GS2 refused it for a reason
        /// the demo shows, or "" when the slot was set.
        /// </summary>
        public static async Task<string> Equip(
            Gs2Domain gs2, IGameSession session, string characterPropertyId, string slotName, string equipmentPropertyId)
        {
            var signed = await gs2.Inventory
                .Namespace(InventoryItemSet.GetNamespaceNameFromGrn(equipmentPropertyId))
                .Me(session)
                .Inventory(InventoryItemSet.GetInventoryNameFromGrn(equipmentPropertyId))
                // The item set is named on purpose: every take is a set of
                // its own, and without the name the signature covers every
                // set of the item and GS2 takes the first of them.
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
            catch (BadRequestException error) when (RefusedByPattern(error))
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
            // The board shows the change; the page has nothing to add.
            return "";
        }

        /// <summary>
        /// Whether GS2 refused the slot because the equipment is not one the
        /// slot's pattern names: `formation.slot.propertyId.error.notMatchRegex`.
        /// </summary>
        private static bool RefusedByPattern(Gs2Exception error)
        {
            if (error.Errors == null) return false;
            foreach (var detail in error.Errors)
            {
                if (detail.Message == "formation.slot.propertyId.error.notMatchRegex") return true;
            }
            return false;
        }

        /// <summary>
        /// Whether the loadout script refused the save for the named reason.
        /// The script's own message reaches the client embedded in the error
        /// GS2-Script reports, so it is looked for inside rather than matched,
        /// and GS2-Formation passes the refusal on as a bad gateway rather than
        /// a bad request, so the check is made on any Gs2Exception.
        /// </summary>
        private static bool RefusedByScript(Gs2Exception error, string reason)
        {
            if (error.Errors == null) return false;
            foreach (var detail in error.Errors)
            {
                if (detail.Message != null && detail.Message.Contains($"loadout.equipment.{reason}")) return true;
            }
            return false;
        }

        /// <summary>
        /// Empties the character's slot. Returns "" for the page, since the
        /// board shows the change.
        /// </summary>
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

        /// <summary>
        /// The slot names of the loadout shape, in the order the shape lists
        /// them. A form only carries the slots that were ever set, so this is
        /// where the empty ones come from.
        /// </summary>
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

        /// <summary>
        /// The item name inside an item set GRN, or the whole id when it is
        /// not one.
        /// </summary>
        public static string ItemName(string propertyId)
        {
            var name = InventoryItemSet.GetItemNameFromGrn(propertyId);
            return string.IsNullOrEmpty(name) ? propertyId : name;
        }
    }
}

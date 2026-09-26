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
// signed item set against it. A piece the pattern does not name is refused by
// GS2, not by the page: that refusal is what the demo is for.
//
// Setting a form merges by slot name: slots the call does not name stay as
// they are, a named slot is replaced, and a named slot with no body is
// emptied. So both presses send exactly one slot.
//
// Nothing here reloads or invalidates anything. Setting a form puts the new
// form into the SDK cache, and the loadout board subscribes to it.
#nullable enable

using System;
using System.Collections.Generic;
using System.Diagnostics.CodeAnalysis;
using System.Threading.Tasks;

using Gs2.Core.Exception;
using Gs2.Unity.Core;
using Gs2.Unity.Gs2Formation.Model;
using Gs2.Unity.Util;

using GS2Studio.Generated.Runtime;

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
        /// Whether a press is still on its way to GS2. A second press in that
        /// window would race the first to the same form.
        /// </summary>
        private static bool _inFlight;

        /// <summary>
        /// Puts the equipment in the character's slot, replacing whatever was
        /// there. Returns a note for the page when GS2 refused it or a press
        /// is still saving, or null when the slot was set.
        /// </summary>
        public static async Task<string?> Equip(string characterPropertyId, string slotName, string equipmentPropertyId)
        {
            if (_inFlight) return "Still saving the last change.";
            _inFlight = true;
            try
            {
                var (gs2, session) = Runtime();
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
                return null;
            }
            finally
            {
                _inFlight = false;
            }
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
        /// Empties the character's slot. Returns a note for the page when a
        /// press is still saving, or null when the slot was emptied.
        /// </summary>
        public static async Task<string?> Unequip(string characterPropertyId, string slotName)
        {
            if (_inFlight) return "Still saving the last change.";
            _inFlight = true;
            try
            {
                var (gs2, session) = Runtime();
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
                return null;
            }
            finally
            {
                _inFlight = false;
            }
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

        /// <summary>
        /// The signed-in session, or false while the page is still signing in.
        /// </summary>
        public static bool TryRuntime(
            [NotNullWhen(true)] out Gs2Domain? gs2, [NotNullWhen(true)] out IGameSession? session)
        {
            gs2 = null;
            session = null;
            var runtime = UnityEngine.Object.FindAnyObjectByType<Gs2HolderRuntimeContextProvider>();
            return runtime != null && runtime.TryGet(out gs2, out session) && gs2 != null && session != null;
        }

        /// <summary>The signed-in session these calls travel on.</summary>
        public static (Gs2Domain Gs2, IGameSession Session) Runtime()
        {
            if (!TryRuntime(out var gs2, out var session))
                throw new InvalidOperationException("The GS2 runtime context is not available.");
            return (gs2, session);
        }
    }
}

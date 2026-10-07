// Send only the changed slot so stale reads cannot overwrite untouched party members.
// The board serializes presses to prevent two local edits from selecting the same empty slot.
#nullable enable

using System.Collections.Generic;
using System.Threading.Tasks;

using Gs2.Unity.Core;
using Gs2.Unity.Gs2Formation.Model;
using Gs2.Unity.Util;

using InventoryItemSet = Gs2.Gs2Inventory.Model.ItemSet;

namespace GS2Studio.Showroom.Demo
{
    internal static class FormationCommands
    {
        public const string Namespace = "CharacterFormation";

        public const string MoldModel = "CharacterFormation";

        /// <summary>Keep the inventory slot kind when clearing a slot; an empty body does not replace its type.</summary>
        private const string PropertyType = "gs2_inventory";

        public static async Task<string> PutIn(
            Gs2Domain gs2, IGameSession session, string characterPropertyId, int index)
        {
            var party = $"party {index + 1}";
            var occupied = await Occupied(gs2, session, index);
            foreach (var slot in occupied)
            {
                if (slot.Value == characterPropertyId)
                    return $"{CharacterName(characterPropertyId)} is already in {party}.";
            }

            string? empty = null;
            foreach (var name in await SlotNames(gs2, session))
            {
                if (!occupied.ContainsKey(name))
                {
                    empty = name;
                    break;
                }
            }
            if (empty == null) return $"The {party} is full.";

            var signed = await gs2.Inventory
                .Namespace(InventoryItemSet.GetNamespaceNameFromGrn(characterPropertyId))
                .Me(session)
                .Inventory(InventoryItemSet.GetInventoryNameFromGrn(characterPropertyId))
                // Sign the exact item set so separate recruits of the same character remain distinct.
                .ItemSet(
                    InventoryItemSet.GetItemNameFromGrn(characterPropertyId),
                    InventoryItemSet.GetItemSetNameFromGrn(characterPropertyId))
                .GetItemWithSignatureAsync();

            await new Gs2Bind.Gs2Formation.FormLoader(Namespace, MoldModel, index).SetForm(
                gs2, session,
                new[]
                {
                    new EzSlotWithSignature
                    {
                        Name = empty,
                        PropertyType = PropertyType,
                        Body = signed.Body,
                        Signature = signed.Signature,
                    },
                });
            // The subscribed board displays the result, so a successful write needs no additional log line.
            return "";
        }

        public static async Task<string> TakeOut(
            Gs2Domain gs2, IGameSession session, string characterPropertyId, int index)
        {
            string? held = null;
            foreach (var slot in await Occupied(gs2, session, index))
            {
                if (slot.Value == characterPropertyId)
                {
                    held = slot.Key;
                    break;
                }
            }
            if (held == null)
                return $"{CharacterName(characterPropertyId)} is not in party {index + 1}.";

            await new Gs2Bind.Gs2Formation.FormLoader(Namespace, MoldModel, index).SetForm(
                gs2, session,
                new[]
                {
                    new EzSlotWithSignature
                    {
                        Name = held,
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
            var model = await new Gs2Bind.Gs2Formation.FormModelLoader(Namespace, MoldModel).Load(gs2, session);
            var names = new List<string>();
            if (model?.Slots == null) return names;
            foreach (var slot in model.Slots)
            {
                if (!string.IsNullOrEmpty(slot.Name)) names.Add(slot.Name);
            }
            return names;
        }

        public static string CharacterName(string propertyId)
        {
            var name = InventoryItemSet.GetItemNameFromGrn(propertyId);
            return string.IsNullOrEmpty(name) ? propertyId : name;
        }

        private static async Task<Dictionary<string, string>> Occupied(
            Gs2Domain gs2, IGameSession session, int index)
        {
            var form = await new Gs2Bind.Gs2Formation.FormLoader(Namespace, MoldModel, index)
                .LoadOrNull(gs2, session);
            var occupied = new Dictionary<string, string>();
            if (form?.Slots == null) return occupied;
            foreach (var slot in form.Slots)
            {
                if (string.IsNullOrEmpty(slot.Name) || string.IsNullOrEmpty(slot.PropertyId)) continue;
                occupied[slot.Name] = slot.PropertyId;
            }
            return occupied;
        }
    }
}

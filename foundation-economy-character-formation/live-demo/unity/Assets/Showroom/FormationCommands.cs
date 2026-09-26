// Putting a character in a party and taking it out again.
//
// A slot in a GS2-Formation party holds a property id, and the formation only
// takes one that the inventory holding it has signed: the page asks the
// character inventory for a signed copy of the item set this row shows, and
// hands the body and the signature to the formation. That is why these are
// written by hand rather than generated. The formation's catalog offers no
// delegated action that sets a slot, and a server-side exchange would have to
// skip the signature check to do it for the player.
//
// Setting a form merges by slot name: slots the call does not name stay as
// they are, a named slot is replaced, and a named slot with no body is
// emptied. So both presses send exactly one slot.
//
// The party being edited is the page's own state rather than GS2's, so it
// lives here, beside the two presses that read it.
//
// Nothing here reloads or invalidates anything. Setting a form puts the new
// form into the SDK cache, and the party list subscribes to it.
#nullable enable

using System;
using System.Collections.Generic;
using System.Threading.Tasks;

using Gs2.Unity.Core;
using Gs2.Unity.Gs2Formation.Model;
using Gs2.Unity.Util;

using GS2Studio.Generated.Runtime;

using InventoryItemSet = Gs2.Gs2Inventory.Model.ItemSet;

namespace GS2Studio.Showroom.Demo
{
    /// <summary>
    /// The party being edited, and the two presses that change it.
    /// </summary>
    internal static class FormationCommands
    {
        /// <summary>The formation namespace the feature package deploys.</summary>
        public const string Namespace = "CharacterFormation";

        /// <summary>The one party shape the demo package defines.</summary>
        public const string MoldModel = "CharacterFormation";

        /// <summary>
        /// What a slot holds. GS2 requires it on every slot sent, the emptying
        /// one included, and silently drops a slot of any other type.
        /// </summary>
        private const string PropertyType = "gs2_inventory";

        /// <summary>The party the presses act on, counted from 0.</summary>
        public static int EditingIndex { get; private set; }

        /// <summary>Raised with the new index when the party being edited changes.</summary>
        public static event Action<int>? EditingChanged;

        /// <summary>
        /// Whether a press is between reading the party and writing it. Two
        /// presses in that window would both see the same empty slot, and the
        /// second write would replace the first.
        /// </summary>
        private static bool _inFlight;

        private static bool _switching;

        /// <summary>
        /// Moves the edit to the next party, back to the first after the last.
        /// Only parties the player has are visited: reading a form past the
        /// capacity creates a record GS2 then refuses to use.
        /// </summary>
        public static async Task NextParty()
        {
            if (_switching) return;
            _switching = true;
            try
            {
                var (gs2, session) = Runtime();
                var capacity = await Capacity(gs2, session);
                if (capacity <= 0) return;
                EditingIndex = (EditingIndex + 1) % capacity;
                EditingChanged?.Invoke(EditingIndex);
            }
            finally
            {
                _switching = false;
            }
        }

        /// <summary>
        /// Puts the character in the first empty slot of the party being
        /// edited. Returns a note for the page when there was nothing to do,
        /// or null when the slot was set.
        ///
        /// A character already in this party stays where it is. The same
        /// character in another party is allowed, as GS2 allows it.
        /// </summary>
        public static async Task<string?> PutIn(string characterPropertyId)
        {
            if (_inFlight) return "Still saving the last change.";
            _inFlight = true;
            try
            {
                var (gs2, session) = Runtime();
                var index = EditingIndex;
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
                    // The item set is named on purpose: a character is one item
                    // set per recruit, and without the name the signature covers
                    // every set of the item and GS2 takes the first of them.
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
                return null;
            }
            finally
            {
                _inFlight = false;
            }
        }

        /// <summary>
        /// Empties the slot of the party being edited that holds the character.
        /// Returns a note for the page when the character is not in it, or null
        /// when the slot was emptied.
        /// </summary>
        public static async Task<string?> TakeOut(string characterPropertyId)
        {
            if (_inFlight) return "Still saving the last change.";
            _inFlight = true;
            try
            {
                var (gs2, session) = Runtime();
                var index = EditingIndex;
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
                return null;
            }
            finally
            {
                _inFlight = false;
            }
        }

        /// <summary>How many parties the player has.</summary>
        public static async Task<int> Capacity(Gs2Domain gs2, IGameSession session)
        {
            var mold = await new Gs2Bind.Gs2Formation.MoldLoader(Namespace, MoldModel).Load(gs2, session);
            return mold?.Capacity ?? 0;
        }

        /// <summary>
        /// The slot names of the party shape, in the order the shape lists
        /// them. A form only carries the slots that were ever set, so this is
        /// where the empty ones come from.
        /// </summary>
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

        /// <summary>
        /// The character's name as the page shows it: the item name inside its
        /// item set GRN, or the whole id when it is not one.
        /// </summary>
        public static string CharacterName(string propertyId)
        {
            var name = InventoryItemSet.GetItemNameFromGrn(propertyId);
            return string.IsNullOrEmpty(name) ? propertyId : name;
        }

        /// <summary>The signed-in session these calls travel on.</summary>
        public static (Gs2Domain Gs2, IGameSession Session) Runtime()
        {
            var runtime = UnityEngine.Object.FindAnyObjectByType<Gs2HolderRuntimeContextProvider>();
            if (runtime == null || !runtime.TryGet(out var gs2, out var session) ||
                gs2 == null || session == null)
            {
                throw new InvalidOperationException("The GS2 runtime context is not available.");
            }
            return (gs2, session);
        }

        /// <summary>The filled slots of one party, by slot name.</summary>
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

// The slots of one party, as one line of text.
//
// A party's slots are a list inside its row, and the page draws a row's values
// one per line, not a list within a row. So this reads the list off the row's
// handler and publishes it as text: "Party 1: slot1 knight / slot2 - / slot3 -".
//
// A form only carries the slots that were ever set, so the slot names and
// their order come from the party shape, and a slot the form does not fill
// shows "-". A character is shown by its item name, read out of the item set
// GRN the slot holds.
#nullable enable

using System;
using System.Collections.Generic;
using System.Globalization;
using System.Text;

using UnityEngine;
using UnityEngine.Events;

using GS2Studio.Generated.CharacterFormationForm;

namespace GS2Studio.Showroom.Demo
{
    /// <summary>
    /// Publishes the slots of the party row it sits in, whenever the row
    /// updates.
    /// </summary>
    [AddComponentMenu("GS2 Studio/Showroom/Party Slots")]
    public sealed class CharacterFormationFormSlotsLabel : MonoBehaviour
    {
        [SerializeField] private UnityEvent<string> _onUpdate = new UnityEvent<string>();

        public UnityEvent<string> OnUpdate => _onUpdate;

        private CharacterFormationFormHandlerBase? _handler;

        /// <summary>
        /// The party shape's slot names. Read once: the shape is master data
        /// and does not move while the page is open.
        /// </summary>
        private static IReadOnlyList<string>? _slotNames;

        /// <summary>The latest model, so a slower earlier read cannot overwrite it.</summary>
        private CharacterFormationForm? _latest;

        private void OnEnable()
        {
            _handler ??= GetComponentInParent<CharacterFormationFormHandlerBase>();
            if (_handler == null)
            {
                Debug.LogError("CharacterFormationFormSlotsLabel: no party row above this label.", this);
                return;
            }
            _handler.Updated += OnUpdated;
            if (_handler.HasValue && _handler.Model != null) OnUpdated(_handler.Model);
        }

        private void OnDisable()
        {
            if (_handler != null) _handler.Updated -= OnUpdated;
        }

        private async void OnUpdated(CharacterFormationForm model)
        {
            _latest = model;
            if (_slotNames == null)
            {
                try
                {
                    var (gs2, session) = FormationCommands.Runtime();
                    _slotNames = await FormationCommands.SlotNames(gs2, session);
                }
                catch (Exception error)
                {
                    Debug.LogError($"CharacterFormationFormSlotsLabel: the party shape could not be read: {error}", this);
                    return;
                }
            }
            if (!ReferenceEquals(model, _latest) || this == null) return;
            _onUpdate.Invoke(Format(model, _slotNames));
        }

        private static string Format(CharacterFormationForm model, IReadOnlyList<string> slotNames)
        {
            var filled = new Dictionary<string, string>();
            if (model.Slots != null)
            {
                foreach (var slot in model.Slots)
                {
                    if (string.IsNullOrEmpty(slot.Id.Value) || string.IsNullOrEmpty(slot.PropertyId)) continue;
                    filled[slot.Id.Value] = slot.PropertyId;
                }
            }

            var text = new StringBuilder();
            text.Append("Party ");
            text.Append(int.TryParse(model.Id.Value, NumberStyles.Integer, CultureInfo.InvariantCulture, out var index)
                ? (index + 1).ToString(CultureInfo.InvariantCulture)
                : model.Id.Value);
            text.Append(':');
            for (var position = 0; position < slotNames.Count; position++)
            {
                var name = slotNames[position];
                text.Append(position == 0 ? " " : " / ");
                text.Append(name);
                text.Append(' ');
                text.Append(filled.TryGetValue(name, out var character)
                    ? FormationCommands.CharacterName(character)
                    : "-");
            }
            return text.ToString();
        }
    }
}

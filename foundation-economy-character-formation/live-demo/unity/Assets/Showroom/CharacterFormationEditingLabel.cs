// Saying which party the character rows put characters in.
//
// "Editing party 1 of 2": the party being edited, out of the parties the
// player has. The count is the formation's own capacity, read off the row this
// label sits in, so Expand moves it without anything here asking again.
#nullable enable

using UnityEngine;
using UnityEngine.Events;

using GS2Studio.Generated.CharacterFormation;

namespace GS2Studio.Showroom.Demo
{
    /// <summary>
    /// Publishes which party is being edited, whenever that or the number of
    /// parties changes.
    /// </summary>
    [AddComponentMenu("GS2 Studio/Showroom/Party Being Edited")]
    public sealed class CharacterFormationEditingLabel : MonoBehaviour
    {
        [SerializeField] private UnityEvent<string> _onUpdate = new UnityEvent<string>();

        public UnityEvent<string> OnUpdate => _onUpdate;

        private CharacterFormationHandlerBase? _handler;
        private int _capacity;

        private void OnEnable()
        {
            _handler ??= GetComponentInParent<CharacterFormationHandlerBase>();
            if (_handler == null)
            {
                Debug.LogError("CharacterFormationEditingLabel: no formation row above this label.", this);
                return;
            }
            _handler.Updated += OnUpdated;
            FormationCommands.EditingChanged += OnEditingChanged;
            if (_handler.HasValue && _handler.Model != null) OnUpdated(_handler.Model);
            else Publish();
        }

        private void OnDisable()
        {
            if (_handler != null) _handler.Updated -= OnUpdated;
            FormationCommands.EditingChanged -= OnEditingChanged;
        }

        private void OnUpdated(CharacterFormation model)
        {
            _capacity = model.CurrentSaveArea;
            Publish();
        }

        private void OnEditingChanged(int index) => Publish();

        private void Publish()
        {
            var party = FormationCommands.EditingIndex + 1;
            _onUpdate.Invoke(_capacity > 0
                ? $"Editing party {party} of {_capacity}"
                : $"Editing party {party}");
        }
    }
}

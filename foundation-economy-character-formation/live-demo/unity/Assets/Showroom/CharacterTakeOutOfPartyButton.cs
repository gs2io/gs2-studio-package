// Taking the character this row shows out of the party being edited.
//
// The slot it sits in is emptied; the other slots stay as they are. The
// work is in FormationCommands; this is the press.
//
// Shaped like a generated action button on purpose, a `Button` to wire and an
// `OnCompleted` to raise, because that is what the page knows how to draw.
#nullable enable

using System;
using System.Threading.Tasks;

using UnityEngine;
using UnityEngine.Events;
using UnityEngine.UI;

using Gs2.Core.Exception;
using Gs2.Unity.Util;

using GS2Studio.Generated.Character;
using GS2Studio.Generated.Runtime;

namespace GS2Studio.Showroom.Demo
{
    /// <summary>
    /// Empties the slot of the party being edited that holds this row's character.
    /// </summary>
    [AddComponentMenu("GS2 Studio/Showroom/Take This Character Out Of The Party")]
    public sealed class CharacterTakeOutOfPartyButton : MonoBehaviour
    {
        [SerializeField] private Button? _button;

        /// <summary>Raised once the party has changed on the server.</summary>
        [SerializeField] private UnityEvent _onCompleted = new UnityEvent();

        /// <summary>
        /// Raised when GS2 refuses the press. Anything else goes to the page as
        /// text, since the page's error channel only carries a GS2 error.
        /// </summary>
        [SerializeField] private ErrorEvent _onFailed = new ErrorEvent();

        public UnityEvent OnCompleted => _onCompleted;
        public ErrorEvent OnFailed => _onFailed;

        private CharacterHandlerBase? _handler;
        private ShowroomPage? _page;
        private bool _wired;

        private void OnEnable()
        {
            _handler ??= GetComponentInParent<CharacterHandlerBase>();
            if (_button == null || _wired) return;
            _button.onClick.AddListener(OnClicked);
            _wired = true;
        }

        private void OnDisable()
        {
            if (_button == null || !_wired) return;
            _button.onClick.RemoveListener(OnClicked);
            _wired = false;
        }

        private async void OnClicked()
        {
            var character = _handler?.Binder?.PropertyId;
            if (string.IsNullOrEmpty(character))
            {
                // The row has no property id yet: a character's GRN arrives
                // with the inventory read, and a click that early is a click
                // on a row still arriving.
                return;
            }

            string? note;
            try
            {
                note = await FormationCommands.TakeOut(character!);
            }
            catch (Gs2Exception error)
            {
                _onFailed.Invoke(error, null);
                Debug.LogError($"CharacterTakeOutOfPartyButton: take out failed: {error}", this);
                return;
            }
            catch (Exception error)
            {
                Report($"Take out failed: {error.Message}");
                Debug.LogError($"CharacterTakeOutOfPartyButton: take out failed: {error}", this);
                return;
            }
            if (note != null)
            {
                Report(note);
                return;
            }
            _onCompleted.Invoke();
        }

        private void Report(string message)
        {
            _page ??= FindAnyObjectByType<ShowroomPage>();
            if (_page != null) _page.Log(message);
        }
    }
}

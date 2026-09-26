// Choosing which party the presses on the character rows edit.
//
// The party being edited is the page's state, not GS2's: the player has as
// many parties as the formation's capacity, and this steps through them, back
// to the first after the last. It never reads a party past the capacity,
// because reading a form there makes a record GS2 then refuses to use.
#nullable enable

using System;

using UnityEngine;
using UnityEngine.Events;
using UnityEngine.UI;

using Gs2.Core.Exception;
using Gs2.Unity.Util;

using GS2Studio.Generated.Runtime;

namespace GS2Studio.Showroom.Demo
{
    /// <summary>
    /// Moves the edit to the next party the player has.
    /// </summary>
    [AddComponentMenu("GS2 Studio/Showroom/Edit The Next Party")]
    public sealed class CharacterFormationNextPartyButton : MonoBehaviour
    {
        [SerializeField] private Button? _button;

        /// <summary>Raised once the edit has moved.</summary>
        [SerializeField] private UnityEvent _onCompleted = new UnityEvent();

        /// <summary>Raised when GS2 refuses the capacity read.</summary>
        [SerializeField] private ErrorEvent _onFailed = new ErrorEvent();

        public UnityEvent OnCompleted => _onCompleted;
        public ErrorEvent OnFailed => _onFailed;

        private ShowroomPage? _page;
        private bool _wired;

        private void OnEnable()
        {
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
            try
            {
                await FormationCommands.NextParty();
            }
            catch (Gs2Exception error)
            {
                _onFailed.Invoke(error, null);
                Debug.LogError($"CharacterFormationNextPartyButton: failed: {error}", this);
                return;
            }
            catch (Exception error)
            {
                _page ??= FindAnyObjectByType<ShowroomPage>();
                if (_page != null) _page.Log($"Next party failed: {error.Message}");
                Debug.LogError($"CharacterFormationNextPartyButton: failed: {error}", this);
                return;
            }
            _onCompleted.Invoke();
        }
    }
}

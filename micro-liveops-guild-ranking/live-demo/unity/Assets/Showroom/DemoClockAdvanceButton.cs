// A button that moves the player's clock forward by a fixed amount.
//
// Shaped like a generated action button on purpose (a `Button` to wire, an
// `OnCompleted` to raise and an `OnFailed` to report through) because that is
// what the page knows how to draw. Each concrete button says only how far.
#nullable enable

using UnityEngine;
using UnityEngine.Events;
using UnityEngine.UI;

using Gs2.Unity.Util;

namespace GS2Studio.Showroom.Demo
{
    /// <summary>
    /// Moves the signed-in player's clock on GS2 forward by <see cref="Seconds"/>.
    /// </summary>
    public abstract class DemoClockAdvanceButton : MonoBehaviour
    {
        [SerializeField] private Button? _button;

        /// <summary>
        /// Raised once the account has the new offset and the session has
        /// signed in with it.
        /// </summary>
        [SerializeField] private UnityEvent _onCompleted = new UnityEvent();

        /// <summary>
        /// Raised when GS2 refuses the new offset. Anything else goes to the
        /// page as text.
        /// </summary>
        [SerializeField] private ErrorEvent _onFailed = new ErrorEvent();

        public UnityEvent OnCompleted => _onCompleted;
        public ErrorEvent OnFailed => _onFailed;

        /// <summary>How far one press moves the clock.</summary>
        protected abstract int Seconds { get; }

        private bool _wired;
        private ShowroomPage? _page;

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
            if (_button != null) _button.interactable = false;
            try
            {
                // A click has nothing to resume from, so no retry is offered.
                if (await DemoClockAdvance.Advance(Seconds, Report, error => _onFailed.Invoke(error, null)))
                {
                    _onCompleted.Invoke();
                }
            }
            finally
            {
                if (this != null && _button != null) _button.interactable = true;
            }
        }

        /// <summary>
        /// Put a message where a visitor can see it: a browser hides the
        /// console, and the page's error channel carries only a `Gs2Exception`.
        /// </summary>
        private void Report(string message)
        {
            _page ??= FindAnyObjectByType<ShowroomPage>();
            if (_page != null) _page.Log(message);
        }
    }
}

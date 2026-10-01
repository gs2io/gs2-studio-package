// A button that moves the player's clock forward by a fixed amount.
//
// Shaped like a generated action button on purpose (a `Button` to wire, an
// `OnCompleted` to raise and an `OnFailed` to report through) because that is
// what the page knows how to draw. Each concrete button says only how far,
// under the name `page.json` gives its row.
//
// The advance runs through `ShowroomPress`, like every hand-written press: it
// waits its turn with every other press on the page and for the page to
// settle, a refusal goes to `OnFailed` (or is said by the runner when nothing
// live is wired there), and the button is not interactable while it is out.
// It is not a `ShowroomPressButton` only because an advance can stop short
// without a refusal (the clock could not be read, or moved but the session
// did not sign in again), and `OnCompleted` is raised only for one that the
// session now runs on.
//
// Abstract, and must stay so: the page builder offers every non-abstract
// demo-written `MonoBehaviour` as a row.
#nullable enable

using UnityEngine;
using UnityEngine.Events;
using UnityEngine.UI;

using Gs2.Unity.Util;

namespace GS2Studio.Showroom
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

        private void OnClicked()
        {
            var applied = false;
            // Off before the run, not after: a press that finishes without
            // waiting runs `Afterward` (which turns it back on) inside `Run`.
            if (_button != null) _button.interactable = false;
            var started = ShowroomPress.Run(new ShowroomPressOptions
            {
                Name = GetType().Name,
                Owner = this,
                Unexplained = ShowroomPressButton.HasLiveListener(_onFailed)
                    // A click has nothing to resume from, so no retry is offered.
                    ? error => _onFailed.Invoke(error, null)
                    : null,
                Afterward = () =>
                {
                    if (_button != null) _button.interactable = true;
                    if (applied) _onCompleted.Invoke();
                },
            }, async (gs2, session) =>
            {
                var outcome = await DemoClockAdvance.Advance(gs2, session, Seconds);
                applied = outcome.Applied;
                return outcome.Line;
            });
            if (!started && _button != null) _button.interactable = true;
        }
    }
}

// The page builder discovers concrete behaviours as rows, so this base must stay abstract.
#nullable enable

using UnityEngine;
using UnityEngine.Events;
using UnityEngine.UI;

using Gs2.Unity.Util;

namespace GS2Studio.Showroom
{
    public abstract class DemoClockAdvanceButton : MonoBehaviour
    {
        [SerializeField] private Button? _button;

        // Updating the account can succeed before session refresh fails; that is not completion.
        [SerializeField] private UnityEvent _onCompleted = new UnityEvent();

        [SerializeField] private ErrorEvent _onFailed = new ErrorEvent();

        public UnityEvent OnCompleted => _onCompleted;
        public ErrorEvent OnFailed => _onFailed;

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
            // Run may complete synchronously and re-enable the button through Afterward.
            if (_button != null) _button.interactable = false;
            var started = ShowroomPress.Run(new ShowroomPressOptions
            {
                Name = GetType().Name,
                Owner = this,
                Unexplained = ShowroomPressButton.HasLiveListener(_onFailed)
                    // A click has no continuation for an error handler to retry.
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

// The page builder discovers concrete behaviours as rows, so this base must stay abstract.
#nullable enable

using System.Threading.Tasks;

using UnityEngine;
using UnityEngine.Events;
using UnityEngine.UI;

using Gs2.Core.Exception;
using Gs2.Unity.Util;

namespace GS2Studio.Showroom
{
    public abstract class ShowroomPressButton : MonoBehaviour
    {
        [SerializeField] private Button? _button;

        [SerializeField] private UnityEvent _onCompleted = new UnityEvent();

        [SerializeField] private ErrorEvent _onFailed = new ErrorEvent();

        public UnityEvent OnCompleted => _onCompleted;
        public ErrorEvent OnFailed => _onFailed;

        private bool _wired;

        protected abstract Task<string> Press();

        protected virtual string? Explain(Gs2Exception error) => null;

        protected virtual string PressName => GetType().Name;

        protected virtual void OnEnable()
        {
            if (_button == null || _wired) return;
            _button.onClick.AddListener(OnClicked);
            _wired = true;
        }

        protected virtual void OnDisable()
        {
            if (_button == null || !_wired) return;
            _button.onClick.RemoveListener(OnClicked);
            _wired = false;
        }

        private void OnClicked()
        {
            var completed = false;
            // Run may finish synchronously and re-enable the button through Afterward.
            if (_button != null) _button.interactable = false;
            var started = ShowroomPress.Run(new ShowroomPressOptions
            {
                Name = PressName,
                Owner = this,
                Explain = Explain,
                // Only baked listeners count; otherwise the runner reports the refusal itself.
                Unexplained = HasLiveListener(_onFailed)
                    // A click has no continuation for an error handler to retry.
                    ? error => _onFailed.Invoke(error, null)
                    : null,
                Afterward = () =>
                {
                    if (_button != null) _button.interactable = true;
                    if (completed) _onCompleted.Invoke();
                },
            }, async (_, _) =>
            {
                var line = await Press();
                completed = true;
                return line;
            });
            if (!started && _button != null) _button.interactable = true;
        }

        // A prefab can retain a baked listener whose scene target no longer exists;
        // delegating the error to it would silently discard the refusal.
        internal static bool HasLiveListener(ErrorEvent onFailed)
        {
            var count = onFailed.GetPersistentEventCount();
            for (var i = 0; i < count; i++)
            {
                if (onFailed.GetPersistentTarget(i) != null) return true;
            }
            return false;
        }
    }
}

// A hand-written button that runs one press and answers in words.
//
// Shaped like a generated action button on purpose (a `Button` to wire, an
// `OnCompleted` to raise and an `OnFailed` to report through) because that is
// what the page builder knows how to draw: a demo's concrete subclass becomes
// an action row by name, and the builder wires `_button`, and `OnFailed` to the
// page's log. A subclass says only what the press does.
//
// The press runs through `ShowroomPress`, so it waits its turn with every
// other press on the page and for the page to settle, and the button is not
// interactable while it is out. A refusal the subclass explains
// (`Explain`) is said in those words; any other refusal goes to `OnFailed`
// when something is wired to it, and is said by the runner otherwise, so it
// is said once either way.
//
// Abstract, and must stay so: the page builder offers every non-abstract
// demo-written `MonoBehaviour` as a row, and this one is not a row on its own.
#nullable enable

using System.Threading.Tasks;

using UnityEngine;
using UnityEngine.Events;
using UnityEngine.UI;

using Gs2.Core.Exception;
using Gs2.Unity.Util;

namespace GS2Studio.Showroom
{
    /// <summary>Runs one press when its button is clicked, and puts its answer on the page.</summary>
    public abstract class ShowroomPressButton : MonoBehaviour
    {
        [SerializeField] private Button? _button;

        /// <summary>Raised once the press has been answered.</summary>
        [SerializeField] private UnityEvent _onCompleted = new UnityEvent();

        /// <summary>Raised when GS2 refuses the press in a way the press does not explain.</summary>
        [SerializeField] private ErrorEvent _onFailed = new ErrorEvent();

        public UnityEvent OnCompleted => _onCompleted;
        public ErrorEvent OnFailed => _onFailed;

        private bool _wired;

        /// <summary>The press itself; returns what the page should say ("" for nothing).</summary>
        protected abstract Task<string> Press();

        /// <summary>
        /// The page's line for a refusal this press can explain in its own
        /// terms, or null for one it cannot.
        /// </summary>
        protected virtual string? Explain(Gs2Exception error) => null;

        /// <summary>What the press is, for the console line about a failure.</summary>
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
            // Off before the run, not after: a press that finishes without
            // waiting runs `Afterward` (which turns it back on) inside `Run`.
            if (_button != null) _button.interactable = false;
            var started = ShowroomPress.Run(new ShowroomPressOptions
            {
                Name = PressName,
                Owner = this,
                Explain = Explain,
                // Persistent listeners are what the page builder bakes; a
                // listener added at run time is not counted, and such a
                // refusal is said by the runner instead.
                Unexplained = _onFailed.GetPersistentEventCount() > 0
                    // A click has nothing to resume from, so no retry is offered.
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
    }
}

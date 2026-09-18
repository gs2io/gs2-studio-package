// Drawing, as this demo does it.
//
// The gacha is sold through a showcase, and the feature package delegates
// `Buy` on the gacha to that display item: the generated binder carries the
// press, and the draw's cost and prizes are the package's master data. What
// the package does not carry is a button, because a package cannot put a
// button on an action another package declared; so the demo presses `Buy`
// from a behaviour of its own, and the row is drawn like any other.
//
// One behaviour per file: Unity binds a script asset to the class that shares
// its name, and a second MonoBehaviour in the same file is not a component it
// can find.
#nullable enable

using System;
using System.Threading.Tasks;

using UnityEngine;
using UnityEngine.Events;
using UnityEngine.UI;

using Gs2.Core.Exception;
using Gs2.Unity.Util;

using GS2Studio.Generated.Gacha;
using GS2Studio.Generated.Runtime;

namespace GS2Studio.Showroom.Demo
{
    /// <summary>
    /// Draws once from the gacha this row shows.
    ///
    /// Shaped like a generated action button on purpose — a `Button` to wire
    /// and an `OnCompleted` to raise — because that is what the page knows how
    /// to draw. The draw's cost leaves the wallet and its prize lands in the
    /// roster, and both read their own handlers, which is what `OnCompleted`
    /// is for.
    /// </summary>
    [AddComponentMenu("GS2 Studio/Showroom/Draw This Gacha")]
    public sealed class GachaBuyButton : MonoBehaviour
    {
        /// <summary>One pull per press. The showcase sells the draw by count.</summary>
        private const int DrawsPerPress = 1;

        [SerializeField] private GachaHandlerBase? _handler;
        [SerializeField] private Button? _button;

        /// <summary>
        /// Raised once the draw has committed. The wallet and the roster read
        /// through their own handlers, which have no way to know an unrelated
        /// component just moved them.
        /// </summary>
        [SerializeField] private UnityEvent _onCompleted = new UnityEvent();

        /// <summary>
        /// Raised when the draw fails with a GS2 error, which is what the page
        /// knows how to show. Anything else goes to the page as text — see
        /// <see cref="Report"/>, and why it has to.
        /// </summary>
        [SerializeField] private ErrorEvent _onFailed = new ErrorEvent();

        public UnityEvent OnCompleted => _onCompleted;
        public ErrorEvent OnFailed => _onFailed;

        private bool _wired;
        private ShowroomPage? _page;

        private void OnEnable()
        {
            if (_handler == null) _handler = GetComponentInParent<GachaHandlerBase>();
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
                await Draw();
            }
            catch (Gs2Exception error)
            {
                // A click has nothing to resume from, so no retry is offered.
                _onFailed.Invoke(error, null);
                Debug.LogError($"GachaBuyButton: draw failed: {error}", this);
                return;
            }
            catch (Exception error)
            {
                Report($"Draw failed: {error.Message}");
                Debug.LogError($"GachaBuyButton: draw failed: {error}", this);
                return;
            }
            _onCompleted.Invoke();
        }

        private async Task Draw()
        {
            var binder = _handler?.Binder;
            if (binder == null)
            {
                // The row has no gacha yet, which is not a failure to report:
                // the handler raises `Bound` when it has one, and a click that
                // early is a click on a row that is still arriving.
                return;
            }
            await binder.Buy(DrawsPerPress);
        }

        /// <summary>
        /// Put a failure where a visitor can see it.
        ///
        /// The page's error channel carries a `Gs2Exception`, so a failure of
        /// any other kind cannot travel it — and a browser hides the console,
        /// which is where it would otherwise be the only record.
        /// </summary>
        private void Report(string message)
        {
            _page ??= FindAnyObjectByType<ShowroomPage>();
            if (_page != null) _page.Log(message);
        }
    }
}

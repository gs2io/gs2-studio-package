// A press on the contest that answers in words: Play and Receive.
//
// Shaped like a generated action button on purpose (a `Button` to wire, an
// `OnCompleted` to raise and an `OnFailed` to report through) because that is
// what the page knows how to draw. What each press says goes to the page's log,
// since a browser hides the console.
#nullable enable

using System;
using System.Threading.Tasks;

using UnityEngine;
using UnityEngine.Events;
using UnityEngine.UI;

using Gs2.Core.Exception;
using Gs2.Unity.Util;

namespace GS2Studio.Showroom.Demo
{
    /// <summary>Runs one contest press and puts its answer on the page.</summary>
    public abstract class ContestPress : MonoBehaviour
    {
        [SerializeField] private Button? _button;

        /// <summary>Raised once the press has been answered.</summary>
        [SerializeField] private UnityEvent _onCompleted = new UnityEvent();

        /// <summary>Raised when GS2 refuses the press.</summary>
        [SerializeField] private ErrorEvent _onFailed = new ErrorEvent();

        public UnityEvent OnCompleted => _onCompleted;
        public ErrorEvent OnFailed => _onFailed;

        private bool _wired;
        private ShowroomPage? _page;

        /// <summary>The press itself; returns what the page should say.</summary>
        private protected abstract Task<string> Press(RankingContestState contest);

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
                var message = await Press(RankingContestState.Shared);
                if (this == null) return;
                if (message.Length > 0) Report(message);
                _onCompleted.Invoke();
            }
            catch (Gs2Exception error)
            {
                // A click has nothing to resume from, so no retry is offered.
                if (this != null) _onFailed.Invoke(error, null);
            }
            catch (Exception error)
            {
                if (this != null) Report(error.Message);
            }
            finally
            {
                if (this != null && _button != null) _button.interactable = true;
            }
        }

        private void Report(string message)
        {
            _page ??= FindAnyObjectByType<ShowroomPage>();
            if (_page != null) _page.Log(message);
        }
    }
}

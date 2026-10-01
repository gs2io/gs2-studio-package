// One Copy or Paste a panel asked the browser for, until the browser answers.
//
// The clipboard API is asynchronous and may ask the visitor for permission,
// so `ShowroomClipboard` only starts a request and is asked each frame for
// the outcome. A browser can leave a permission prompt open, or never settle,
// so a request that has not been answered in 10 seconds is given up on (a late
// answer is dropped) and reported as refused with "no answer".
//
// The browser side holds one request at a time for the whole page, so this
// does too: while one panel's request is out, another panel's Copy or Paste
// is refused (returns false). A request whose owner stopped polling it (a
// panel disabled without `Abandon`) blocks the others only until its deadline.
//
// A refusal is not a failure of the page: the browser decides. The callbacks
// get the browser's reason so the panel can tell the visitor how to do it by
// hand. Nothing pasted is logged here, because it may hold a password.
//
// Main thread only: the owner calls `Poll` from `Update`, and the callbacks
// run there.
#nullable enable

using System;

using UnityEngine;

namespace GS2Studio.Showroom
{
    /// <summary>A panel's clipboard request, with a deadline.</summary>
    public sealed class ShowroomClipboardRequest
    {
        /// <summary>How long the browser may take to answer.</summary>
        public const float Seconds = 10f;

        /// <summary>The request the browser is working on, page-wide.</summary>
        private static ShowroomClipboardRequest? _current;

        private float _deadline;
        private Action<string>? _onDone;
        private Action<string>? _onRefused;

        /// <summary>Whether this panel's request is out.</summary>
        public bool Pending => _current == this;

        /// <summary>
        /// Asks the browser to copy <paramref name="text"/>. Returns false,
        /// and starts nothing, while another request is out.
        /// </summary>
        public bool Copy(string text, Action onCopied, Action<string> onRefused)
        {
            if (onCopied == null) throw new ArgumentNullException(nameof(onCopied));
            if (!Begin(_ => onCopied(), onRefused)) return false;
            ShowroomClipboard.Copy(text ?? "");
            return true;
        }

        /// <summary>
        /// Asks the browser for the clipboard's text. Returns false, and
        /// starts nothing, while another request is out.
        /// </summary>
        public bool Paste(Action<string> onPasted, Action<string> onRefused)
        {
            if (onPasted == null) throw new ArgumentNullException(nameof(onPasted));
            if (!Begin(onPasted, onRefused)) return false;
            ShowroomClipboard.Paste();
            return true;
        }

        /// <summary>
        /// Hands over the browser's answer once it has one, or a refusal once
        /// the deadline passed. Call every frame while <see cref="Pending"/>.
        /// </summary>
        public void Poll()
        {
            if (_current != this) return;
            var outcome = ShowroomClipboard.Poll(out var text);
            if (outcome == ShowroomClipboard.Outcome.Waiting)
            {
                if (Time.realtimeSinceStartup < _deadline) return;
                ShowroomClipboard.Abandon();
                outcome = ShowroomClipboard.Outcome.Refused;
                text = "no answer";
            }
            var onDone = _onDone;
            var onRefused = _onRefused;
            Release();
            if (outcome == ShowroomClipboard.Outcome.Done) onDone?.Invoke(text);
            else onRefused?.Invoke(text);
        }

        /// <summary>Gives up on this panel's request; its answer is dropped and no callback runs.</summary>
        public void Abandon()
        {
            if (_current != this) return;
            ShowroomClipboard.Abandon();
            Release();
        }

        private bool Begin(Action<string> onDone, Action<string> onRefused)
        {
            if (onRefused == null) throw new ArgumentNullException(nameof(onRefused));
            if (_current != null && _current != this)
            {
                // A request nobody polled past its deadline is not waited for.
                if (Time.realtimeSinceStartup < _current._deadline) return false;
                _current.Abandon();
            }
            if (_current == this) return false;
            _current = this;
            _deadline = Time.realtimeSinceStartup + Seconds;
            _onDone = onDone;
            _onRefused = onRefused;
            return true;
        }

        private void Release()
        {
            _current = null;
            _onDone = null;
            _onRefused = null;
        }

        /// <summary>Starts every play session with no request out, with domain reload off or on.</summary>
        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.SubsystemRegistration)]
        private static void ResetOnPlay() => _current = null;
    }
}

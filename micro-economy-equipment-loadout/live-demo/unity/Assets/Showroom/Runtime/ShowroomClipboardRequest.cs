// Browser permission prompts may never settle; a deadline prevents a request from blocking all panels.
// Poll on the main thread because callbacks update Unity UI. Never log text that may contain passwords.
#nullable enable

using System;

using UnityEngine;

namespace GS2Studio.Showroom
{
    public sealed class ShowroomClipboardRequest
    {
        public const float Seconds = 10f;

        // The browser bridge has one slot for the page, so ownership must span all panels.
        private static ShowroomClipboardRequest? _current;

        private float _deadline;
        private Action<string>? _onDone;
        private Action<string>? _onRefused;

        public bool Pending => _current == this;

        public bool Copy(string text, Action onCopied, Action<string> onRefused)
        {
            if (onCopied == null) throw new ArgumentNullException(nameof(onCopied));
            if (!Begin(_ => onCopied(), onRefused)) return false;
            ShowroomClipboard.Copy(text ?? "");
            return true;
        }

        public bool Paste(Action<string> onPasted, Action<string> onRefused)
        {
            if (onPasted == null) throw new ArgumentNullException(nameof(onPasted));
            if (!Begin(onPasted, onRefused)) return false;
            ShowroomClipboard.Paste();
            return true;
        }

        // Release ownership before callbacks so a callback can start the next request.
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
                // A disabled owner may never poll again; reclaim its slot after the deadline.
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

        // Static ownership otherwise survives entering Play Mode with domain reload disabled.
        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.SubsystemRegistration)]
        private static void ResetOnPlay() => _current = null;
    }
}

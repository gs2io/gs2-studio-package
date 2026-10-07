// Use ShowroomClipboardRequest for ownership and timeout: the browser bridge has only one slot.
#nullable enable

#if UNITY_WEBGL && !UNITY_EDITOR
using System.Runtime.InteropServices;
#endif

using UnityEngine;

namespace GS2Studio.Showroom
{
    public static class ShowroomClipboard
    {
        public enum Outcome
        {
            Waiting,
            Done,
            Refused,
        }

#if UNITY_WEBGL && !UNITY_EDITOR
        [DllImport("__Internal")] private static extern void ShowroomClipboardCopy(string text);
        [DllImport("__Internal")] private static extern void ShowroomClipboardPaste();
        [DllImport("__Internal")] private static extern int ShowroomClipboardStatus();
        [DllImport("__Internal")] private static extern string ShowroomClipboardTake();
        [DllImport("__Internal")] private static extern void ShowroomClipboardAbandon();

        // Invalidate the bridge request so late promises cannot overwrite a newer request.
        public static void Abandon() => ShowroomClipboardAbandon();

        public static void Copy(string text) => ShowroomClipboardCopy(text);

        public static void Paste() => ShowroomClipboardPaste();

        public static Outcome Poll(out string text)
        {
            text = "";
            switch (ShowroomClipboardStatus())
            {
                case 2:
                    text = ShowroomClipboardTake();
                    return Outcome.Done;
                case 3:
                    text = ShowroomClipboardTake();
                    return Outcome.Refused;
                default:
                    return Outcome.Waiting;
            }
        }
#else
        private static Outcome _outcome = Outcome.Waiting;
        private static string _text = "";

        public static void Copy(string text)
        {
            GUIUtility.systemCopyBuffer = text;
            _outcome = Outcome.Done;
            _text = "";
        }

        public static void Paste()
        {
            _text = GUIUtility.systemCopyBuffer ?? "";
            _outcome = Outcome.Done;
        }

        public static void Abandon()
        {
            _outcome = Outcome.Waiting;
            _text = "";
        }

        public static Outcome Poll(out string text)
        {
            text = _text;
            var outcome = _outcome;
            _outcome = Outcome.Waiting;
            _text = "";
            return outcome;
        }
#endif
    }
}

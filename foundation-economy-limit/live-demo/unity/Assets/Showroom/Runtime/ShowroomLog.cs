// Use the main thread: writing a page log redraws Unity UI.
#nullable enable

using System;

using UnityEngine;

namespace GS2Studio.Showroom
{
    public static class ShowroomLog
    {
        private static ShowroomPage? _page;

        public static void Say(string? message)
        {
            if (string.IsNullOrEmpty(message)) return;
            var page = Page();
            if (page != null) page.Log(message!);
            else Debug.LogWarning($"[showroom] {message}");
        }

        // Console mirroring truncates messages, so wiring failures also need their full repair text.
        public static void SayWhole(string? message, UnityEngine.Object? context = null)
        {
            if (string.IsNullOrEmpty(message)) return;
            Debug.LogError(message, context);
            var page = Page();
            if (page != null) page.Log(message!);
        }

        // Errors are mirrored onto the page; a warning preserves diagnostic detail without a duplicate.
        public static void Failure(string what, Exception? error)
        {
            Debug.LogWarning($"[showroom] {what}: {error}");
            Say($"{what}: {ShowroomErrors.Describe(error)}");
        }

        private static ShowroomPage? Page()
        {
            // Do not use ??=: Unity objects destroyed with their scene are not C# null.
            if (_page == null) _page = UnityEngine.Object.FindAnyObjectByType<ShowroomPage>();
            return _page;
        }
    }
}

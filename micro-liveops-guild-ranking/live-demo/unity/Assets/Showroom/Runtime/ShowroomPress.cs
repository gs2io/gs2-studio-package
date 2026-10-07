// Concurrent presses race on shared state; reject overlap visibly instead of silently losing clicks.
// Existing SDK subscriptions deliver state changes, so press completion must not trigger another read.
// Invoke from the main thread so awaited continuations and callbacks return to Unity's context.
#nullable enable

using System;
using System.Threading.Tasks;

using UnityEngine;

using Gs2.Core.Exception;
using Gs2.Unity.Core;
using Gs2.Unity.Util;

namespace GS2Studio.Showroom
{
    public static class ShowroomPress
    {
        private static bool _busy;
        private static bool _frozen;

        public static bool Busy => _busy;

        // A press during account replacement would still act as the account being left.
        public static void Freeze() => _frozen = true;

        public static bool Run(ShowroomPressOptions options, Func<Gs2Domain, IGameSession, Task<string>> action)
        {
            if (options == null) throw new ArgumentNullException(nameof(options));
            if (action == null) throw new ArgumentNullException(nameof(action));
            if (_frozen)
            {
                if (options.Pressed) ShowroomLog.Say("The page is reloading.");
                return false;
            }
            if (_busy)
            {
                if (options.Pressed) ShowroomLog.Say("One moment: the last press is still going.");
                return false;
            }
            if (options.Pressed && !ShowroomSettle.Settled()) return false;
            if (!ShowroomRuntime.TryGet(out var gs2, out var session))
            {
                if (options.Pressed) ShowroomLog.Say("Not signed in yet.");
                return false;
            }
            _busy = true;
            Execute(options, gs2, session, action);
            return true;
        }

        private static async void Execute(ShowroomPressOptions options, Gs2Domain gs2, IGameSession session, Func<Gs2Domain, IGameSession, Task<string>> action)
        {
            string? line = null;
            Gs2Exception? unexplained = null;
            var gone = false;
            try
            {
                line = await action(gs2, session);
            }
            catch (Gs2Exception error)
            {
                Debug.LogWarning($"[showroom] {options.Name} refused: {(options.Redact ? ShowroomErrors.Summary(error) : error.ToString())}");
                gone = error is NotFoundException;
                line = Explained(options, error);
                if (line == null)
                {
                    if (options.Unexplained != null) unexplained = error;
                    else line = Unexplainable(options, error);
                }
            }
            catch (Exception error)
            {
                // Unexpected exception messages can echo request secrets too.
                Debug.LogWarning($"[showroom] {options.Name} failed: {(options.Redact ? error.GetType().Name : error.ToString())}");
                line = options.Redact ? $"Failed: {error.GetType().Name}" : $"Failed: {ShowroomErrors.Describe(error)}";
            }
            finally
            {
                _busy = false;
            }

            // Unity considers a destroyed owner null while its managed reference still exists.
            var ownerGone = !ReferenceEquals(options.Owner, null) && options.Owner == null;
            // The vanished owner cannot report its refusal, so preserve that message here.
            if (ownerGone && unexplained != null) line = Unexplainable(options, unexplained);
            // A failed log redraw must not prevent Afterward from re-enabling controls.
            Guarded(options, () => ShowroomLog.Say(line));
            if (ownerGone) return;
            if (unexplained != null) Guarded(options, () => options.Unexplained!(unexplained));
            if (gone && options.WhenGone != null) Guarded(options, options.WhenGone);
            if (options.Afterward != null) Guarded(options, options.Afterward);
        }

        private static string Unexplainable(ShowroomPressOptions options, Gs2Exception error) =>
            options.Redact ? $"GS2 refused: {ShowroomErrors.Summary(error)}" : ShowroomErrors.Describe(error);

        private static string? Explained(ShowroomPressOptions options, Gs2Exception error)
        {
            if (options.Explain == null) return null;
            try
            {
                return options.Explain(error);
            }
            catch (Exception failure)
            {
                Debug.LogWarning($"[showroom] {options.Name}: explaining a refusal failed: {failure}");
                return null;
            }
        }

        // Isolate callbacks so one failure cannot skip cleanup or escape through async void.
        private static void Guarded(ShowroomPressOptions options, Action callback)
        {
            try
            {
                callback();
            }
            catch (Exception failure)
            {
                try
                {
                    ShowroomLog.Failure($"After {options.Name}, the page could not update", failure);
                }
                catch (Exception)
                {
                    // Reporting to the page failed; keep the console warning as the remaining diagnostic.
                    Debug.LogWarning($"[showroom] After {options.Name}, the page could not update: {failure}");
                }
            }
        }

        // Static state otherwise survives entering Play Mode with domain reload disabled.
        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.SubsystemRegistration)]
        private static void ResetOnPlay()
        {
            _busy = false;
            _frozen = false;
        }
    }
}

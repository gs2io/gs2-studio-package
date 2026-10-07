// A layout change can move a different button under the pointer, so briefly refuse presses.
// Share the delay across the page: a changed region can move controls below it.
#nullable enable

using UnityEngine;

namespace GS2Studio.Showroom
{
    public static class ShowroomSettle
    {
        public const float Seconds = 0.6f;

        private static float _lastChange = float.NegativeInfinity;

        // Mark only actual changes; marking every redraw would keep refusing all presses.
        public static void MarkChanged() => _lastChange = Time.realtimeSinceStartup;

        public static bool Settled(bool say = true)
        {
            if (Time.realtimeSinceStartup - _lastChange >= Seconds) return true;
            if (say) ShowroomLog.Say("The page just changed; press again.");
            return false;
        }

        // Static state otherwise survives entering Play Mode with domain reload disabled.
        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.SubsystemRegistration)]
        private static void ResetOnPlay() => _lastChange = float.NegativeInfinity;
    }
}

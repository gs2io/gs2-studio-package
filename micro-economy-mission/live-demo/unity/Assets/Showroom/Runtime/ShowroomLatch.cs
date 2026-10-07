// Repeated failures would bury other log lines; report once until a success resets the latch.
// Use on the main thread because reporting touches Unity UI.
#nullable enable

using System;

using UnityEngine;

namespace GS2Studio.Showroom
{
    public sealed class ShowroomLatch
    {
        private bool _reported;

        public bool Reported => _reported;

        public bool Fail(string what, Exception? error)
        {
            if (_reported)
            {
                Debug.LogWarning($"[showroom] {what} (again): {error}");
                return false;
            }
            _reported = true;
            ShowroomLog.Failure(what, error);
            return true;
        }

        public bool Fail(string message)
        {
            if (_reported)
            {
                Debug.LogWarning($"[showroom] {message} (again)");
                return false;
            }
            _reported = true;
            ShowroomLog.Say(message);
            return true;
        }

        public void Succeeded() => _reported = false;
    }
}

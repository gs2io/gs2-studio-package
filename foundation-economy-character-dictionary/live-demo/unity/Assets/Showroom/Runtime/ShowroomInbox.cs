// SDK callbacks can arrive off the main thread, where Unity objects cannot be touched.
// Post from callbacks and drain in Update; applying a whole frame's changes avoids repeated redraws.
#nullable enable

using System;
using System.Collections.Concurrent;

using UnityEngine;

namespace GS2Studio.Showroom
{
    public sealed class ShowroomInbox
    {
        private readonly ConcurrentQueue<Action> _queue = new ConcurrentQueue<Action>();

        public void Post(Action apply)
        {
            if (apply == null) throw new ArgumentNullException(nameof(apply));
            _queue.Enqueue(apply);
        }

        // Drain on the main thread; one failing callback must not prevent later UI updates.
        public bool Drain()
        {
            var ran = false;
            while (_queue.TryDequeue(out var apply))
            {
                ran = true;
                try
                {
                    apply();
                }
                catch (Exception error)
                {
                    Debug.LogException(error);
                }
            }
            return ran;
        }

        public void Clear()
        {
            while (_queue.TryDequeue(out _)) { }
        }
    }
}

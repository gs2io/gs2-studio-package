// Publish text because the page builder renders DateTime rows as countdowns.
// Keep the base abstract so discovery offers only the demo's named subclasses.
#nullable enable

using System;
using System.Collections;
using System.Globalization;

using UnityEngine;
using UnityEngine.Events;

namespace GS2Studio.Showroom
{
    public abstract class ShowroomDemoClockLabel : MonoBehaviour
    {
        [SerializeField] private UnityEvent<string> _onUpdate = new UnityEvent<string>();

        public UnityEvent<string> OnUpdate => _onUpdate;

        private Coroutine? _ticking;

        protected virtual void OnEnable()
        {
            DemoTimeOffset.Changed += OnOffsetChanged;
            DemoTimeOffset.Loaded += OnOffsetChanged;
            _ticking = StartCoroutine(Tick());
        }

        protected virtual void OnDisable()
        {
            DemoTimeOffset.Changed -= OnOffsetChanged;
            DemoTimeOffset.Loaded -= OnOffsetChanged;
            if (_ticking != null) StopCoroutine(_ticking);
            _ticking = null;
        }

        private IEnumerator Tick()
        {
            var wait = new WaitForSecondsRealtime(1f);
            while (true)
            {
                Publish();
                yield return wait;
            }
        }

        private void OnOffsetChanged(string userId)
        {
            Publish();
        }

        // Showing a clock before its offset is known would imply an unverified server time.
        private void Publish()
        {
            if (!ShowroomRuntime.TryGet(out _, out var session)) return;
            if (!DemoTimeOffset.TryGet(session.UserId, out var offset)) return;
            var now = DateTime.UtcNow.AddSeconds(offset);
            _onUpdate.Invoke(now.ToString("yyyy-MM-dd HH:mm", CultureInfo.InvariantCulture) + " UTC");
        }
    }
}

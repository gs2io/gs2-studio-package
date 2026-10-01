// The time GS2 sees for this player, once a demo has moved their clock.
//
// A visitor who advances the clock (`DemoClockAdvanceButton`) needs to see
// that it moved, and which side of a daily reset they are on. The label is
// text rather than a `DateTime`: the page draws a `DateTime` row as a
// countdown to it, and this is a clock, not a deadline. So it keeps itself
// current, once a second and whenever the offset changes.
//
// A demo names its row by subclassing this with the name `page.json` asks for
// (and nothing else); the page builder finds the subclass by name and wires
// `_onUpdate`. Abstract, and must stay so: the page builder offers every
// non-abstract demo-written `MonoBehaviour` as a row.
#nullable enable

using System;
using System.Collections;
using System.Globalization;

using UnityEngine;
using UnityEngine.Events;

namespace GS2Studio.Showroom
{
    /// <summary>
    /// Publishes the signed-in player's clock on GS2 (now, plus the offset
    /// their account has) as text.
    /// </summary>
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

        /// <summary>
        /// Nothing is shown until a player has signed in and their account's
        /// offset has been read: the time without it would be a clock the
        /// server does not use.
        /// </summary>
        private void Publish()
        {
            if (!ShowroomRuntime.TryGet(out _, out var session)) return;
            if (!DemoTimeOffset.TryGet(session.UserId, out var offset)) return;
            var now = DateTime.UtcNow.AddSeconds(offset);
            _onUpdate.Invoke(now.ToString("yyyy-MM-dd HH:mm", CultureInfo.InvariantCulture) + " UTC");
        }
    }
}

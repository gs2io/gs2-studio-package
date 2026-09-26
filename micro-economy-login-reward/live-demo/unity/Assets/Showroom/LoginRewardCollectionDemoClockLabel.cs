// The time GS2 sees for this player, once the demo has moved their clock.
//
// A visitor who advances a day needs to see that the day moved, and which
// side of the 15:00 UTC reset they are on. The label is text rather than a
// `DateTime`: the page draws a `DateTime` row as a countdown to it, and this
// is a clock, not a deadline. So it keeps itself current, once a second and
// whenever the offset changes.
#nullable enable

using System;
using System.Collections;
using System.Globalization;

using UnityEngine;
using UnityEngine.Events;

using GS2Studio.Generated.Runtime;

namespace GS2Studio.Showroom.Demo
{
    /// <summary>
    /// Publishes the signed-in player's clock on GS2 — now, plus the offset
    /// this demo gave their account — as text.
    /// </summary>
    [AddComponentMenu("GS2 Studio/Showroom/Demo Clock")]
    public sealed class LoginRewardCollectionDemoClockLabel : MonoBehaviour
    {
        [SerializeField] private UnityEvent<string> _onUpdate = new UnityEvent<string>();

        public UnityEvent<string> OnUpdate => _onUpdate;

        private IGs2RuntimeContextProvider? _runtime;
        private Coroutine? _ticking;

        private void OnEnable()
        {
            DemoTimeOffset.Changed += OnOffsetChanged;
            _ticking = StartCoroutine(Tick());
        }

        private void OnDisable()
        {
            DemoTimeOffset.Changed -= OnOffsetChanged;
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
        /// Nothing is shown until a player has signed in: the offset is theirs,
        /// and the time without it would be a clock the server does not use.
        /// </summary>
        private void Publish()
        {
            _runtime ??= FindAnyObjectByType<Gs2HolderRuntimeContextProvider>();
            if (_runtime == null || !_runtime.TryGet(out _, out var session) || session == null)
            {
                return;
            }

            var now = DateTime.UtcNow.AddSeconds(DemoTimeOffset.Get(session.UserId));
            _onUpdate.Invoke(
                "Demo clock: " + now.ToString("yyyy-MM-dd HH:mm", CultureInfo.InvariantCulture) + " UTC");
        }
    }
}

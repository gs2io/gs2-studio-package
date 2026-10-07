// The request row supplies an id, so its public display name needs a separate profile subscription.
// Publish subscription results from Update so callbacks cannot mutate Unity objects off the main thread.
#nullable enable


using UnityEngine;
using UnityEngine.Events;

using PublicProfile = Gs2.Gs2Friend.Model.PublicProfile;

namespace GS2Studio.Showroom.Demo
{
    public abstract class FriendRowNameLabel : MonoBehaviour
    {
        [SerializeField] private UnityEvent<string> _onUpdate = new UnityEvent<string>();

        public UnityEvent<string> OnUpdate => _onUpdate;

        public string? Shown { get; private set; }

        protected abstract string? RowUserId();

        private readonly ShowroomInbox _inbox = new ShowroomInbox();
        private ShowroomWatch? _watch;
        private string? _userId;

        private void OnDisable()
        {
            _watch?.Stop();
            _inbox.Clear();
            _userId = null;
            Shown = null;
        }

        private void Update()
        {
            _inbox.Drain();
            var userId = RowUserId();
            if (string.IsNullOrEmpty(userId) || userId == _userId) return;
            if (!ShowroomRuntime.TryGet(out var gs2, out _)) return;
            _userId = userId;
            Show(ShowroomPlayerTag.Of(userId));
            var profile = gs2.Super.Friend.Namespace(FriendDemo.Namespace).User(userId!).PublicProfile();
            _watch ??= new ShowroomWatch(_inbox, ShowroomWatch.RereadFailure.Keep, "a player's public profile");
            _watch.Subscribe<PublicProfile>(
                callback => profile.SubscribeWithInitialCallAsync(callback),
                profile.Unsubscribe,
                model =>
                {
                    if (model != null) Show(FriendDemo.NameOf(userId!, model.Value));
                },
                // A missing profile must not prevent the request row from showing its player tag.
                failed: error => Debug.LogWarning($"[showroom] {GetType().Name}: the public profile of {userId} could not be read: {error}"));
        }

        private void Show(string name)
        {
            Shown = name;
            _onUpdate.Invoke(name);
        }
    }
}

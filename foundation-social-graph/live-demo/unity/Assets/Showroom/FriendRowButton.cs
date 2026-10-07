#nullable enable

using System.Threading.Tasks;

using Gs2.Core.Exception;

using VisitorDomain = Gs2.Gs2Friend.Domain.Model.UserAccessTokenDomain;

namespace GS2Studio.Showroom.Demo
{
    public abstract class FriendRowButton : ShowroomPressButton
    {
        protected abstract FriendPress Kind { get; }

        protected abstract string? RowUserId();

        protected virtual string RowName(string userId) => ShowroomPlayerTag.Of(userId);

        protected abstract Task<string> Act(VisitorDomain visitor, string userId, string name);

        /// <summary>Allow a stale-row refusal to invalidate affected caches when the failed SDK call leaves them unchanged.</summary>
        protected virtual void WhenGone(VisitorDomain visitor) { }

        protected override string PressName => $"Friend {Kind}";

        protected override string? Explain(Gs2Exception error) => FriendDemo.Explain(Kind, error);

        protected override async Task<string> Press()
        {
            var userId = RowUserId();
            // A generated row can enable before its model arrives; never send an empty target id.
            if (string.IsNullOrEmpty(userId)) return "";
            if (!ShowroomRuntime.TryGet(out var gs2, out var session)) return "Not signed in yet.";
            var visitor = FriendDemo.Visitor(gs2, session);
            var name = RowName(userId!);
            try
            {
                return await Act(visitor, userId!, name);
            }
            catch (NotFoundException)
            {
                WhenGone(visitor);
                throw;
            }
        }
    }
}

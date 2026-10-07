#nullable enable

using UnityEngine;

using GS2Studio.Generated.ReceiveFriendRequest;

namespace GS2Studio.Showroom.Demo
{
    [AddComponentMenu("GS2 Studio/Showroom/Name On A Received Friend Request")]
    public sealed class ReceiveFriendRequestNameLabel : FriendRowNameLabel
    {
        protected override string? RowUserId() => GetComponentInParent<ReceiveFriendRequestHandlerBase>()?.Model?.Id.Value;
    }
}

#nullable enable

using System;

using Gs2.Core.Exception;

namespace GS2Studio.Showroom
{
    public sealed class ShowroomPressOptions
    {
        public string Name { get; set; } = "press";

        // Automatic work cannot target a button moved under the pointer, so it bypasses settling.
        public bool Pressed { get; set; } = true;

        public Func<Gs2Exception, string?>? Explain { get; set; }

        // The runner reports refusals itself after the owner is destroyed, avoiding a lost message.
        public Action<Gs2Exception>? Unexplained { get; set; }

        // Use only when the SDK cannot repair the missing item's cached state through its subscriptions.
        public Action? WhenGone { get; set; }

        // Rejected runs do not call Afterward; callers must undo any pre-run UI changes themselves.
        public Action? Afterward { get; set; }

        // Error messages may echo request secrets; redaction keeps only types and GS2 codes.
        public bool Redact { get; set; }

        // Destroyed Unity owners must not receive callbacks from an earlier request.
        public UnityEngine.Object? Owner { get; set; }
    }
}

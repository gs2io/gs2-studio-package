// Whether GS2 refused for a given reason.
//
// GS2 names a refusal with a dotted message such as
// `rankingModel.ranking.error.alreadyReceived`, whose leading parts name where
// it was raised and may differ between the paths that raise the same reason.
// A reason is therefore matched as the message itself or as its dotted tail:
// `alreadyReceived` and `error.alreadyReceived` both match the example, while
// `Received` does not.
//
// The messages read are the ones `ShowroomErrors` reads: the list the SDK
// parsed, and the messages inside a body it left unparsed, which is how a
// refusal from inside an atomically committed transaction arrives.
//
// What only the exception's type says (`NotFoundException`, a conflict) is
// left to the caller's `catch` or `is`; this answers only about messages.
#nullable enable

using System;

using Gs2.Core.Exception;

namespace GS2Studio.Showroom
{
    /// <summary>Recognises a GS2 refusal by its reason.</summary>
    public static class ShowroomRefusal
    {
        /// <summary>
        /// Whether one of GS2's messages for <paramref name="error"/> is
        /// <paramref name="reason"/>, or ends with "." and then it.
        /// </summary>
        public static bool Has(Gs2Exception? error, string reason)
        {
            if (error == null || string.IsNullOrEmpty(reason)) return false;
            foreach (var message in ShowroomErrors.Messages(error))
            {
                if (Matches(message, reason)) return true;
            }
            return false;
        }

        /// <summary>Whether GS2 refused for any of <paramref name="reasons"/>.</summary>
        public static bool HasAny(Gs2Exception? error, params string[] reasons)
        {
            if (error == null || reasons == null || reasons.Length == 0) return false;
            foreach (var message in ShowroomErrors.Messages(error))
            {
                foreach (var reason in reasons)
                {
                    if (!string.IsNullOrEmpty(reason) && Matches(message, reason)) return true;
                }
            }
            return false;
        }

        private static bool Matches(string message, string reason) =>
            string.Equals(message, reason, StringComparison.Ordinal) ||
            message.EndsWith("." + reason, StringComparison.Ordinal);
    }
}

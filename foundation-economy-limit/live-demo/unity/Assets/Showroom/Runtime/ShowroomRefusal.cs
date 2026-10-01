// Whether GS2 refused for a given reason.
//
// A reason is recognised by GS2's client error code (`errors[].code`, such as
// `limit.counter.overflow`), never by its message: the message is wording
// that GS2 may change, and a page that matched it would stop recognising the
// refusal in silence. Where the SDK raises a typed exception for the reason,
// the caller's `catch` or `is` on that type comes first; the code is what
// stands in where the SDK has no type for it yet.
//
// The entries read are the ones `ShowroomErrors` reads: the list the SDK
// parsed, and the entries inside a body it left unparsed (how an SDK older
// than io.gs2.csharp.sdk 2026.9.22 hands over a refusal from inside a
// transaction).
//
// A few refusals carry no code at all: a request field's validation (a
// profile text that is too long) and a handful GS2 has not coded yet. Those
// are recognised by the exception's type and the entry's component, the field
// or model GS2 names (`IsComponent`), which is structure rather than wording.
#nullable enable

using System;

using Gs2.Core.Exception;

namespace GS2Studio.Showroom
{
    /// <summary>Recognises a GS2 refusal by its code, or by its component where it has none.</summary>
    public static class ShowroomRefusal
    {
        /// <summary>Whether one of GS2's entries for <paramref name="error"/> carries <paramref name="code"/>.</summary>
        public static bool HasCode(Gs2Exception? error, string code)
        {
            if (error == null || string.IsNullOrEmpty(code)) return false;
            foreach (var detail in ShowroomErrors.Details(error))
            {
                if (string.Equals(detail.Code, code, StringComparison.Ordinal)) return true;
            }
            return false;
        }

        /// <summary>Whether one of GS2's entries for <paramref name="error"/> carries any of <paramref name="codes"/>.</summary>
        public static bool HasAnyCode(Gs2Exception? error, params string[] codes)
        {
            if (error == null || codes == null || codes.Length == 0) return false;
            foreach (var detail in ShowroomErrors.Details(error))
            {
                if (detail.Code.Length == 0) continue;
                foreach (var code in codes)
                {
                    if (string.Equals(detail.Code, code, StringComparison.Ordinal)) return true;
                }
            }
            return false;
        }

        /// <summary>
        /// Whether one of GS2's entries for <paramref name="error"/> was raised
        /// at <paramref name="component"/> (the field or model GS2 names).
        ///
        /// Only for a refusal GS2 gives no code, and only together with the
        /// exception's type: a component says where, not why.
        /// </summary>
        public static bool IsComponent(Gs2Exception? error, string component)
        {
            if (error == null || string.IsNullOrEmpty(component)) return false;
            foreach (var detail in ShowroomErrors.Details(error))
            {
                if (string.Equals(detail.Component, component, StringComparison.Ordinal)) return true;
            }
            return false;
        }

        /// <summary>Whether one of GS2's entries for <paramref name="error"/> was raised at any of <paramref name="components"/>.</summary>
        public static bool IsAnyComponent(Gs2Exception? error, params string[] components)
        {
            if (error == null || components == null || components.Length == 0) return false;
            foreach (var component in components)
            {
                if (IsComponent(error, component)) return true;
            }
            return false;
        }
    }
}

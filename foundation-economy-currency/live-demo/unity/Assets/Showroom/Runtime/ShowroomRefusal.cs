// Match codes instead of message wording, which may change independently of the refusal.
#nullable enable

using System;

using Gs2.Core.Exception;

namespace GS2Studio.Showroom
{
    public static class ShowroomRefusal
    {
        public static bool HasCode(Gs2Exception? error, string code)
        {
            if (error == null || string.IsNullOrEmpty(code)) return false;
            foreach (var detail in ShowroomErrors.Details(error))
            {
                if (string.Equals(detail.Code, code, StringComparison.Ordinal)) return true;
            }
            return false;
        }

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

        // Pair this with the exception type when no code exists: a component identifies where, not why.
        public static bool IsComponent(Gs2Exception? error, string component)
        {
            if (error == null || string.IsNullOrEmpty(component)) return false;
            foreach (var detail in ShowroomErrors.Details(error))
            {
                if (string.Equals(detail.Component, component, StringComparison.Ordinal)) return true;
            }
            return false;
        }

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

// Use the generated provider so hand-written and generated components share one session and cache.
// Scene lookup requires the main thread.
#nullable enable

using System.Diagnostics.CodeAnalysis;

using Gs2.Unity.Core;
using Gs2.Unity.Util;

using GS2Studio.Generated.Runtime;

namespace GS2Studio.Showroom
{
    public static class ShowroomRuntime
    {
        private static Gs2HolderRuntimeContextProvider? _provider;

        public static bool TryGet([NotNullWhen(true)] out Gs2Domain? gs2, [NotNullWhen(true)] out IGameSession? session)
        {
            gs2 = null;
            session = null;
            // Unity null detects a destroyed provider; C# reference-null checks would reuse it.
            if (_provider == null) _provider = UnityEngine.Object.FindAnyObjectByType<Gs2HolderRuntimeContextProvider>();
            if (_provider == null) return false;
            if (!_provider.TryGet(out var foundGs2, out var foundSession) || foundGs2 == null || foundSession == null)
            {
                return false;
            }
            gs2 = foundGs2;
            session = foundSession;
            return true;
        }
    }
}

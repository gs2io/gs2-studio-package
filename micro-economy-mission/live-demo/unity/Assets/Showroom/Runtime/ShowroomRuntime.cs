// The signed-in player's SDK handles, for what a demo writes by hand.
//
// Generated components reach GS2 through the `Gs2HolderRuntimeContextProvider`
// the scene carries, and hand-written code reaches it the same way, so both
// talk to GS2 as the same client and session and share the SDK's cache. Every
// demo's generated runtime has that provider.
//
// Main thread only: finding the provider is a scene query.
#nullable enable

using System.Diagnostics.CodeAnalysis;

using Gs2.Unity.Core;
using Gs2.Unity.Util;

using GS2Studio.Generated.Runtime;

namespace GS2Studio.Showroom
{
    /// <summary>Reaches the signed-in player's SDK handles.</summary>
    public static class ShowroomRuntime
    {
        private static Gs2HolderRuntimeContextProvider? _provider;

        /// <summary>
        /// The client and the session once the player has signed in; false
        /// (and both null) until then, or when the scene has no provider.
        /// </summary>
        public static bool TryGet([NotNullWhen(true)] out Gs2Domain? gs2, [NotNullWhen(true)] out IGameSession? session)
        {
            gs2 = null;
            session = null;
            // Compared with Unity's own null, so a provider destroyed with its
            // scene is looked for again rather than used.
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

// The two presses a skill tree is about.
//
// `Gs2SkillTree:Release` charges the consume actions of every node it is
// given, and refuses one whose premises are neither released already nor in
// the same call. `Gs2SkillTree:Restrain` puts nodes back and returns
// `restrainReturnRate` of what they cost — without it a released node stays
// released for the life of the property, and the flag this page is about could
// only ever be watched moving one way.
//
// Both take a set rather than a node, and that is the whole of how a press on
// a node deep in the tree works: the caller hands over the path, and the
// server's own check reads it as met. What the path is belongs to
// {@link SkillNodeTree}; this file is only the two calls.
//
// They were first written by hand because the catalog gave both calls a
// `config` that Gs2Bind does not take (it takes `propertyId`, `nodeModelNames`
// and `speculativeExecute`), and the generator refused them. Studio now drops a
// never-required parameter the hosting Bind method does not take, so that
// reason is gone. What remains is the set: each press hands over a path that
// {@link SkillNodeTree} works out from the tree as drawn, and whether a generated
// delegated action can carry that has not been tried. Until it is, the demo
// does what the shop demo does with a purchase and calls the loader itself.
//
// Here rather than on a row's behaviour because the page no longer draws a row
// per node: the tree is one widget ({@link SkillNodeTreeCanvas}) and the boxes
// it draws are the presses. What a press does is the same either way, so it is
// the one thing both halves would have had to agree about.
//
// Nothing here reloads anything. The widget's own collection subscribes to the
// status these write, so it redraws itself when a release lands.
#nullable enable

using System;
using System.Collections.Generic;
using System.Threading.Tasks;

using Gs2.Unity.Core;
using Gs2.Unity.Util;

using GS2Studio.Generated.Runtime;

namespace GS2Studio.Showroom.Demo
{
    /// <summary>
    /// Releasing and restraining a set of nodes of one character's tree.
    /// </summary>
    internal static class SkillNodeCommands
    {
        /// <summary>
        /// The skill tree namespace this demo deploys, which is the name the
        /// feature package binds its namespace row to.
        /// </summary>
        private const string Namespace = "SkillTree";

        /// <summary>
        /// Unlocks a set of nodes for one character in one transaction,
        /// charging what all of them cost.
        ///
        /// `nodeModelNames` is a list because GS2 means it to be one.
        /// `StatusEx.CanRelease` checks each node's premises against the
        /// released set *plus the request*, so a press on a node deep in the
        /// tree goes through exactly when the call also carries the path up to
        /// it. `node` is the one the visitor pressed and names the subject of
        /// the call; `plan` is everything the transaction covers, which
        /// includes it.
        /// </summary>
        public static async Task Release(string node, IReadOnlyList<string> plan, string owner)
        {
            var (gs2, session) = Runtime();
            await new Gs2Bind.Gs2SkillTree.NodeModelLoader(Namespace, node).Release(
                gs2, session, propertyId: owner, nodeModelNames: Names(plan));
        }

        /// <summary>
        /// Puts a set of nodes back in one transaction, returning each one's
        /// share of what it cost.
        ///
        /// The mirror of <see cref="Release"/>: `CanRestrain` takes the
        /// request out of the released set before it looks for dependents, so
        /// a node something still hangs off goes back exactly when the call
        /// also carries what hangs off it.
        /// </summary>
        public static async Task Restrain(string node, IReadOnlyList<string> plan, string owner)
        {
            var (gs2, session) = Runtime();
            await new Gs2Bind.Gs2SkillTree.NodeModelLoader(Namespace, node).Restrain(
                gs2, session, propertyId: owner, nodeModelNames: Names(plan));
        }

        /// <summary>The array shape the SDK's parameter is declared in.</summary>
        private static string[] Names(IReadOnlyList<string> plan)
        {
            var names = new string[plan.Count];
            for (var index = 0; index < plan.Count; index++) names[index] = plan[index];
            return names;
        }

        /// <summary>
        /// The signed-in session these calls travel on.
        ///
        /// Thrown for rather than returned as an absence: a press that reaches
        /// here has a node and an owner, so a missing runtime is the page
        /// itself being unbuilt rather than anything the visitor did, and the
        /// caller reports it the same way it reports a refusal from GS2.
        /// </summary>
        private static (Gs2Domain Gs2, IGameSession Session) Runtime()
        {
            var runtime = UnityEngine.Object.FindAnyObjectByType<Gs2HolderRuntimeContextProvider>();
            if (runtime == null || !runtime.TryGet(out var gs2, out var session) ||
                gs2 == null || session == null)
            {
                throw new InvalidOperationException("The GS2 runtime context is not available.");
            }
            return (gs2, session);
        }
    }
}

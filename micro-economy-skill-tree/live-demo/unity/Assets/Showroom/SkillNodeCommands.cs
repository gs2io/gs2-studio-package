// Send the graph-derived plan in one request: splitting it changes the node set used by prerequisite validation.
#nullable enable

using System.Collections.Generic;
using System.Threading.Tasks;

using Gs2.Unity.Core;
using Gs2.Unity.Util;

namespace GS2Studio.Showroom.Demo
{
    internal static class SkillNodeCommands
    {
        private const string Namespace = "SkillTree";

        public static async Task Release(
            Gs2Domain gs2, IGameSession session, string node, IReadOnlyList<string> plan, string owner)
        {
            await new Gs2Bind.Gs2SkillTree.NodeModelLoader(Namespace, node).Release(
                gs2, session, propertyId: owner, nodeModelNames: Names(plan));
        }

        public static async Task Restrain(
            Gs2Domain gs2, IGameSession session, string node, IReadOnlyList<string> plan, string owner)
        {
            await new Gs2Bind.Gs2SkillTree.NodeModelLoader(Namespace, node).Restrain(
                gs2, session, propertyId: owner, nodeModelNames: Names(plan));
        }

        private static string[] Names(IReadOnlyList<string> plan)
        {
            var names = new string[plan.Count];
            for (var index = 0; index < plan.Count; index++) names[index] = plan[index];
            return names;
        }
    }
}

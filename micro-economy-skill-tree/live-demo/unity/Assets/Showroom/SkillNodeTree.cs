// Derive layout from prerequisites, not alphabetical row order. Joins need depth and all incoming edges, not a single parent.
#nullable enable

using System;
using System.Collections.Generic;
using System.Text;

using SkillNodeModel = GS2Studio.Generated.SkillNode.SkillNode;

namespace GS2Studio.Showroom.Demo
{
    public static class SkillNodeTree
    {
        private static readonly IReadOnlyList<string> NoPremises = new string[0];

        public static Dictionary<string, IReadOnlyList<string>> PremisesOf(
            IEnumerable<SkillNodeModel>? nodes)
        {
            var premises = new Dictionary<string, IReadOnlyList<string>>(StringComparer.Ordinal);
            if (nodes == null) return premises;
            foreach (var node in nodes)
            {
                if (node == null) continue;
                var name = NameOf(node);
                if (name.Length == 0) continue;
                premises[name] = node.PremiseNodes ?? NoPremises;
            }
            return premises;
        }

        public static string NameOf(SkillNodeModel node)
        {
            return node.Id.Value ?? "";
        }

        // An unknown prerequisite still places this node one level below it; the snapshot cannot establish that prerequisite's own depth.
        public static int DepthOf(
            string name, IReadOnlyDictionary<string, IReadOnlyList<string>> premises)
        {
            return DepthOf(name, premises, new HashSet<string>(StringComparer.Ordinal));
        }

        private static int DepthOf(
            string name,
            IReadOnlyDictionary<string, IReadOnlyList<string>> premises,
            HashSet<string> walking)
        {
            if (!premises.TryGetValue(name, out var needed) || needed == null) return 0;
            // Malformed cyclic master data must not recurse indefinitely during layout.
            if (!walking.Add(name)) return 0;
            var deepest = 0;
            foreach (var premise in needed)
            {
                if (string.IsNullOrEmpty(premise)) continue;
                var below = premises.ContainsKey(premise)
                    ? DepthOf(premise, premises, walking) + 1
                    : 1;
                if (below > deepest) deepest = below;
            }
            walking.Remove(name);
            return deepest;
        }

        public static IReadOnlyList<string> UnknownPremises(
            SkillNodeModel node, IReadOnlyDictionary<string, SkillNodeModel> byName)
        {
            var needed = node.PremiseNodes;
            if (needed == null || needed.Count == 0) return NoPremises;
            var unknown = new List<string>();
            foreach (var premise in needed)
            {
                if (string.IsNullOrEmpty(premise)) continue;
                if (byName.ContainsKey(premise)) continue;
                unknown.Add(premise);
            }
            return unknown;
        }

        // Include unreleased prerequisites in the request because CanRelease checks the released set plus the requested set.
        // Skip released nodes so their consume actions are not requested again.
        public static IReadOnlyList<string> ReleaseClosure(
            string name, IReadOnlyDictionary<string, SkillNodeModel> byName)
        {
            var plan = new List<string>();
            CollectPremises(name, byName, plan, new HashSet<string>(StringComparer.Ordinal));
            return plan;
        }

        private static void CollectPremises(
            string name,
            IReadOnlyDictionary<string, SkillNodeModel> byName,
            List<string> plan,
            HashSet<string> walked)
        {
            // A shared prerequisite belongs in the plan only once; the same set also terminates cycles.
            if (!walked.Add(name)) return;
            if (!byName.TryGetValue(name, out var node) || node.Released) return;
            var needed = node.PremiseNodes;
            if (needed != null)
            {
                foreach (var premise in needed)
                {
                    if (string.IsNullOrEmpty(premise)) continue;
                    CollectPremises(premise, byName, plan, walked);
                }
            }
            plan.Add(name);
        }

        // Include released dependents because CanRestrain checks for dependents after removing the entire requested set.
        public static IReadOnlyList<string> RestrainClosure(
            string name, IReadOnlyList<SkillNodeModel> nodes)
        {
            var plan = new List<string>();
            CollectDependents(name, nodes, plan, new HashSet<string>(StringComparer.Ordinal));
            return plan;
        }

        private static void CollectDependents(
            string name,
            IReadOnlyList<SkillNodeModel> nodes,
            List<string> plan,
            HashSet<string> walked)
        {
            if (!walked.Add(name)) return;
            foreach (var node in nodes)
            {
                if (node == null || !node.Released) continue;
                var dependent = NameOf(node);
                if (dependent.Length == 0) continue;
                var needed = node.PremiseNodes;
                if (needed == null) continue;
                foreach (var premise in needed)
                {
                    if (string.IsNullOrEmpty(premise)) continue;
                    if (!string.Equals(premise, name, StringComparison.Ordinal)) continue;
                    CollectDependents(dependent, nodes, plan, walked);
                    break;
                }
            }
            plan.Add(name);
        }

        public static string Listed(IReadOnlyList<string> names)
        {
            if (names.Count == 0) return "";
            if (names.Count == 1) return names[0];
            var listed = new StringBuilder();
            for (var index = 0; index < names.Count; index++)
            {
                if (index > 0) listed.Append(index == names.Count - 1 ? " and " : ", ");
                listed.Append(names[index]);
            }
            return listed.ToString();
        }
    }
}

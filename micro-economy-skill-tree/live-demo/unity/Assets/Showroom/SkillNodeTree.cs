// The shape four rows are in.
//
// `premiseNodes` is the whole of it — a node names what has to be released
// before it — and nothing the page draws says so on its own. A list is a stack
// of rows in whatever order the collection sorts them into, and the generated
// default sorts by id, which for these four nodes reads `first`, `last`,
// `left`, `right`: alphabetical, and so unrelated to the tree.
//
// So the shape is derived from the rows themselves rather than authored beside
// them, and this is where that derivation lives, apart from the widget that
// draws it ({@link SkillNodeTreeCanvas}) so the two can be read separately.
//
// **Depth, not descent.** A node's depth is one more than the deepest thing it
// needs. `last` needs `left` and `right`, which is a join rather than a single
// parent, so there is no one branch it hangs off and nothing here claims one:
// a node sits on the row its depth names, and every edge it has is drawn.
// Grouping by depth puts every node below everything it needs.
#nullable enable

using System;
using System.Collections.Generic;
using System.Text;

// The namespace and the model share a name, so the model is aliased where it
// is used as a type rather than qualified at each mention.
using SkillNodeModel = GS2Studio.Generated.SkillNode.SkillNode;

namespace GS2Studio.Showroom.Demo
{
    /// <summary>
    /// What a set of nodes says about its own shape: what each one needs, how
    /// deep it sits, and what one press on it has to carry.
    /// </summary>
    public static class SkillNodeTree
    {
        private static readonly IReadOnlyList<string> NoPremises = new string[0];

        /// <summary>
        /// The premises of every node in a set, keyed by node name.
        ///
        /// The name is the model's `Id`: GS2 names a node model by its own
        /// name, and `premiseNodes` holds those same names, so the two sides
        /// of an edge are the same string.
        /// </summary>
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

        /// <summary>
        /// A node's name, or the empty string when it has not got one yet. The
        /// id is a struct, so an unbound row reads as `default` rather than
        /// null.
        /// </summary>
        public static string NameOf(SkillNodeModel node)
        {
            return node.Id.Value ?? "";
        }

        /// <summary>
        /// How deep a node sits: zero when it needs nothing, and otherwise one
        /// more than the deepest thing it needs.
        ///
        /// A premise the set does not carry counts as depth zero — the node
        /// still follows something, so it is one level in, and the set simply
        /// cannot say how far in that something was.
        /// </summary>
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
            // A cycle is not a tree, and the data is the server's rather than
            // this page's, so the walk stops at one instead of recurring for
            // as long as the cycle is long.
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

        /// <summary>
        /// The premises a node names that the set has no node for, in the
        /// order the node names them.
        ///
        /// The one thing a plan cannot cover. A release carries its own
        /// premises, so a premise that is merely unreleased is not in the way
        /// — but one the page has never seen cannot go in the call, and GS2
        /// will refuse it. Saying which name is missing is the only honest
        /// thing left, and it is a defect in the master data rather than
        /// anything a visitor did.
        /// </summary>
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

        /// <summary>
        /// Everything one press has to release for the server to take it: the
        /// node itself, and every premise of it not released yet, followed
        /// through to the root.
        ///
        /// `Gs2SkillTree:Release` does not walk the tree for the caller. It
        /// checks each requested node's premises against the released set
        /// *plus the request itself* (`StatusEx.CanRelease`), so a premise
        /// counts as met when the same call releases it. That is why
        /// `nodeModelNames` is a list, and it is what makes pressing a leaf
        /// first work: the call carries the path up to it.
        ///
        /// Deepest first, which is not something the server needs — the check
        /// is a set union, so order cannot change the answer — but is the
        /// order a reader would write the path in.
        ///
        /// A released premise is left out: it is already met, and the whole
        /// request is charged, so asking for it again would bill twice for it.
        /// A premise this set does not carry is left out too, because the page
        /// cannot name what it has never seen; the node that needs it still
        /// goes in, and GS2 refuses the call rather than the page inventing a
        /// reason it could not have checked.
        /// </summary>
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
            // Walked rather than walking: a node reached twice is already in
            // the plan or deliberately out of it, and never wanted twice. It
            // doubles as the stop for a cycle, which is the server's data to
            // be wrong about rather than this page's to recur through.
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

        /// <summary>
        /// Everything one press has to put back: the node itself, and every
        /// released node that hangs off it, followed through to the leaves.
        ///
        /// The mirror of <see cref="ReleaseClosure"/>, and for the same
        /// reason. `Gs2SkillTree:Restrain` refuses a node something released
        /// still hangs off, but it takes the request out of the released set
        /// before it looks (`StatusEx.CanRestrain`), so a dependent counts as
        /// gone when the same call restrains it.
        ///
        /// Leaves first, again for the reader rather than the server. An
        /// unreleased dependent is left out: it is not in the set the check
        /// reads, and restraining what was never released is not a thing to
        /// ask for.
        /// </summary>
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

        /// <summary>`left` / `left and right` / `a, b and c`.</summary>
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

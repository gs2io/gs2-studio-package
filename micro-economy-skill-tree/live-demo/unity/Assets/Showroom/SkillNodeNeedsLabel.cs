// What a node wants released before it.
//
// `premiseNodeNames` is the whole of what a skill tree is — the thing that
// makes it a tree rather than a price list — and it is a list of names. A
// generated template label interpolates whatever the property holds, and for a
// list that is the name of its class, so the reading is written here instead.
//
// It reads the same property the deploy was built from, off the same row, so a
// page and a stack that have drifted apart say so rather than the page
// confidently printing prerequisites nothing enforces. GS2 is what enforces
// them: a release whose premises are not all released comes back as an error,
// which the page shows.
#nullable enable

using UnityEngine;
using UnityEngine.Events;

using GS2Studio.Generated.SkillNode;

// The namespace and the model share a name, so the model is aliased where it
// is used as a type rather than qualified at each mention.
using SkillNodeModel = GS2Studio.Generated.SkillNode.SkillNode;

namespace GS2Studio.Showroom.Demo
{
    /// <summary>
    /// The nodes this row wants released first, as a reading.
    ///
    /// Shaped like a generated label on purpose — an `OnUpdate` carrying a
    /// string — because that is what the page knows how to draw, and this is a
    /// row like any other once it is drawn.
    /// </summary>
    [AddComponentMenu("GS2 Studio/Showroom/What This Node Needs First")]
    public sealed class SkillNodeNeedsLabel : MonoBehaviour
    {
        [SerializeField] private SkillNodeHandlerBase? _handler;
        [SerializeField] private UnityEvent<string> _onUpdate = new UnityEvent<string>();

        public UnityEvent<string> OnUpdate => _onUpdate;

        private bool _subscribed;
        private bool _warnedMissingHandler;

        private void OnEnable()
        {
            if (_handler == null) _handler = GetComponentInParent<SkillNodeHandlerBase>();
            if (_handler == null)
            {
                // Surface the wiring failure once instead of silently doing
                // nothing, so a missing handler is discoverable.
                if (!_warnedMissingHandler)
                {
                    _warnedMissingHandler = true;
                    Debug.LogWarning(
                        $"{nameof(SkillNodeNeedsLabel)} on '{name}': no SkillNodeHandlerBase found in the parent chain; component inactive.", this);
                }
                return;
            }
            if (!_subscribed)
            {
                _handler.Updated += OnUpdated;
                _subscribed = true;
            }
            if (_handler.Model != null) OnUpdated(_handler.Model);
        }

        private void OnDisable()
        {
            if (_handler == null || !_subscribed) return;
            _handler.Updated -= OnUpdated;
            _subscribed = false;
        }

        private void OnUpdated(SkillNodeModel model)
        {
            // In the order the node names them, which is the order the tree
            // was authored in: nothing here re-sorts what the row carries.
            var premises = model.PremiseNodes;
            _onUpdate.Invoke(
                premises == null || premises.Count == 0
                    ? "nothing"
                    : string.Join(", ", premises));
        }
    }
}

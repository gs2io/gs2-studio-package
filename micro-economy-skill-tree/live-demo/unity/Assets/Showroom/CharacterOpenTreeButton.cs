// Saying whose tree is on screen.
//
// A skill tree is read for one character, and GS2 names that character by the
// property id its inventory row was minted with — a GRN that does not exist
// until the recruit lands. So the value cannot be written into the scene: the
// bake writes constants, and a constant is what this is not.
//
// It does not have to be. `SkillNodeBinderCollection` takes the owner in its
// constructor, so the panel builds its own collection the moment a character
// is named — which is why the page declares no `SkillNode` section any more.
// A section existed to mount the list handler, the list handler existed to
// read the nodes, and the panel reads them itself now.
//
// What is left here is one press: hand the panel the property id this row was
// bound with, and put the panel up.
#nullable enable

using UnityEngine;
using UnityEngine.Events;
using UnityEngine.UI;

using Gs2.Core.Exception;
using Gs2.Unity.Util;

using GS2Studio.Generated.Character;

namespace GS2Studio.Showroom.Demo
{
    /// <summary>
    /// Opens the skill tree of the character this row shows.
    ///
    /// Shaped like a generated action button on purpose — a `Button` to wire
    /// and an `OnCompleted` to raise — because that is what the page knows how
    /// to draw, and this is a row like any other once it is drawn.
    /// </summary>
    [AddComponentMenu("GS2 Studio/Showroom/Open This Character's Tree")]
    public sealed class CharacterOpenTreeButton : MonoBehaviour
    {
        [SerializeField] private CharacterHandlerBase? _handler;
        [SerializeField] private Button? _button;

        /// <summary>
        /// Raised once the panel has been opened. Nothing else on the page
        /// reads from it; it is the half of a row's action shape that says the
        /// press finished.
        /// </summary>
        [SerializeField] private UnityEvent _onCompleted = new UnityEvent();

        /// <summary>
        /// Never raised: opening a panel talks to nothing, and the read it
        /// starts reports its own failures on the page's log. It is declared
        /// because a row's action is the pair, and the page wires the failure
        /// side of every button it draws.
        /// </summary>
        [SerializeField] private ErrorEvent _onFailed = new ErrorEvent();

        public UnityEvent OnCompleted => _onCompleted;
        public ErrorEvent OnFailed => _onFailed;

        private bool _wired;

        private void OnEnable()
        {
            if (_handler == null) _handler = GetComponentInParent<CharacterHandlerBase>();
            if (_button == null || _wired) return;
            _button.onClick.AddListener(OnClicked);
            _wired = true;
        }

        private void OnDisable()
        {
            if (_button == null || !_wired) return;
            _button.onClick.RemoveListener(OnClicked);
            _wired = false;
        }

        private void OnClicked()
        {
            var owner = _handler?.Binder?.PropertyId;
            if (string.IsNullOrEmpty(owner))
            {
                // The row has no property id yet, which is not a failure to
                // report: a character's GRN arrives with the inventory read,
                // and a click that early is a click on a row still arriving.
                return;
            }

            SkillNodeTreeCanvas.Ensure(PageFont()).OpenFor(owner!);
            _onCompleted.Invoke();
        }

        /// <summary>
        /// The page's font, taken from this row's own text rather than named.
        /// Every piece of text on the page is authored in the template, so
        /// there is one to copy and no way for the panel to drift from it.
        /// </summary>
        private Font? PageFont()
        {
            var label = GetComponentInChildren<Text>(true);
            return label == null ? null : label.font;
        }
    }
}

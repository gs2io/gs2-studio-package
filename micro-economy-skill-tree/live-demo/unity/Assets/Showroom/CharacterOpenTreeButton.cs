// Saying whose tree is on screen.
//
// A skill tree is read for one character, and GS2 names that character by the
// property id its inventory row was minted with — a GRN that does not exist
// until the recruit lands. So the value cannot be written into the scene: the
// bake writes constants, and a constant is what this is not.
//
// The generated list says so itself. `SkillNodeBinderCollection` takes an
// `owner` in its constructor, `SkillNodeListHandler` holds it in a serialized
// field, and its readiness gate refuses to load while that field is empty —
// which is why the tree draws nothing until this button is pressed. The
// handler also carries the way in: `SetScope(string owner)`, the list's
// counterpart of the single-row handler's `SetKeys`. It replaces the scope and
// reloads, so a second press on a second character re-aims the same list
// rather than adding to it.
//
// The page declares no `scope` for the section, and the bake warns about
// exactly that. The warning is right about what it says — the page does not
// name the value — and the section would indeed draw empty if nothing else
// supplied one. This is the something else.
#nullable enable

using UnityEngine;
using UnityEngine.Events;
using UnityEngine.UI;

using Gs2.Core.Exception;
using Gs2.Unity.Util;

using GS2Studio.Generated.Character;
using GS2Studio.Generated.SkillNode;

namespace GS2Studio.Showroom.Demo
{
    /// <summary>
    /// Points every skill-node list on the page at the character this row
    /// shows.
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
        /// Raised once the scope has been handed over. Nothing else on the
        /// page reads from it; it is the half of a row's action shape that
        /// says the press finished.
        /// </summary>
        [SerializeField] private UnityEvent _onCompleted = new UnityEvent();

        /// <summary>
        /// Never raised: pointing a list at a character talks to nothing, so
        /// there is no GS2 failure to carry. It is declared because a row's
        /// action is the pair, and the page wires the failure side of every
        /// button it draws.
        /// </summary>
        [SerializeField] private ErrorEvent _onFailed = new ErrorEvent();

        public UnityEvent OnCompleted => _onCompleted;
        public ErrorEvent OnFailed => _onFailed;

        private bool _wired;
        private ShowroomPage? _page;

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

            // Every list, not the first one found: a page is free to show two
            // trees side by side, and each would then be aimed separately.
            // There is one here, and pointing all of them at the character the
            // visitor just pressed is what a press on this row means.
            var lists = FindObjectsByType<SkillNodeListHandler>(FindObjectsSortMode.None);
            if (lists.Length == 0)
            {
                Report("No skill node list is on the page to point at a character.");
                return;
            }
            foreach (var list in lists) list.SetScope(owner);
            _onCompleted.Invoke();
        }

        /// <summary>
        /// Put a failure where a visitor can see it. The page's error channel
        /// carries a `Gs2Exception`, so a failure of any other kind cannot
        /// travel it — and a browser hides the console, which is where it
        /// would otherwise be the only record.
        /// </summary>
        private void Report(string message)
        {
            _page ??= FindAnyObjectByType<ShowroomPage>();
            if (_page != null) _page.Log(message);
        }
    }
}

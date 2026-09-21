// Unlocking a node, as a player does it.
//
// `Gs2SkillTree:Release` is the call that charges the node's consume actions
// and refuses a node whose premises are not released yet — so it is the press
// this page is about. The feature package's `ReleaseSkillNode` transform emits
// `MarkReleaseByUserId` instead, which records the flag and charges nothing;
// that is for a transaction which has already been paid for elsewhere, and a
// button on it would have shown a tree with no costs and no prerequisites.
//
// It is written by hand because the generator cannot reach it. A delegated
// action renders every parameter the catalog lists, and the catalog gives
// `Release` a `config` that Gs2Bind's `Release` does not take (it takes
// `propertyId`, `nodeModelNames` and `speculativeExecute`) — the generator
// refuses rather than emitting a call that would not compile. The refusal is
// right; what is missing is one parameter in the SDK below it, which is not
// this demo's to add. So the demo does what the shop demo does with a purchase
// the generator cannot express, and calls the loader itself.
//
// Nothing here reloads anything. The binder subscribes to the status this
// writes, so the row rearranges itself when the release lands.
#nullable enable

using System;
using System.Threading.Tasks;

using UnityEngine;
using UnityEngine.Events;
using UnityEngine.UI;

using Gs2.Core.Exception;
using Gs2.Unity.Util;

using GS2Studio.Generated.Runtime;
using GS2Studio.Generated.SkillNode;

namespace GS2Studio.Showroom.Demo
{
    /// <summary>
    /// Releases the node this row shows, for the character the list is scoped
    /// to, charging what the node costs.
    ///
    /// Shaped like a generated action button on purpose — a `Button` to wire
    /// and an `OnCompleted` to raise — because that is what the page knows how
    /// to draw, and this is a row like any other once it is drawn.
    /// </summary>
    [AddComponentMenu("GS2 Studio/Showroom/Release This Node")]
    public sealed class SkillNodeReleaseButton : MonoBehaviour
    {
        /// <summary>
        /// The skill tree namespace this demo deploys, which is the name the
        /// feature package binds its namespace row to.
        /// </summary>
        private const string Namespace = "SkillTree";

        [SerializeField] private SkillNodeHandlerBase? _handler;
        [SerializeField] private Button? _button;

        /// <summary>
        /// Raised once the release has committed. The wallet reads its balance
        /// through its own handler, which has no way to know an unrelated
        /// component just moved it.
        /// </summary>
        [SerializeField] private UnityEvent _onCompleted = new UnityEvent();

        /// <summary>
        /// Raised when the release fails with a GS2 error — which is what a
        /// node short of its premises or its cost comes back as, and the one
        /// thing a visitor most needs to see.
        /// </summary>
        [SerializeField] private ErrorEvent _onFailed = new ErrorEvent();

        public UnityEvent OnCompleted => _onCompleted;
        public ErrorEvent OnFailed => _onFailed;

        private bool _wired;
        private ShowroomPage? _page;

        private void OnEnable()
        {
            if (_handler == null) _handler = GetComponentInParent<SkillNodeHandlerBase>();
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

        private async void OnClicked()
        {
            try
            {
                await Release();
            }
            catch (Gs2Exception error)
            {
                // A click has nothing to resume from, so no retry is offered.
                _onFailed.Invoke(error, null);
                Debug.LogError($"SkillNodeReleaseButton: release failed: {error}", this);
                return;
            }
            catch (Exception error)
            {
                Report($"Release failed: {error.Message}");
                Debug.LogError($"SkillNodeReleaseButton: release failed: {error}", this);
                return;
            }
            _onCompleted.Invoke();
        }

        private async Task Release()
        {
            var binder = _handler?.Binder;
            var node = binder?.Id.ToString();
            var owner = binder?.Owner;
            if (string.IsNullOrEmpty(node) || string.IsNullOrEmpty(owner))
            {
                // The row is still arriving, or the list has not been told
                // whose tree it is. Neither is a failure to report: the first
                // resolves itself and the second is what the character row's
                // button is for.
                return;
            }

            var runtime = FindAnyObjectByType<Gs2HolderRuntimeContextProvider>();
            if (runtime == null || !runtime.TryGet(out var gs2, out var session) ||
                gs2 == null || session == null)
            {
                Report("The GS2 runtime context is not available.");
                return;
            }

            // A list because one transaction may release several nodes at
            // once. A press on a row releases that row.
            await new Gs2Bind.Gs2SkillTree.NodeModelLoader(Namespace, node).Release(
                gs2, session, propertyId: owner, nodeModelNames: new[] { node });
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

// The owner comes from the bound character row at runtime; a baked scene constant cannot select its tree.
#nullable enable

using UnityEngine;
using UnityEngine.Events;
using UnityEngine.UI;

using Gs2.Core.Exception;
using Gs2.Unity.Util;

using GS2Studio.Generated.Character;

namespace GS2Studio.Showroom.Demo
{
    // Keep the generated button event shape: the page builder discovers actions through OnCompleted and wires OnFailed.
    [AddComponentMenu("GS2 Studio/Showroom/Open This Character's Tree")]
    public sealed class CharacterOpenTreeButton : MonoBehaviour
    {
        [SerializeField] private CharacterHandlerBase? _handler;
        [SerializeField] private Button? _button;

        [SerializeField] private UnityEvent _onCompleted = new UnityEvent();

        // Required by the page builder even though asynchronous tree-read failures are reported by the panel.
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
                // The row may be clicked before binding supplies its owner; no tree can be selected yet.
                return;
            }

            SkillNodeTreeCanvas.Ensure(PageFont()).OpenFor(owner!);
            _onCompleted.Invoke();
        }

        // Reuse the row font so the runtime panel follows the baked page typography.
        private Font? PageFont()
        {
            var label = GetComponentInChildren<Text>(true);
            return label == null ? null : label.font;
        }
    }
}

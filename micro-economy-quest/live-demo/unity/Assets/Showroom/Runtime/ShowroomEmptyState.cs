// What a list section says when it has loaded and holds nothing.
//
// A generated list handler raises `ListChanged` while a reload is still in
// flight as well as once it has mounted, so "no rows" alone cannot tell a
// list that is still loading from one that is empty. `IGs2ListState` carries
// the difference: the line beside the rows is shown only once the list is
// loaded and its count is zero, and hidden again the moment a row arrives or
// the list starts loading over.
//
// It only listens. The list keeps itself current, so nothing here reloads it;
// a list that failed to load is not loaded either, and stays silent rather
// than claiming to be empty.
#nullable disable
using GS2Studio.Generated.Runtime;
using UnityEngine;

namespace GS2Studio.Showroom
{
    [AddComponentMenu("GS2 Studio/Showroom/Showroom Empty State")]
    public sealed class ShowroomEmptyState : MonoBehaviour
    {
        /// <summary>The section's generated list handler; it implements <see cref="IGs2ListState"/>.</summary>
        [SerializeField] private MonoBehaviour _list;

        /// <summary>The line shown while the list is loaded and empty.</summary>
        [SerializeField] private GameObject _empty;

        private IGs2ListState _state;

        private void Awake()
        {
            _state = _list as IGs2ListState;
            if (_state == null)
            {
                Debug.LogError(
                    $"ShowroomEmptyState on '{name}': '{(_list == null ? "nothing" : _list.GetType().Name)}' " +
                    "is not a generated list handler, so there is no list to say is empty.",
                    this);
            }
            if (_empty != null) _empty.SetActive(false);
        }

        private void OnEnable()
        {
            if (_state == null) return;
            _state.ListChanged += Refresh;
            Refresh();
        }

        private void OnDisable()
        {
            if (_state == null) return;
            _state.ListChanged -= Refresh;
        }

        private void Refresh()
        {
            if (_empty == null) return;
            var empty = _state.IsLoaded && _state.Count == 0;
            if (_empty.activeSelf != empty) _empty.SetActive(empty);
        }
    }
}

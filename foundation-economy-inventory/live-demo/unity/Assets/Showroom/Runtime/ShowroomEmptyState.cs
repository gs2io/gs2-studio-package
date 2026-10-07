// Zero rows during loading or after failure must not be presented as a successfully empty list.
#nullable disable
using GS2Studio.Generated.Runtime;
using UnityEngine;

namespace GS2Studio.Showroom
{
    [AddComponentMenu("GS2 Studio/Showroom/Showroom Empty State")]
    public sealed class ShowroomEmptyState : MonoBehaviour
    {
        [SerializeField] private MonoBehaviour _list;

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

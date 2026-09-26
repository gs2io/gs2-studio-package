// The bonuses rolled onto one piece of equipment, as one line of text.
//
// The bonuses are a list inside the piece's row, and the page draws a row's
// values one per line, not a list within a row. So this reads the list off the
// row's handler and publishes it as text: "attack +12 / critical +5". A piece
// with nothing rolled yet shows nothing, rather than a placeholder that would
// read like a bonus.
#nullable enable

using System.Collections.Generic;
using System.Globalization;
using System.Text;

using UnityEngine;
using UnityEngine.Events;

using GS2Studio.Generated.Equipment;

namespace GS2Studio.Showroom.Demo
{
    /// <summary>
    /// Publishes the bonuses of the equipment row it sits in, whenever the row
    /// updates.
    /// </summary>
    [AddComponentMenu("GS2 Studio/Showroom/Equipment Enchantments")]
    public sealed class EquipmentEnchantmentsLabel : MonoBehaviour
    {
        [SerializeField] private UnityEvent<string> _onUpdate = new UnityEvent<string>();

        public UnityEvent<string> OnUpdate => _onUpdate;

        private EquipmentHandlerBase? _handler;

        private void OnEnable()
        {
            _handler ??= GetComponentInParent<EquipmentHandlerBase>();
            if (_handler == null)
            {
                Debug.LogError("EquipmentEnchantmentsLabel: no equipment row above this label.", this);
                return;
            }
            _handler.Updated += OnUpdated;
            if (_handler.HasValue && _handler.Model != null) OnUpdated(_handler.Model);
        }

        private void OnDisable()
        {
            if (_handler != null) _handler.Updated -= OnUpdated;
        }

        private void OnUpdated(Equipment model)
        {
            _onUpdate.Invoke(Format(model.Enchantments));
        }

        private static string Format(
            IReadOnlyList<GS2Studio.Generated.EquipmentEnchantment.EquipmentEnchantment>? enchantments)
        {
            if (enchantments == null || enchantments.Count == 0) return string.Empty;
            var text = new StringBuilder();
            foreach (var enchantment in enchantments)
            {
                if (text.Length > 0) text.Append(" / ");
                text.Append(enchantment.ResourceName);
                text.Append(enchantment.ResourceValue < 0 ? " " : " +");
                text.Append(enchantment.ResourceValue.ToString(CultureInfo.InvariantCulture));
            }
            return text.ToString();
        }
    }
}

// Bake the section active so Awake can decide its visibility; an inactive section cannot wake itself.
// Keep listeners while hidden so source updates can make the section visible again.
#nullable disable
using System;
using System.Collections.Generic;
using System.Linq;
using System.Reflection;
using UnityEngine;

namespace GS2Studio.Showroom
{
    [AddComponentMenu("GS2 Studio/Showroom/Showroom Key Relay")]
    public sealed class ShowroomKeyRelay : MonoBehaviour
    {
        [SerializeField] private MonoBehaviour _source;
        [SerializeField] private MonoBehaviour _target;
        [SerializeField] private string[] _keyProperties = new string[0];
        [SerializeField] private string _whileProperty = "";

        private PropertyInfo _sourceModel;
        private PropertyInfo _targetModel;
        private PropertyInfo[] _keys;
        private PropertyInfo _while;
        private MethodInfo _setKeys;
        private EventInfo _sourceUpdated;
        private EventInfo _targetUpdated;
        private Delegate _sourceListener;
        private Delegate _targetListener;
        private string[] _applied;

        public static Type ModelTypeOf(Type handler)
        {
            return handler.GetProperty("Model", BindingFlags.Instance | BindingFlags.Public)?.PropertyType;
        }

        // Interface GetProperties omits inherited members, so visit the extended interfaces too.
        public static IReadOnlyList<PropertyInfo> ModelProperties(Type model)
        {
            var types = model.IsInterface ? new[] { model }.Concat(model.GetInterfaces()) : new[] { model };
            return types
                .SelectMany(type => type.GetProperties(BindingFlags.Instance | BindingFlags.Public))
                .Where(property => property.GetIndexParameters().Length == 0)
                .GroupBy(property => property.Name, StringComparer.Ordinal)
                .Select(group => group.First())
                .OrderBy(property => property.Name, StringComparer.Ordinal)
                .ToList();
        }

        public static PropertyInfo ModelProperty(Type model, string name)
        {
            return ModelProperties(model).FirstOrDefault(
                property => string.Equals(property.Name, name, StringComparison.Ordinal));
        }

        // Arbitrary ToString results can be counts or type names, not resource keys.
        public static bool IsKeyProperty(PropertyInfo property)
        {
            var type = Nullable.GetUnderlyingType(property.PropertyType) ?? property.PropertyType;
            if (type == typeof(string)) return true;
            return type.IsValueType && !type.IsPrimitive && !type.IsEnum &&
                type.GetProperty("Value", BindingFlags.Instance | BindingFlags.Public)?.PropertyType == typeof(string);
        }

        public static bool IsConditionProperty(PropertyInfo property)
        {
            return (Nullable.GetUnderlyingType(property.PropertyType) ?? property.PropertyType) == typeof(bool);
        }

        // Match string parameters exactly so reflection cannot invoke a differently typed key setter.
        public static MethodInfo SetKeysOf(Type handler, int count)
        {
            return handler.GetMethod(
                "SetKeys", BindingFlags.Instance | BindingFlags.Public, null,
                Enumerable.Repeat(typeof(string), count).ToArray(), null);
        }

        private void Awake()
        {
            if (!Resolve())
            {
                gameObject.SetActive(false);
                return;
            }
            _sourceListener = Subscribe(_source, _sourceUpdated);
            _targetListener = Subscribe(_target, _targetUpdated);
            Evaluate();
        }

        private void OnDestroy()
        {
            if (_sourceListener != null && _source != null) _sourceUpdated.RemoveEventHandler(_source, _sourceListener);
            if (_targetListener != null && _target != null) _targetUpdated.RemoveEventHandler(_target, _targetListener);
        }

        // Hand-edited scenes or stale generated types can invalidate a previously baked relay.
        private bool Resolve()
        {
            if (_source == null || _target == null)
            {
                Debug.LogError($"[showroom] {name}: the key relay has no source or no target handler", this);
                return false;
            }
            _sourceModel = _source.GetType().GetProperty("Model", BindingFlags.Instance | BindingFlags.Public);
            _targetModel = _target.GetType().GetProperty("Model", BindingFlags.Instance | BindingFlags.Public);
            _sourceUpdated = _source.GetType().GetEvent("Updated");
            _targetUpdated = _target.GetType().GetEvent("Updated");
            _setKeys = SetKeysOf(_target.GetType(), _keyProperties.Length);
            if (_sourceModel == null || _targetModel == null || _sourceUpdated == null ||
                _targetUpdated == null || _setKeys == null || _keyProperties.Length == 0)
            {
                Debug.LogError(
                    $"[showroom] {name}: {_source.GetType().Name} or {_target.GetType().Name} is not " +
                    $"shaped like a generated handler taking {_keyProperties.Length} key(s); re-bake the page",
                    this);
                return false;
            }
            var model = _sourceModel.PropertyType;
            _keys = _keyProperties.Select(property => ModelProperty(model, property)).ToArray();
            _while = string.IsNullOrEmpty(_whileProperty) ? null : ModelProperty(model, _whileProperty);
            var missing = _keyProperties
                .Where((property, index) => _keys[index] == null || !IsKeyProperty(_keys[index]))
                .Concat(string.IsNullOrEmpty(_whileProperty) || (_while != null && IsConditionProperty(_while))
                    ? Enumerable.Empty<string>()
                    : new[] { _whileProperty })
                .ToList();
            if (missing.Count > 0)
            {
                Debug.LogError(
                    $"[showroom] {name}: {model.Name} has no {string.Join(", ", missing)} of a type it can read; re-bake the page",
                    this);
                return false;
            }
            return true;
        }

        // Action<object> variance cannot satisfy Delegate.Combine with Action<Model>;
        // construct the listener using the event's exact delegate type.
        private Delegate Subscribe(MonoBehaviour handler, EventInfo updated)
        {
            var method = typeof(ShowroomKeyRelay).GetMethod(
                nameof(OnUpdated), BindingFlags.Instance | BindingFlags.NonPublic);
            var listener = Delegate.CreateDelegate(updated.EventHandlerType, this, method);
            updated.AddEventHandler(handler, listener);
            return listener;
        }

        private void OnUpdated(object model)
        {
            Evaluate();
        }

        // Keep applied keys while hidden so the same row can return without another read.
        // New keys must hide the old model until the target publishes its replacement.
        private void Evaluate()
        {
            var keys = PresentKeys();
            if (keys == null)
            {
                Hide();
                return;
            }
            if (_applied == null || !keys.SequenceEqual(_applied, StringComparer.Ordinal))
            {
                Hide();
                // SetKeys may raise Updated synchronously; that callback must already see the new keys.
                _applied = keys;
                _setKeys.Invoke(_target, keys.Cast<object>().ToArray());
                return;
            }
            if (_targetModel.GetValue(_target) != null && !gameObject.activeSelf) gameObject.SetActive(true);
        }

        private string[] PresentKeys()
        {
            var model = _sourceModel.GetValue(_source);
            if (model == null) return null;
            if (_while != null && !(_while.GetValue(model) is bool holds && holds)) return null;
            var keys = new string[_keys.Length];
            for (var i = 0; i < _keys.Length; i++)
            {
                var text = _keys[i].GetValue(model)?.ToString();
                if (string.IsNullOrEmpty(text)) return null;
                keys[i] = text;
            }
            return keys;
        }

        private void Hide()
        {
            if (gameObject.activeSelf) gameObject.SetActive(false);
        }
    }
}

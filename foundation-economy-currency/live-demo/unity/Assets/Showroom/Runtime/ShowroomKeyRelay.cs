// A section whose row is named by another section's row.
//
// A keyed model the page pins with "key" is one row known before the page
// runs. Some rows are not: the quest a visitor is on is whichever one they
// started, and the only thing that knows is the row another section draws —
// the progress record carries the keys of the quest it is for. This reads
// those keys off the other section's model and hands them to this section's
// handler through `SetKeys`, and shows the section only while there is a row
// to show.
//
// It sits on the section it governs, beside that section's handler, and hides
// the section itself. The section is baked active so that this wakes at scene
// start; it then decides for itself, before any row has been drawn, whether
// the section is on the page. Baked inactive, nothing on it would ever wake to
// decide.
//
// Nothing here reloads or invalidates a handler. Both handlers keep themselves
// current, and `SetKeys` is the one call that moves the target to another row.
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
        /// <summary>The handler of the section the keys are read from.</summary>
        [SerializeField] private MonoBehaviour _source;
        /// <summary>This section's handler, whose `SetKeys` takes them.</summary>
        [SerializeField] private MonoBehaviour _target;
        /// <summary>The source model's properties, in the order `SetKeys` takes its parameters.</summary>
        [SerializeField] private string[] _keyProperties = new string[0];
        /// <summary>A `bool` property of the source model the section is shown only while it holds; empty for none.</summary>
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
        /// <summary>The keys last handed to the target, or null before any were.</summary>
        private string[] _applied;

        /// <summary>
        /// The model type a generated handler exposes as `Model`, or null when
        /// the type is not shaped like a generated handler.
        /// </summary>
        public static Type ModelTypeOf(Type handler)
        {
            return handler.GetProperty("Model", BindingFlags.Instance | BindingFlags.Public)?.PropertyType;
        }

        /// <summary>
        /// Every property a model exposes, by name, ordinal. A generated model
        /// is an interface, and an interface's own properties are all
        /// `GetProperties` returns — so what it inherits is asked of each
        /// interface it extends as well.
        /// </summary>
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

        /// <summary>The property of a model named exactly this, or null.</summary>
        public static PropertyInfo ModelProperty(Type model, string name)
        {
            return ModelProperties(model).FirstOrDefault(
                property => string.Equals(property.Name, name, StringComparison.Ordinal));
        }

        /// <summary>
        /// Whether a model property can be read as a key: text, or a generated
        /// id — a struct carrying its text as `Value` — either of them
        /// nullable. Anything else reads as text too, but not as a key: a
        /// count reads as a number nobody is identified by, and a nested
        /// model as its type name.
        /// </summary>
        public static bool IsKeyProperty(PropertyInfo property)
        {
            var type = Nullable.GetUnderlyingType(property.PropertyType) ?? property.PropertyType;
            if (type == typeof(string)) return true;
            return type.IsValueType && !type.IsPrimitive && !type.IsEnum &&
                type.GetProperty("Value", BindingFlags.Instance | BindingFlags.Public)?.PropertyType == typeof(string);
        }

        /// <summary>Whether a model property can be read as a condition: a `bool`, nullable or not.</summary>
        public static bool IsConditionProperty(PropertyInfo property)
        {
            return (Nullable.GetUnderlyingType(property.PropertyType) ?? property.PropertyType) == typeof(bool);
        }

        /// <summary>
        /// The target's `SetKeys` taking this many strings and nothing else,
        /// or null. Matched exactly, so a handler whose keys are not all text
        /// is not called with text.
        /// </summary>
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

        /// <summary>
        /// Everything this reads, looked up once. The page builder refused a
        /// declaration any of this would fail on before the scene existed, so
        /// a failure here is a scene edited by hand or generated code that
        /// moved without a re-bake; it is said, and the section stays off.
        /// </summary>
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

        /// <summary>
        /// Listens to a handler's `Updated` with a delegate of exactly the
        /// event's own type. `Updated` is an `Action` of the handler's model,
        /// and a generic `Action&lt;object&gt;` would be accepted by variance and
        /// then refused by `Delegate.Combine` the moment a second listener of
        /// the real type is added. So the delegate is made for the event,
        /// bound to one method taking the model as `object`.
        /// </summary>
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

        /// <summary>
        /// Decides whether the section is on the page, and which row it shows.
        ///
        /// Off whenever the source has no row, its condition does not hold or
        /// a key reads as nothing; the keys already handed over stay where
        /// they are, so the same row coming back shows without reading again.
        /// New keys hide the section first, because what it holds is the old
        /// row's until the target says otherwise, and the target's own
        /// `Updated` is what brings it back.
        /// </summary>
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
                // Recorded before the call: the target may raise `Updated`
                // before `SetKeys` returns, and that update is for these keys.
                _applied = keys;
                _setKeys.Invoke(_target, keys.Cast<object>().ToArray());
                return;
            }
            if (_targetModel.GetValue(_target) != null && !gameObject.activeSelf) gameObject.SetActive(true);
        }

        /// <summary>
        /// The keys the source's row names, or null when it names none: no
        /// row, a condition that does not hold, or a key that reads as
        /// nothing. A generated id reads as its value, and one never set reads
        /// as null.
        /// </summary>
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

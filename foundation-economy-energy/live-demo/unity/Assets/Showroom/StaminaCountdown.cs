#nullable enable

using System;
using System.Globalization;
using System.Reflection;

using UnityEngine;
using UnityEngine.UI;

using GS2Studio.Generated.Energy;

/// <summary>
/// Shows how long until the meter recovers, and credits the tick itself when
/// the wait is over.
///
/// GS2 accrues stamina lazily: the stored value only moves when someone reads
/// it, and the read returns what the elapsed time is worth. The page could ask
/// the server every minute, but it already holds every part of the answer — so
/// it works it out, and the next real read replaces it with the server's own
/// arithmetic.
///
/// Nothing here stops at the ceiling, because nothing needs to: an active
/// toggle hides this row once the meter is full, and a hidden row gets no
/// `Update`.
/// </summary>
public sealed class StaminaCountdown : MonoBehaviour
{
    /// <summary>
    /// A generated handler announces changes it made itself and keeps the
    /// announcement protected, which is right until a page credits a value the
    /// server has not been asked for yet.
    /// </summary>
    private static readonly MethodInfo? Announce = typeof(EnergyHandlerBase)
        .GetMethod("RaiseUpdated", BindingFlags.Instance | BindingFlags.NonPublic);

    [SerializeField] private Text? _label;

    private EnergyHandlerBase? _handler;
    private DateTime _deadline;
    private bool _waiting;

    /// <summary>
    /// Wired to the generated clock's `OnUpdate`, so every model update
    /// re-seats the deadline and a server answer always wins over a credited
    /// one.
    /// </summary>
    public void SetDeadline(DateTime deadline)
    {
        _deadline = deadline.ToUniversalTime();
        _waiting = true;
    }

    private void OnEnable() => _handler = GetComponentInParent<EnergyHandlerBase>();

    private void Update()
    {
        if (!_waiting || _label == null) return;
        // Past the deadline, move on by one interval rather than by however
        // many have elapsed: a backgrounded tab gets no `Update` calls, and
        // crediting ticks the page never counted would be a guess.
        if (DateTime.UtcNow >= _deadline) Credit();
        var remaining = _deadline - DateTime.UtcNow;
        if (remaining < TimeSpan.Zero) remaining = TimeSpan.Zero;
        _label.text = remaining.ToString(@"mm\:ss", CultureInfo.InvariantCulture);
    }

    /// <summary>Adds one interval's worth to the meter and tells the page.</summary>
    private void Credit()
    {
        // The binder keeps the writable model to itself, which is right for
        // everyone but the page predicting the next value.
        if (_handler?.Model is not EnergyBinder binder || Announce == null)
        {
            _waiting = false;
            return;
        }
        var model = binder.MutableModel;
        _deadline = _deadline.AddMinutes(Math.Max(1, model.RecoveryIntervalMinutes));
        model.CurrentValue += model.RecoveryValue;
        model.NextRecoverdAt = _deadline;
        Announce.Invoke(_handler, new object[] { model });
    }
}

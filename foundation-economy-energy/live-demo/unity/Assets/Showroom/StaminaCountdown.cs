#nullable enable

using System;
using System.Reflection;

using UnityEngine;

using GS2Studio.Generated.Energy;

/// <summary>
/// Credits a recovery when the energy's next recovery time arrives.
///
/// The reading itself — how long until then — is the showroom's, drawn by
/// its own countdown on the same row; the page builder wires this behaviour
/// beside it because it takes <c>SetDeadline(DateTime)</c>. What this adds is
/// what only the demo knows: that the deadline is a recovery, and that a
/// visitor watching the page should see the value tick up when it lands
/// rather than wait for the next read from the server.
/// </summary>
public sealed class StaminaCountdown : MonoBehaviour
{
    private static readonly MethodInfo? Announce = typeof(EnergyHandlerBase)
        .GetMethod("RaiseUpdated", BindingFlags.Instance | BindingFlags.NonPublic);

    private EnergyHandlerBase? _handler;
    private DateTime _deadline;
    private bool _waiting;

    public void SetDeadline(DateTime deadline)
    {
        _deadline = deadline.ToUniversalTime();
        _waiting = true;
    }

    private void OnEnable() => _handler = GetComponentInParent<EnergyHandlerBase>();

    private void Update()
    {
        if (!_waiting) return;
        if (DateTime.UtcNow >= _deadline) Credit();
    }

    private void Credit()
    {
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

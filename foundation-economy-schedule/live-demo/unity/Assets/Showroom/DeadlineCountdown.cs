#nullable enable

using System;
using System.Globalization;

using UnityEngine;
using UnityEngine.UI;

/// <summary>
/// Counts down to a deadline a generated `value` component publishes.
///
/// A schedule is only legible as time remaining. The date a window closes is
/// a fact a player has to do arithmetic on; how long they have left is the
/// thing they actually wanted to know.
///
/// Three states, because a deadline has three: one that has not been set —
/// a relative window carries no end until its trigger is pulled — one that
/// has passed, and one still ahead. Days are spelled out when there are any,
/// so a window closing next year does not read as a plausible countdown.
/// </summary>
public sealed class DeadlineCountdown : MonoBehaviour
{
    /// <summary>
    /// A timestamp GS2 never set arrives as the zero `DateTime`, which would
    /// otherwise read as a deadline that passed two thousand years ago.
    /// </summary>
    private static readonly DateTime Unset = new DateTime(2000, 1, 1, 0, 0, 0, DateTimeKind.Utc);

    [SerializeField] private Text? _label;

    private DateTime _deadline;
    private bool _known;

    /// <summary>Wired to the generated clock's `OnUpdate`.</summary>
    public void SetDeadline(DateTime deadline)
    {
        _deadline = deadline.ToUniversalTime();
        _known = _deadline > Unset;
        Render();
    }

    private void Update() => Render();

    private void Render()
    {
        if (_label == null) return;
        if (!_known)
        {
            _label.text = "not set";
            return;
        }
        var remaining = _deadline - DateTime.UtcNow;
        if (remaining <= TimeSpan.Zero)
        {
            _label.text = "ended";
            return;
        }
        _label.text = remaining.TotalDays >= 1
            ? $"{(int)remaining.TotalDays}d {remaining.Hours:00}:{remaining.Minutes:00}:{remaining.Seconds:00}"
            : $"{(int)remaining.TotalHours:00}:{remaining.Minutes:00}:{remaining.Seconds:00}";
    }
}

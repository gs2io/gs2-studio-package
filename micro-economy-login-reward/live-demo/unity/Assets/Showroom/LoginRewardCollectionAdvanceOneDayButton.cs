// Moves the player's clock forward one day: one login reward's worth.
//
// The login reward hands out one day per day, at 15:00 UTC, and a visitor
// does not wait a week to see day seven. Moving the account's clock forward
// 24 hours lands the next Receive on the next day.
#nullable enable

using UnityEngine;

namespace GS2Studio.Showroom.Demo
{
    /// <summary>Moves the signed-in player's clock on GS2 forward one day.</summary>
    [AddComponentMenu("GS2 Studio/Showroom/Advance One Day")]
    public sealed class LoginRewardCollectionAdvanceOneDayButton : DemoClockAdvanceButton
    {
        protected override int Seconds => 24 * 60 * 60;
    }
}

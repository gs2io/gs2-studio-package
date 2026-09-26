// How far this demo has moved a player's clock.
//
// GS2 keeps the offset on the account and carries it into every access token
// the account signs in with, so the server needs nothing from here. The page
// does: advancing adds a day to what the account already has, and the clock
// label shows the time the server now sees. So this demo remembers what it
// last set, per player, in PlayerPrefs.
//
// The copy can fall behind the account (PlayerPrefs cleared, another browser).
// Advancing then sets an offset lower than the account's, which moves the
// clock back rather than forward; the login reward keeps what was already
// received either way, so the cost is a day or two to advance through again.
#nullable enable

using System;

using UnityEngine;

namespace GS2Studio.Showroom.Demo
{
    /// <summary>
    /// The time offset, in seconds, this demo last gave a player's account.
    /// </summary>
    public static class DemoTimeOffset
    {
        /// <summary>
        /// The largest offset GS2 accepts: ten years, in seconds.
        /// </summary>
        public const int MaxSeconds = 315360000;

        private const string KeyPrefix = "GS2Studio.Showroom.Demo.TimeOffset.";

        /// <summary>
        /// Raised after <see cref="Set"/> stores a new offset, with the player
        /// it belongs to.
        /// </summary>
        public static event Action<string>? Changed;

        /// <summary>The stored offset for the player, or 0 when none is.</summary>
        public static int Get(string userId)
        {
            return PlayerPrefs.GetInt(KeyPrefix + userId, 0);
        }

        /// <summary>
        /// Store the offset the player's account now has, and tell whoever
        /// shows it.
        ///
        /// Saved at once rather than when the player quits: a WebGL page is
        /// closed, not quit, and an unsaved offset would be lost with it.
        /// </summary>
        public static void Set(string userId, int seconds)
        {
            PlayerPrefs.SetInt(KeyPrefix + userId, seconds);
            PlayerPrefs.Save();
            Changed?.Invoke(userId);
        }
    }
}

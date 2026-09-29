// How far this demo has moved a player's clock.
//
// GS2 keeps the offset on the account and carries it into every access token
// the account signs in with, so the server needs nothing from here. The page
// does: advancing adds to what the account already has, and the clock label
// shows the time the server now sees. So the demo remembers what it last set,
// per player, in PlayerPrefs.
//
// The copy can fall behind the account (PlayerPrefs cleared, another browser).
// Advancing then sets an offset lower than the account's, which moves the
// clock back rather than forward. The demos that use this take that as it
// comes: what was already received stays received, and at worst the visitor
// advances through the time again.
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

        /// <summary>
        /// Raised once the session has signed in again with the new offset,
        /// with the player it belongs to. What the server reports from here on
        /// is on the new clock; before it, reads still go out on the old one.
        /// </summary>
        public static event Action<string>? Applied;

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

        /// <summary>
        /// Tell whoever reads the server that the session now carries the
        /// player's stored offset.
        /// </summary>
        public static void NotifyApplied(string userId)
        {
            Applied?.Invoke(userId);
        }
    }
}

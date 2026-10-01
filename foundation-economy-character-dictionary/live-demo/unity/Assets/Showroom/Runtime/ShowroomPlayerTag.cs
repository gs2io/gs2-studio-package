// The short name a player goes by on every showroom page until they choose one.
//
// Demos that show other players (friends, guilds, rankings, the transfer page)
// need a name for an account that has none, and a visitor who moves between
// them must see the same account under the same name on each. So the name is
// derived from the user id alone, the same way everywhere: a 32-bit FNV-1a
// hash of the id's UTF-16 code units, of which the low 16 bits are written as
// four hex digits.
//
// Changing the derivation renames every anonymous player on every page at
// once, including in the text a visitor may have copied, so it does not change.
#nullable enable

namespace GS2Studio.Showroom
{
    /// <summary>A short, stable name for a player who has not chosen one.</summary>
    public static class ShowroomPlayerTag
    {
        /// <summary>
        /// The tag for <paramref name="userId"/>: <c>Player XXXX</c>. The same
        /// id always reads the same, and two ids rarely read alike. A null id
        /// reads as the empty one does.
        /// </summary>
        public static string Of(string? userId)
        {
            unchecked
            {
                var hash = 2166136261u;
                foreach (var character in userId ?? "")
                {
                    hash = (hash ^ character) * 16777619u;
                }
                return $"Player {hash & 0xFFFF:X4}";
            }
        }
    }
}

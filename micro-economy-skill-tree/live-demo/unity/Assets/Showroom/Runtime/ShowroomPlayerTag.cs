// Keep the derivation stable across pages: changing it renames anonymous players
// in existing references and copied text.
#nullable enable

namespace GS2Studio.Showroom
{
    public static class ShowroomPlayerTag
    {
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

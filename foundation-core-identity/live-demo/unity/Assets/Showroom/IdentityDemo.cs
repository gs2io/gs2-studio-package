// What the transfer page's hand-written parts share beyond the showroom
// runtime: the account namespace and take-over type, making and reading
// transfer codes, and explaining GS2's refusals of them. Reaching the player,
// running presses, logging and player tags are the runtime's
// (`ShowroomRuntime`, `ShowroomPress`, `ShowroomLog`, `ShowroomPlayerTag`).
#nullable enable

using System;
using System.Security.Cryptography;
using System.Text;

using UnityEngine;

using Gs2.Core.Exception;
using Gs2.Gs2Account.Exception;
using Gs2.Unity.Core;
using Gs2.Unity.Util;

using AccountDomain = Gs2.Unity.Gs2Account.Domain.Model.EzAccountGameSessionDomain;
using AccountNamespaceDomain = Gs2.Unity.Gs2Account.Domain.Model.EzNamespaceDomain;

namespace GS2Studio.Showroom.Demo
{
    /// <summary>The transfer page's shared helpers.</summary>
    public static class IdentityDemo
    {
        /// <summary>The account namespace every showroom demo signs in to.</summary>
        public const string Namespace = "Account";

        /// <summary>
        /// The take-over type a transfer code is registered under: the feature
        /// package's <c>TRANSFER_CODE_TAKE_OVER_TYPE</c>. No OIDC type may use
        /// it, because GS2 refuses a password take-over for a type that has a
        /// take-over type model.
        /// </summary>
        public const int TakeOverType = 1024;

        /// <summary>Where every transfer code ID starts, so it cannot be mistaken for an email address.</summary>
        public const string IdentifierPrefix = "demo-";

        /// <summary>
        /// Crockford's base32: no I, L, O or U, so a code read aloud or copied
        /// by hand has no look-alike letters.
        /// </summary>
        private const string Alphabet = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

        /// <summary>The SDK's account namespace, for what runs without a session.</summary>
        public static AccountNamespaceDomain Accounts(Gs2Domain gs2) => gs2.Account.Namespace(Namespace);

        /// <summary>The SDK's domain for the signed-in player's account.</summary>
        public static AccountDomain Me(Gs2Domain gs2, IGameSession session) => Accounts(gs2).Me(session);

        /// <summary>
        /// The keys <c>ShowroomAccountStore</c> keeps the account under: its
        /// <c>_keyPrefix</c> as every showroom scene sets it, plus the suffixes
        /// it appends.
        /// </summary>
        private const string RememberedUserIdKey = "gs2.showroom.account.userId";
        private const string RememberedPasswordKey = "gs2.showroom.account.password";

#if UNITY_WEBGL && !UNITY_EDITOR
        [System.Runtime.InteropServices.DllImport("__Internal")]
        private static extern string ShowroomBrowserStorage_Get(string key);

        private static string? ReadRemembered(string key) => ShowroomBrowserStorage_Get(key);
#else
        private static string? ReadRemembered(string key) => PlayerPrefs.GetString(key, null);
#endif

        /// <summary>
        /// Whether the store now holds exactly this account, read back from
        /// where the next page reads it. A browser that blocks site data
        /// accepts the write and keeps nothing.
        /// </summary>
        public static bool IsRemembered(string userId, string password) =>
            ReadRemembered(RememberedUserIdKey) == userId && ReadRemembered(RememberedPasswordKey) == password;

        /// <summary>
        /// Whether GS2 refused because the player already has a transfer code:
        /// by its client error code, which the SDK has no exception type for.
        /// </summary>
        public static bool IsAlreadyRegistered(Gs2Exception error) =>
            ShowroomRefusal.HasCode(error, TakeOverAlreadyExistsCode);

        /// <summary>
        /// Whether GS2 refused the transfer code ID because another player
        /// already holds it. GS2 codes the refusal; a server without that code,
        /// and two players racing for one ID, end at the database's create
        /// guard instead, a 409 with no code raised at the "create" component.
        /// </summary>
        public static bool IsIdentifierTaken(Gs2Exception error) =>
            ShowroomRefusal.HasCode(error, TakeOverIdentifierTakenCode)
            || (error is ConflictException && ShowroomRefusal.IsComponent(error, CreateGuardComponent));

        /// <summary>GS2's code for a transfer code the player already has.</summary>
        private const string TakeOverAlreadyExistsCode = "account.takeOver.alreadyExists";

        /// <summary>GS2's code for a transfer code ID another player already holds.</summary>
        private const string TakeOverIdentifierTakenCode = "account.takeOver.userIdentifier.duplicate";

        /// <summary>The component of GS2's uncoded duplicate refusal from the database's create guard.</summary>
        private const string CreateGuardComponent = "create";

        /// <summary>
        /// Says why GS2 refused, for the refusals a visitor can meet; null
        /// leaves any other refusal to the press runner, which reports it by
        /// kind and code only, since these requests carry a password.
        /// </summary>
        public static string? Explain(IdentityPress press, Gs2Exception error)
        {
            switch (press)
            {
                case IdentityPress.Issue:
                case IdentityPress.Reissue:
                    if (IsAlreadyRegistered(error)) return "You already have a transfer code. Press \"Delete and reissue\" to replace it.";
                    if (IsIdentifierTaken(error)) return "Another player already holds the new transfer code ID. Press again for a new one.";
                    break;
                case IdentityPress.TakeOver:
                    if (error is BannedInfinityException) return "That account is banned, so it cannot be taken over.";
                    if (error is PasswordIncorrectException) return "The password does not match that ID. Check both, or issue a new code in the other browser.";
                    if (error is NotFoundException) return "No transfer code has that ID. Check it: the other browser may have deleted or reissued its code.";
                    break;
            }
            return null;
        }

        /// <summary>
        /// A new transfer code ID, <c>demo-XXXX-XXXX</c>. GS2 keeps each ID
        /// unique across the namespace, so it is random rather than chosen.
        /// </summary>
        public static string NewIdentifier() => IdentifierPrefix + Groups(2);

        /// <summary>A new password, <c>XXXX-XXXX-XXXX-XXXX</c>: 16 random symbols, 80 bits.</summary>
        public static string NewPassword() => Groups(4);

        /// <summary>Groups of four random symbols from the cryptographic generator.</summary>
        private static string Groups(int count)
        {
            var bytes = new byte[count * 4];
            using (var random = RandomNumberGenerator.Create())
            {
                random.GetBytes(bytes);
            }
            var text = new StringBuilder(count * 5);
            for (var index = 0; index < bytes.Length; index++)
            {
                if (index > 0 && index % 4 == 0) text.Append('-');
                // 256 is a multiple of 32, so the low five bits are uniform.
                text.Append(Alphabet[bytes[index] & 31]);
            }
            return text.ToString();
        }

        /// <summary>
        /// A transfer code ID as typed or pasted, in the form it was issued
        /// in, or null when it is not one. Letters may be in either case, and
        /// the look-alikes Crockford's base32 leaves out are read as the
        /// digits they resemble.
        /// </summary>
        public static string? ParseIdentifier(string text)
        {
            var trimmed = text.Trim();
            if (!trimmed.StartsWith(IdentifierPrefix, StringComparison.OrdinalIgnoreCase)) return null;
            var body = Normalize(trimmed.Substring(IdentifierPrefix.Length));
            return IsGroups(body, 2) ? IdentifierPrefix + body : null;
        }

        /// <summary>A password as typed or pasted, in the form it was issued in, or null when it is not one.</summary>
        public static string? ParsePassword(string text)
        {
            var body = Normalize(text.Trim());
            return IsGroups(body, 4) ? body : null;
        }

        private static string Normalize(string text) =>
            text.ToUpperInvariant().Replace('O', '0').Replace('I', '1').Replace('L', '1');

        private static bool IsGroups(string text, int count)
        {
            if (text.Length != count * 5 - 1) return false;
            for (var index = 0; index < text.Length; index++)
            {
                var expected = index % 5 == 4;
                if (expected ? text[index] != '-' : Alphabet.IndexOf(text[index]) < 0) return false;
            }
            return true;
        }
    }
}

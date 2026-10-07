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
    public static class IdentityDemo
    {
        public const string Namespace = "Account";

        /// <summary>Match the feature package's reserved transfer-code type so these requests cannot address an OIDC setting.</summary>
        public const int TakeOverType = 1024;

        /// <summary>Keep transfer identifiers distinguishable from email addresses when pasting.</summary>
        public const string IdentifierPrefix = "demo-";

        /// <summary>Use a restricted alphabet to reduce mistakes when codes are read or typed by hand.</summary>
        private const string Alphabet = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

        public static AccountNamespaceDomain Accounts(Gs2Domain gs2) => gs2.Account.Namespace(Namespace);

        public static AccountDomain Me(Gs2Domain gs2, IGameSession session) => Accounts(gs2).Me(session);

        /// <summary>Match the scene account store keys so read-back checks the credentials that the next page will use.</summary>
        private const string RememberedUserIdKey = "gs2.showroom.account.userId";
        private const string RememberedPasswordKey = "gs2.showroom.account.password";

#if UNITY_WEBGL && !UNITY_EDITOR
        [System.Runtime.InteropServices.DllImport("__Internal")]
        private static extern string ShowroomBrowserStorage_Get(string key);

        private static string? ReadRemembered(string key) => ShowroomBrowserStorage_Get(key);
#else
        private static string? ReadRemembered(string key) => PlayerPrefs.GetString(key, null);
#endif

        /// <summary>Read storage back before reloading because a write can fail without retaining the account.</summary>
        public static bool IsRemembered(string userId, string password) =>
            ReadRemembered(RememberedUserIdKey) == userId && ReadRemembered(RememberedPasswordKey) == password;

        public static bool IsAlreadyRegistered(Gs2Exception error) => error is TakeOverAlreadyExistsException;

        /// <summary>Recognize the typed duplicate refusal and the create-guard conflict without treating unrelated conflicts as taken identifiers.</summary>
        public static bool IsIdentifierTaken(Gs2Exception error) =>
            error is TakeOverIdentifierAlreadyUsedException
            || (error is ConflictException && ShowroomRefusal.IsComponent(error, CreateGuardComponent));

        private const string CreateGuardComponent = "create";

        /// <summary>Leave unknown refusals to the redacted press runner because these requests carry passwords.</summary>
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

        /// <summary>Random identifiers reduce collisions with transfer codes belonging to other accounts.</summary>
        public static string NewIdentifier() => IdentifierPrefix + Groups(2);

        public static string NewPassword() => Groups(4);

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

        /// <summary>Normalize common look-alike characters so a code entered by hand resolves to its issued spelling.</summary>
        public static string? ParseIdentifier(string text)
        {
            var trimmed = text.Trim();
            if (!trimmed.StartsWith(IdentifierPrefix, StringComparison.OrdinalIgnoreCase)) return null;
            var body = Normalize(trimmed.Substring(IdentifierPrefix.Length));
            return IsGroups(body, 2) ? IdentifierPrefix + body : null;
        }

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

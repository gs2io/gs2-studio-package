// What the transfer page's hand-written parts share: reaching the signed-in
// player, running one press at a time, making transfer codes, saying why GS2
// refused, and the short name an account goes by.
#nullable enable

using System;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using System.Threading.Tasks;

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

        private static bool _busy;
        private static bool _frozen;
        private static ShowroomPage? _page;

        /// <summary>The signed-in player's SDK handles, once signed in.</summary>
        public static bool TryRuntime(out Gs2Domain? gs2, out IGameSession? session)
        {
            gs2 = null;
            session = null;
            var runtime = UnityEngine.Object.FindAnyObjectByType<GS2Studio.Generated.Runtime.Gs2HolderRuntimeContextProvider>();
            return runtime != null && runtime.TryGet(out gs2, out session) && gs2 != null && session != null;
        }

        /// <summary>The SDK's account namespace, for what runs without a session.</summary>
        public static AccountNamespaceDomain Accounts(Gs2Domain gs2) => gs2.Account.Namespace(Namespace);

        /// <summary>The SDK's domain for the signed-in player's account.</summary>
        public static AccountDomain Me(Gs2Domain gs2, IGameSession session) => Accounts(gs2).Me(session);

        /// <summary>
        /// How long after what the page shows changed a press is refused: a
        /// button that just changed its meaning may be pressed for the one it
        /// had a moment ago.
        /// </summary>
        private const float SettleSeconds = 0.6f;

        private static float _lastChange = float.NegativeInfinity;

        /// <summary>Says that what a button does just changed.</summary>
        public static void MarkChanged() => _lastChange = Time.realtimeSinceStartup;

        /// <summary>
        /// Runs one press, one at a time across the whole page, and says the
        /// outcome in the page's log. What it changed reaches every reader
        /// through the SDK's cache, so nothing is read again here.
        /// <paramref name="afterward"/> runs once the press is over, whether it
        /// worked or not. Returns whether the press started.
        /// </summary>
        public static bool Run(IdentityPress press, Func<Gs2Domain, IGameSession, Task<string>> action, Action? afterward = null)
        {
            if (_frozen)
            {
                Log("The page is reloading.");
                return false;
            }
            if (_busy)
            {
                Log("One moment: the last press is still going.");
                return false;
            }
            if (Time.realtimeSinceStartup - _lastChange < SettleSeconds)
            {
                Log("The page just changed; press again.");
                return false;
            }
            if (!TryRuntime(out var gs2, out var session))
            {
                Log("Not signed in yet.");
                return false;
            }
            _busy = true;
            Execute(press, gs2!, session!, action, afterward);
            return true;
        }

        private static async void Execute(IdentityPress press, Gs2Domain gs2, IGameSession session, Func<Gs2Domain, IGameSession, Task<string>> action, Action? afterward)
        {
            try
            {
                Log(await action(gs2, session));
            }
            catch (Gs2Exception error)
            {
                // Only the kind and GS2's own codes: a request that carried a
                // password is never echoed into the browser console.
                Debug.LogWarning($"{nameof(IdentityDemo)}: {press} refused: {Summary(error)}");
                Log(Explain(press, error));
            }
            catch (Exception error)
            {
                // The type only: the message of an unexpected failure may carry
                // what the request carried.
                Debug.LogError($"{nameof(IdentityDemo)}: {press} failed: {error.GetType().Name}");
                Log($"Failed: {error.GetType().Name}");
            }
            finally
            {
                _busy = false;
            }
            afterward?.Invoke();
        }

        /// <summary>Refuses every press from now on: the page is about to reload as another account.</summary>
        public static void Freeze() => _frozen = true;

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

        /// <summary>The kind of a refusal and GS2's codes for it.</summary>
        public static string Summary(Gs2Exception error)
        {
            var codes = error.Errors?.Select(detail => detail.Code).Where(code => !string.IsNullOrEmpty(code)).ToArray()
                ?? Array.Empty<string>();
            return codes.Length == 0 ? error.GetType().Name : $"{error.GetType().Name} ({string.Join(", ", codes)})";
        }

        private static string Text(Gs2Exception error) =>
            string.Join(" ", error.Errors?.Select(detail => detail.Code + " " + detail.message) ?? Array.Empty<string>()) + " " + error.Message;

        /// <summary>Whether GS2 refused because the player already has a transfer code.</summary>
        public static bool IsAlreadyRegistered(Gs2Exception error) =>
            error is ConflictException || Text(error).Contains("alreadyExists");

        /// <summary>Says why GS2 refused, for the refusals a visitor can meet.</summary>
        public static string Explain(IdentityPress press, Gs2Exception error)
        {
            switch (press)
            {
                case IdentityPress.Issue:
                case IdentityPress.Reissue:
                    if (IsAlreadyRegistered(error)) return "You already have a transfer code. Press \"Delete and reissue\" to replace it.";
                    // GS2 answers 500 when the ID is already another player's.
                    if (error is InternalServerErrorException) return "GS2 could not register the code (the ID may have been taken). Press again for a new one.";
                    break;
                case IdentityPress.TakeOver:
                    if (error is BannedInfinityException) return "That account is banned, so it cannot be taken over.";
                    if (error is UnauthorizedException) return "The password does not match that ID. Check both, or issue a new code in the other browser.";
                    if (error is NotFoundException) return "No transfer code has that ID. Check it: the other browser may have deleted or reissued its code.";
                    break;
            }
            return $"GS2 refused: {Summary(error)}";
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

        /// <summary>
        /// A short, stable name for an account: the same id always reads the
        /// same. The friend demo names a player the same way, so the tag here
        /// is the name the account goes by there until it chooses one.
        /// </summary>
        public static string Tag(string? userId)
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

        public static void Log(string message)
        {
            if (_page == null) _page = UnityEngine.Object.FindAnyObjectByType<ShowroomPage>();
            if (_page != null) _page.Log(message);
            else Debug.LogWarning($"{nameof(IdentityDemo)}: {message}");
        }
    }
}

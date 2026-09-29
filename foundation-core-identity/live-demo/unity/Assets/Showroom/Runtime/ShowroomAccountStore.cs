// Where the showroom keeps the visitor's anonymous GS2 account.
//
// `Gs2AutoLoginAction` asks for a saved account through `OnRestoreAccount` and
// hands a new one out through `OnAccountCreated`; this answers both. It stands
// in for the package's `Gs2PlayerPrefsAccountStore` for one reason: on WebGL,
// PlayerPrefs are stored under a directory named after the page's URL, so
// every demo (each served from its own directory) would make an account of its
// own. The browser's localStorage belongs to the whole origin, so every demo
// served from it signs in as the same visitor, and data one demo changes shows
// up in the next. Outside a WebGL player there is no browser, and PlayerPrefs
// are used as before.
//
// It also owns what happens when the account it handed over is refused. A
// namespace that was recreated no longer knows the accounts saved against the
// old one, and `Gs2AutoLoginAction` would restore the same credentials on
// every retry, so the page would stay on "Sign-in failed" for good. A refused
// saved account is therefore forgotten and a new one made in its place. Only
// a refusal of the credentials themselves does that: a network failure says
// nothing about the account, and wiping it then would lose a visitor's data to
// a flaky connection.
#nullable disable
using System;
using System.Collections;
using System.Linq;
#if UNITY_WEBGL && !UNITY_EDITOR
using System.Runtime.InteropServices;
#endif
using Gs2.Core.Exception;
using Gs2.Gs2Account.Exception;
using Gs2.Unity.Util;
using Gs2Bind.Gs2Account;
using UnityEngine;
using UnityEngine.Events;

namespace GS2Studio.Showroom
{
    [AddComponentMenu("GS2 Studio/Showroom/Showroom Account Store")]
    public sealed class ShowroomAccountStore : MonoBehaviour
    {
        /// <summary>
        /// Prefix of the two keys this reads and writes. Every demo uses the
        /// same one, which is what makes them share the account.
        /// </summary>
        [SerializeField] private string _keyPrefix = "gs2.showroom.account";

        /// <summary>
        /// Raised with a line for the page's log when a refused saved account is
        /// forgotten and a new one is being made.
        /// </summary>
        [SerializeField] private UnityEvent<string> _onReplacingAccount = new UnityEvent<string>();

        /// <summary>
        /// Raised with every sign-in failure this did not recover from, in the
        /// shape `Gs2AutoLoginAction.onError` raised it.
        /// </summary>
        [SerializeField] private ErrorEvent _onSignInFailed = new ErrorEvent();

        /// <summary>
        /// Whether the account being signed in with came from this store, so a
        /// refusal is a refusal of what was saved rather than of an account
        /// that was only just created.
        /// </summary>
        private bool _restored;

        private string UserIdKey => _keyPrefix + ".userId";
        private string PasswordKey => _keyPrefix + ".password";

        /// <summary>
        /// Wire to `Gs2AutoLoginAction.OnAccountCreated`. Also the call a demo
        /// makes when it switches the visitor to another account, before it
        /// reloads the page with <see cref="ShowroomReload.Reload"/>.
        /// </summary>
        public void Remember(string userId, string password)
        {
            Write(UserIdKey, userId);
            Write(PasswordKey, password);
            _restored = false;
        }

        /// <summary>
        /// Wire to `Gs2AutoLoginAction.OnRestoreAccount`. Leaving the fields
        /// alone means "no saved account", and a new one is created.
        /// </summary>
        public void Restore(Gs2AutoLoginAction login)
        {
            var userId = Read(UserIdKey);
            var password = Read(PasswordKey);
            if (string.IsNullOrEmpty(userId) || string.IsNullOrEmpty(password)) return;
            login.userId = userId;
            login.password = password;
            _restored = true;
        }

        /// <summary>Drops the saved account, so the next sign-in creates a new one.</summary>
        public void Forget()
        {
            Remove(UserIdKey);
            Remove(PasswordKey);
            _restored = false;
        }

        /// <summary>
        /// Wire to `Gs2AutoLoginAction.onError`, and wire
        /// `_onSignInFailed` on to the page.
        ///
        /// A refused saved account is forgotten and the sign-in run again, which
        /// finds nothing to restore and creates an account. That happens at most
        /// once per saved account: after `Forget` nothing is restored, so a
        /// second failure is never a refusal of saved credentials and goes on to
        /// the page like any other.
        /// </summary>
        public void OnSignInFailed(Gs2Exception error, Func<IEnumerator> retry)
        {
            if (_restored && retry != null && IsCredentialRefusal(error))
            {
                Forget();
                _onReplacingAccount.Invoke(
                    $"the saved account was refused ({Summarize(error)}); creating a new account");
                StartCoroutine(retry());
                return;
            }
            _onSignInFailed.Invoke(error, retry);
        }

        /// <summary>
        /// Whether the server refused the saved credentials themselves, which
        /// is exactly two answers from the account service's `Authentication`:
        ///
        /// - a wrong password. The SDK raises `PasswordIncorrectException` for
        ///   the error code `account.password.invalid`; the code is matched as
        ///   well, so the answer is still recognised if a caller in between
        ///   hands the plain exception on.
        /// - a user id the namespace does not know: a `NotFoundException` about
        ///   the `account` component, as opposed to a missing namespace.
        ///
        /// Every other `UnauthorizedException` is deliberately not a refusal of
        /// the saved account: a banned account (`BannedInfinityException`), a
        /// rejected auth signature or gateway session, or an expired project
        /// token all fail again for a new account, or say nothing about this
        /// one. Neither is a timeout or an unreachable server.
        /// </summary>
        private static bool IsCredentialRefusal(Gs2Exception error)
        {
            if (error is PasswordIncorrectException) return true;
            if (error is UnauthorizedException)
            {
                return error.Errors != null &&
                       error.Errors.Any(entry => entry != null && entry.Code == PasswordInvalidCode);
            }
            if (error is NotFoundException)
            {
                return error.Errors != null &&
                       error.Errors.Any(entry => entry != null && entry.Component == "account");
            }
            return false;
        }

        /// <summary>The account service's error code for a wrong password.</summary>
        private const string PasswordInvalidCode = "account.password.invalid";

        private static string Summarize(Gs2Exception error)
        {
            var messages = error.Errors == null
                ? Array.Empty<string>()
                : error.Errors
                    .Where(entry => entry != null && !string.IsNullOrEmpty(entry.Message))
                    .Select(entry => entry.Message)
                    .ToArray();
            return messages.Length > 0
                ? $"{error.GetType().Name}: {string.Join(", ", messages)}"
                : error.GetType().Name;
        }

#if UNITY_WEBGL && !UNITY_EDITOR
        [DllImport("__Internal")]
        private static extern string ShowroomBrowserStorage_Get(string key);

        [DllImport("__Internal")]
        private static extern int ShowroomBrowserStorage_Set(string key, string value);

        [DllImport("__Internal")]
        private static extern int ShowroomBrowserStorage_Remove(string key);

        private static string Read(string key)
        {
            return ShowroomBrowserStorage_Get(key);
        }

        private static void Write(string key, string value)
        {
            if (ShowroomBrowserStorage_Set(key, value) == 0)
            {
                Debug.LogWarning($"ShowroomAccountStore: the browser refused to store {key}; the next visit will make a new account.");
            }
        }

        private static void Remove(string key)
        {
            if (ShowroomBrowserStorage_Remove(key) == 0)
            {
                Debug.LogWarning($"ShowroomAccountStore: the browser refused to remove {key}.");
            }
        }
#else
        private static string Read(string key)
        {
            return PlayerPrefs.GetString(key, null);
        }

        private static void Write(string key, string value)
        {
            PlayerPrefs.SetString(key, value);
            PlayerPrefs.Save();
        }

        private static void Remove(string key)
        {
            PlayerPrefs.DeleteKey(key);
            PlayerPrefs.Save();
        }
#endif
    }
}

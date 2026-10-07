// WebGL PlayerPrefs separates page paths; origin-wide localStorage lets demos share one account.
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
        // Changing this prefix in one demo separates its saved account from the other demos.
        [SerializeField] private string _keyPrefix = "gs2.showroom.account";

        [SerializeField] private UnityEvent<string> _onReplacingAccount = new UnityEvent<string>();

        [SerializeField] private ErrorEvent _onSignInFailed = new ErrorEvent();

        private bool _restored;

        private string UserIdKey => _keyPrefix + ".userId";
        private string PasswordKey => _keyPrefix + ".password";

        public void Remember(string userId, string password)
        {
            Write(UserIdKey, userId);
            Write(PasswordKey, password);
            _restored = false;
        }

        // Partial credentials must not suppress creation of a new account.
        public void Restore(Gs2AutoLoginAction login)
        {
            var userId = Read(UserIdKey);
            var password = Read(PasswordKey);
            if (string.IsNullOrEmpty(userId) || string.IsNullOrEmpty(password)) return;
            login.userId = userId;
            login.password = password;
            _restored = true;
        }

        public void Forget()
        {
            Remove(UserIdKey);
            Remove(PasswordKey);
            _restored = false;
        }

        // Forget clears the restored flag before retry, preventing repeated replacement attempts.
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

        // Missing namespaces, network failures and unrelated authorization errors do not invalidate
        // saved credentials; replacing the account on those failures would lose the visitor's data.
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

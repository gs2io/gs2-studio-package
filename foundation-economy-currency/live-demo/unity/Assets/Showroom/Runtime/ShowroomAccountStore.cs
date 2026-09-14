// Keeps the demo's anonymous account across visits.
//
// `Gs2AutoLoginAction` asks where the account lives rather than deciding, so
// this answers for the showroom: PlayerPrefs, which in a WebGL build is the
// browser's own storage. A game would answer with a save file, the keychain,
// or a platform account service instead — that choice is the point of the
// two events being events.
//
// Without this a reload creates a new account, and the visitor's balance is
// gone every time they refresh the page.
#nullable disable
using Gs2Bind.Gs2Account;
using UnityEngine;

namespace GS2Studio.Showroom
{
    [AddComponentMenu("GS2 Studio/Showroom/Account Store")]
    public sealed class ShowroomAccountStore : MonoBehaviour
    {
        [SerializeField] private string _keyPrefix = "gs2.showroom.account";

        private string UserIdKey => $"{_keyPrefix}.userId";
        private string PasswordKey => $"{_keyPrefix}.password";

        /// <summary>Wire to `Gs2AutoLoginAction.OnRestoreAccount`.</summary>
        public void Restore(Gs2AutoLoginAction login)
        {
            var userId = PlayerPrefs.GetString(UserIdKey, null);
            var password = PlayerPrefs.GetString(PasswordKey, null);
            if (string.IsNullOrEmpty(userId) || string.IsNullOrEmpty(password)) return;
            login.userId = userId;
            login.password = password;
        }

        /// <summary>Wire to `Gs2AutoLoginAction.OnAccountCreated`.</summary>
        public void Remember(string userId, string password)
        {
            PlayerPrefs.SetString(UserIdKey, userId);
            PlayerPrefs.SetString(PasswordKey, password);
            PlayerPrefs.Save();
        }
    }
}

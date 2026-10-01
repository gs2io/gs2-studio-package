// How one press run by `ShowroomPress` behaves around its action.
#nullable enable

using System;

using Gs2.Core.Exception;

namespace GS2Studio.Showroom
{
    /// <summary>What a press is, and what happens around it.</summary>
    public sealed class ShowroomPressOptions
    {
        /// <summary>What the press is, for the console line about a failure.</summary>
        public string Name { get; set; } = "press";

        /// <summary>
        /// Whether a visitor pressed for this. A visitor's press is held by the
        /// settle pause, silently, since the page has just moved under the
        /// pointer; one refused because another press is out, the page is
        /// reloading or nobody is signed in says so on the page. False for
        /// what the page does on its own: that is not held by the settle pause
        /// (no moving button can have misdirected it), and says nothing when
        /// it cannot start, since nobody asked for it and it is tried again
        /// later.
        /// </summary>
        public bool Pressed { get; set; } = true;

        /// <summary>
        /// The page's line for a refusal this press can explain in its own
        /// terms, or null to leave it to <see cref="Unexplained"/> or the
        /// default reading.
        /// </summary>
        public Func<Gs2Exception, string?>? Explain { get; set; }

        /// <summary>
        /// Takes a refusal <see cref="Explain"/> did not explain, instead of
        /// the page saying it. A press shaped like a generated button hands it
        /// to its `OnFailed` event this way. Runs only while
        /// <see cref="Owner"/> is alive; once the owner is gone, the runner
        /// says the refusal itself, so it is still said once.
        /// </summary>
        public Action<Gs2Exception>? Unexplained { get; set; }

        /// <summary>
        /// Runs when GS2 says what was pressed on no longer exists
        /// (`NotFoundException`), for the rare cache the SDK does not correct
        /// itself. Runs only while <see cref="Owner"/> is alive.
        /// </summary>
        public Action? WhenGone { get; set; }

        /// <summary>
        /// Runs once a press that started is over, whether it worked or not,
        /// after the outcome is said; a callback that throws does not keep it
        /// from running. Not run when the press did not start (`Run` returned
        /// false), so a caller that disabled a button before `Run` turns it
        /// back on itself then. Runs only while <see cref="Owner"/> is alive.
        /// </summary>
        public Action? Afterward { get; set; }

        /// <summary>
        /// For a press whose request carries a secret (a password). Its
        /// failures are reported by kind and GS2's codes only
        /// (<see cref="ShowroomErrors.Summary"/>), on the page and in the
        /// console, because GS2's messages and an exception's text may echo
        /// what was sent.
        /// </summary>
        public bool Redact { get; set; }

        /// <summary>
        /// The object the press belongs to. Once it has been destroyed, the
        /// outcome is still said (a refusal meant for
        /// <see cref="Unexplained"/> included), but no callback runs.
        /// </summary>
        public UnityEngine.Object? Owner { get; set; }
    }
}

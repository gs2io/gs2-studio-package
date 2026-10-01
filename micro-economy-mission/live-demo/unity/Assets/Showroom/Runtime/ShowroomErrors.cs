// What a failure says on the page, which is never nothing and never raw JSON.
//
// `Gs2Exception.Errors` is the server's own account of what went wrong and is
// the right thing to show, but the SDK fills it by parsing the exception's
// message as that list, and there is a whole class of failure whose message is
// not one. A namespace that commits atomically runs its actions server-side
// and reports a refused one through the transaction result, which the SDK
// raises as an exception carrying that action's own result body
// (`RanTransactionAccessTokenDomain.HandleResult`) or as
// `UnknownException("Ran transaction failed.")`. Neither parses, so `Errors`
// comes back empty, and `error.Message` is the body as GS2 sent it: JSON. For
// a refused action that body is GS2's full error record,
// `{"errors": [{"component", "message", "code"}], "result", "stack", "metadata"}`.
//
// So the list is used when the SDK filled one, the body is unwrapped the way
// the SDK's own HTTP path unwraps it when it did not, and the exception's
// type names the failure when even that says nothing. `ShowroomRefusal` reads
// the same messages, so a refusal recognised by reason and a refusal shown to
// the visitor come from one reading.
#nullable enable

using System;
using System.Collections.Generic;
using System.Linq;

using Gs2.Core.Exception;
using Gs2.Util.LitJson;

namespace GS2Studio.Showroom
{
    /// <summary>Reads failures for the page.</summary>
    public static class ShowroomErrors
    {
        /// <summary>
        /// One line a visitor can read about <paramref name="error"/>.
        ///
        /// For a `Gs2Exception`, GS2's messages; for anything else, the
        /// exception's type and message. Reading an error body nothing here
        /// has seen may itself fail; that is caught, and the type name stands
        /// in, because the one thing the page must not do is print nothing.
        /// </summary>
        public static string Describe(Exception? error)
        {
            if (error == null) return "the action failed and said nothing about why";
            try
            {
                if (error is Gs2Exception gs2Error) return DescribeRefusal(gs2Error);
                return string.IsNullOrEmpty(error.Message) ? error.GetType().Name : $"{error.GetType().Name}: {error.Message}";
            }
            catch (Exception failure)
            {
                return $"{error.GetType().Name} (reading it failed: {failure.GetType().Name})";
            }
        }

        /// <summary>
        /// The kind of a refusal and GS2's codes for it, and nothing else.
        ///
        /// For a request that carried a secret (a password): GS2's messages and
        /// an exception's text may echo what was sent, so a page or console
        /// line about such a request says only this.
        /// </summary>
        public static string Summary(Gs2Exception error)
        {
            var codes = error.Errors?
                .Where(detail => detail != null && !string.IsNullOrEmpty(detail.Code))
                .Select(detail => detail.Code)
                .ToArray() ?? Array.Empty<string>();
            return codes.Length == 0 ? error.GetType().Name : $"{error.GetType().Name} ({string.Join(", ", codes)})";
        }

        /// <summary>
        /// Every message GS2 gave for <paramref name="error"/>: the parsed list
        /// and whatever the unparsed body holds. May repeat a message.
        /// </summary>
        internal static List<string> Messages(Gs2Exception error)
        {
            var messages = new List<string>();
            if (error.Errors != null)
            {
                foreach (var detail in error.Errors)
                {
                    if (detail != null && !string.IsNullOrEmpty(detail.Message)) messages.Add(detail.Message);
                }
            }
            try
            {
                messages.AddRange(BodyMessages(error.Message, out _));
            }
            catch (Exception)
            {
                // A body this cannot read holds no message it can match.
            }
            return messages;
        }

        private static string DescribeRefusal(Gs2Exception error)
        {
            var reported = string.Join(
                ", ",
                (error.Errors ?? Array.Empty<Gs2.Core.Model.RequestError>())
                    .Where(entry => entry != null && !string.IsNullOrEmpty(entry.Message))
                    .Select(entry => entry.Message));
            if (reported.Length > 0) return reported;
            var messages = BodyMessages(error.Message, out var text);
            var unwrapped = messages.Count > 0 ? string.Join(", ", messages) : text;
            return unwrapped.Length > 0 ? $"{error.GetType().Name}: {unwrapped}" : error.GetType().Name;
        }

        /// <summary>
        /// The messages in an error body the SDK left unparsed, and the most
        /// readable text of it when it holds none.
        ///
        /// GS2 wraps its error list in <c>{"message": "&lt;the list, as a string&gt;"}</c>,
        /// and an action inside a transaction is reported by handing over an
        /// envelope rather than the list inside it: either that one, or the
        /// full error record, whose <c>errors</c> holds the list itself.
        /// Unwrapping is therefore a loop: an object with a string
        /// <c>message</c> is one layer, an object with an <c>errors</c> array
        /// is the record, and an array of them is the list itself. A layer's
        /// message that is not JSON is a message in its own right. Anything
        /// else is handed back as <paramref name="text"/>, because a body this
        /// cannot read is still more than a blank line.
        /// </summary>
        private static List<string> BodyMessages(string? body, out string text)
        {
            var messages = new List<string>();
            text = "";
            if (string.IsNullOrEmpty(body)) return messages;
            text = body!.Trim();
            var unwrappedLayer = false;
            // Bounded rather than `while (true)`: the shapes above nest twice at
            // most, and a body that keeps unwrapping is malformed.
            for (var depth = 0; depth < 4; depth++)
            {
                JsonData parsed;
                try
                {
                    parsed = JsonMapper.ToObject(text);
                }
                catch (Exception)
                {
                    parsed = null!;
                }
                if (parsed == null)
                {
                    if (unwrappedLayer && text.Length > 0) messages.Add(text);
                    return messages;
                }
                // The full error record: its list is read like a bare one.
                if (parsed.IsObject &&
                    parsed.Keys.Contains("errors") &&
                    parsed["errors"] != null &&
                    parsed["errors"].IsArray)
                {
                    parsed = parsed["errors"];
                }
                if (parsed.IsArray)
                {
                    for (var i = 0; i < parsed.Count; i++)
                    {
                        var entry = parsed[i];
                        if (entry == null || !entry.IsObject) continue;
                        if (!entry.Keys.Contains("message")) continue;
                        if (entry["message"] == null || !entry["message"].IsString) continue;
                        messages.Add((string)entry["message"]);
                    }
                    if (messages.Count > 0) text = string.Join(", ", messages);
                    return messages;
                }
                if (parsed.IsObject &&
                    parsed.Keys.Contains("message") &&
                    parsed["message"] != null &&
                    parsed["message"].IsString)
                {
                    text = ((string)parsed["message"]).Trim();
                    unwrappedLayer = true;
                    continue;
                }
                return messages;
            }
            return messages;
        }
    }
}

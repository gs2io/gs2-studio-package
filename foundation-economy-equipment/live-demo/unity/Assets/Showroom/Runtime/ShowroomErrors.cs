// What a failure says on the page, which is never nothing and never raw JSON.
//
// `Gs2Exception.Errors` is the server's own account of what went wrong and is
// the right thing to show. Since io.gs2.csharp.sdk 2026.9.22 the SDK fills it
// on every path, including an action refused inside a transaction, whose
// result body (GS2's full error record,
// `{"errors": [{"component", "message", "code"}], "result", "stack", "metadata"}`)
// it parses and raises as the action's typed exception. Older SDKs left that
// body unparsed in `error.Message`, and `UnknownException("Ran transaction
// failed.")` still carries no list at all.
//
// So the list is used when the SDK filled one, a body is unwrapped the way the
// SDK unwraps it when it did not, and the exception's type names the failure
// when even that says nothing. `ShowroomRefusal` reads the same entries (by
// their code, never their message), so a refusal recognised by code and a
// refusal shown to the visitor come from one reading. An entry with a code and
// no message is shown by its code, never as the raw record.
#nullable enable

using System;
using System.Collections.Generic;
using System.Linq;

using Gs2.Core.Exception;
using Gs2.Core.Model;
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
        /// The kind of a failure and GS2's codes for it, and nothing else.
        ///
        /// For a request that carried a secret (a password): GS2's messages and
        /// an exception's text may echo what was sent, so a page or console
        /// line about such a request says only this. Anything that is not a
        /// `Gs2Exception` is named by its type alone.
        /// </summary>
        public static string Summary(Exception? error)
        {
            if (error == null) return "the action failed and said nothing about why";
            if (!(error is Gs2Exception gs2Error)) return error.GetType().Name;
            var codes = new List<string>();
            try
            {
                foreach (var detail in Details(gs2Error))
                {
                    if (detail.Code.Length > 0 && !codes.Contains(detail.Code)) codes.Add(detail.Code);
                }
            }
            catch (Exception)
            {
                // A body this cannot read names no code; the kind still stands.
            }
            return codes.Count == 0 ? error.GetType().Name : $"{error.GetType().Name} ({string.Join(", ", codes)})";
        }

        /// <summary>One entry of GS2's account of a refusal. Absent parts are "".</summary>
        internal readonly struct Detail
        {
            public Detail(string? component, string? message, string? code)
            {
                Component = component ?? "";
                Message = message ?? "";
                Code = code ?? "";
            }

            /// <summary>Where GS2 raised it: a field or model name such as `publicProfile`.</summary>
            public string Component { get; }

            /// <summary>GS2's dotted message: wording that may change, so shown but never matched.</summary>
            public string Message { get; }

            /// <summary>GS2's client error code (`limit.counter.overflow`), or "" when it gave none.</summary>
            public string Code { get; }

            /// <summary>What the page shows for it: the message, or the code when there is no message.</summary>
            public string Shown => Message.Length > 0 ? Message : Code;
        }

        /// <summary>
        /// Every entry GS2 gave for <paramref name="error"/>: the list the SDK
        /// parsed, and whatever the unparsed body holds. May repeat an entry.
        /// </summary>
        internal static List<Detail> Details(Gs2Exception error)
        {
            var details = new List<Detail>();
            foreach (var detail in Parsed(error)) details.Add(detail);
            try
            {
                details.AddRange(BodyDetails(error.Message, out _));
            }
            catch (Exception)
            {
                // A body this cannot read holds no entry to match.
            }
            return details;
        }

        /// <summary>The entries of the list the SDK parsed, without empty ones.</summary>
        private static IEnumerable<Detail> Parsed(Gs2Exception error) =>
            (error.Errors ?? Array.Empty<RequestError>())
                .Where(entry => entry != null)
                .Select(entry => new Detail(entry.Component, entry.Message, entry.Code))
                .Where(detail => detail.Shown.Length > 0);

        private static string DescribeRefusal(Gs2Exception error)
        {
            var reported = string.Join(", ", Parsed(error).Select(detail => detail.Shown));
            if (reported.Length > 0) return reported;
            var details = BodyDetails(error.Message, out var text);
            var unwrapped = details.Count > 0 ? string.Join(", ", details.Select(detail => detail.Shown)) : text;
            return unwrapped.Length > 0 ? $"{error.GetType().Name}: {unwrapped}" : error.GetType().Name;
        }

        /// <summary>
        /// The entries in an error body the SDK left unparsed, and the most
        /// readable text of it when it holds none.
        ///
        /// GS2 wraps its error list in <c>{"message": "&lt;the list, as a string&gt;"}</c>,
        /// and an action inside a transaction is reported by handing over an
        /// envelope rather than the list inside it: either that one, or the
        /// full error record, whose <c>errors</c> holds the list itself.
        /// Unwrapping is therefore a loop: an object with a string
        /// <c>message</c> is one layer, an object with an <c>errors</c> array
        /// is the record, and an array of them is the list itself. A layer's
        /// message that is not JSON is a message in its own right. An entry
        /// with a code and no message is shown by its code; one with neither
        /// is skipped. Anything else is handed back as
        /// <paramref name="text"/>, because a body this cannot read is still
        /// more than a blank line.
        /// </summary>
        private static List<Detail> BodyDetails(string? body, out string text)
        {
            var details = new List<Detail>();
            text = "";
            if (string.IsNullOrEmpty(body)) return details;
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
                    if (unwrappedLayer && text.Length > 0) details.Add(new Detail(null, text, null));
                    return details;
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
                        var detail = new Detail(StringOf(entry, "component"), StringOf(entry, "message"), StringOf(entry, "code"));
                        if (detail.Shown.Length > 0) details.Add(detail);
                    }
                    // An empty list says nothing, and the record around it is
                    // not for a visitor: the kind of failure stands alone.
                    text = string.Join(", ", details.Select(detail => detail.Shown));
                    return details;
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
                return details;
            }
            return details;
        }

        /// <summary>The string under <paramref name="key"/>, or null when there is none.</summary>
        private static string? StringOf(JsonData entry, string key)
        {
            if (!entry.Keys.Contains(key)) return null;
            var value = entry[key];
            return value != null && value.IsString ? (string)value : null;
        }
    }
}

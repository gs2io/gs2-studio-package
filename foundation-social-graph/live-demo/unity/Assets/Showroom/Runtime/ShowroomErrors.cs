// Share detail parsing for display and refusal matching; separate parsers could disagree.
#nullable enable

using System;
using System.Collections.Generic;
using System.Linq;

using Gs2.Core.Exception;
using Gs2.Core.Model;
using Gs2.Util.LitJson;

namespace GS2Studio.Showroom
{
    public static class ShowroomErrors
    {
        // Malformed error bodies must not turn failure reporting into another failure.
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

        // Requests may carry passwords; error messages can echo them, so expose only type and codes.
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
                // Retain the error type when malformed details provide no usable codes.
            }
            return codes.Count == 0 ? error.GetType().Name : $"{error.GetType().Name} ({string.Join(", ", codes)})";
        }

        internal readonly struct Detail
        {
            public Detail(string? component, string? message, string? code)
            {
                Component = component ?? "";
                Message = message ?? "";
                Code = code ?? "";
            }

            public string Component { get; }

            // Message wording can change; match refusals by code or component instead.
            public string Message { get; }

            public string Code { get; }

            public string Shown => Message.Length > 0 ? Message : Code;
        }

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
                // Malformed body text must not discard details already parsed by the SDK.
            }
            return details;
        }

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

        // Transaction errors may wrap their list in an errors record or a JSON string message.
        private static List<Detail> BodyDetails(string? body, out string text)
        {
            var details = new List<Detail>();
            text = "";
            if (string.IsNullOrEmpty(body)) return details;
            text = body!.Trim();
            var unwrappedLayer = false;
            // Bound malformed nested envelopes instead of unwrapping indefinitely.
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
                    // Do not expose the enclosing raw record when its error list says nothing.
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

        private static string? StringOf(JsonData entry, string key)
        {
            if (!entry.Keys.Contains(key)) return null;
            var value = entry[key];
            return value != null && value.IsString ? (string)value : null;
        }
    }
}

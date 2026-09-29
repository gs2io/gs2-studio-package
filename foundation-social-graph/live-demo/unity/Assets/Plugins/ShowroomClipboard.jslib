// The browser clipboard for the friend page: copy the visitor's id, paste
// another player's.
//
// The clipboard API is asynchronous and may ask the visitor for permission,
// so a call only starts the request; the page asks for the outcome each frame
// until it is settled. Status: 0 idle, 1 waiting, 2 done, 3 refused.
//
// Each request carries an id. The page may give up on one that takes too
// long and start another; a promise that settles after that belongs to a
// request nobody is waiting for, and is dropped.
var ShowroomClipboard = {
  $ShowroomClipboardState: { status: 0, text: "", request: 0 },

  // Starts a request and returns its id.
  $ShowroomClipboardBegin: function () {
    var state = ShowroomClipboardState;
    state.request += 1;
    state.status = 1;
    state.text = "";
    return state.request;
  },

  // Settles a request, unless a newer one has started since.
  $ShowroomClipboardSettle: function (request, status, text) {
    var state = ShowroomClipboardState;
    if (request !== state.request) return;
    state.status = status;
    state.text = text;
  },

  ShowroomClipboardCopy: function (textPointer) {
    var text = UTF8ToString(textPointer);
    var request = ShowroomClipboardBegin();
    if (!navigator.clipboard || !navigator.clipboard.writeText) {
      ShowroomClipboardSettle(request, 3, "this browser has no clipboard access");
      return;
    }
    navigator.clipboard.writeText(text).then(
      function () {
        ShowroomClipboardSettle(request, 2, "");
      },
      function (error) {
        ShowroomClipboardSettle(request, 3, String(error && error.message ? error.message : error));
      }
    );
  },

  ShowroomClipboardPaste: function () {
    var request = ShowroomClipboardBegin();
    if (!navigator.clipboard || !navigator.clipboard.readText) {
      ShowroomClipboardSettle(request, 3, "this browser does not let a page read the clipboard");
      return;
    }
    navigator.clipboard.readText().then(
      function (text) {
        ShowroomClipboardSettle(request, 2, text);
      },
      function (error) {
        ShowroomClipboardSettle(request, 3, String(error && error.message ? error.message : error));
      }
    );
  },

  ShowroomClipboardStatus: function () {
    return ShowroomClipboardState.status;
  },

  // Hands over the pasted text or the refusal, and settles the request.
  ShowroomClipboardTake: function () {
    var state = ShowroomClipboardState;
    var text = state.text;
    state.status = 0;
    state.text = "";
    return stringToNewUTF8(text);
  },

  // Gives up on the request in flight: whatever it settles to is dropped.
  ShowroomClipboardAbandon: function () {
    var state = ShowroomClipboardState;
    state.request += 1;
    state.status = 0;
    state.text = "";
  },
};

autoAddDeps(ShowroomClipboard, "$ShowroomClipboardState");
autoAddDeps(ShowroomClipboard, "$ShowroomClipboardBegin");
autoAddDeps(ShowroomClipboard, "$ShowroomClipboardSettle");
mergeInto(LibraryManager.library, ShowroomClipboard);

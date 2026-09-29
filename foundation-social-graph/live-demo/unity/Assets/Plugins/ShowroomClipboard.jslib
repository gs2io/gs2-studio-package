// The browser clipboard for the friend page: copy the visitor's id, paste
// another player's.
//
// The clipboard API is asynchronous and may ask the visitor for permission,
// so a call only starts the request; the page asks for the outcome each frame
// until it is settled. Status: 0 idle, 1 waiting, 2 done, 3 refused.
var ShowroomClipboard = {
  $ShowroomClipboardState: { status: 0, text: "" },

  ShowroomClipboardCopy: function (textPointer) {
    var text = UTF8ToString(textPointer);
    var state = ShowroomClipboardState;
    state.status = 1;
    state.text = "";
    if (!navigator.clipboard || !navigator.clipboard.writeText) {
      state.status = 3;
      state.text = "this browser has no clipboard access";
      return;
    }
    navigator.clipboard.writeText(text).then(
      function () {
        state.status = 2;
      },
      function (error) {
        state.status = 3;
        state.text = String(error && error.message ? error.message : error);
      }
    );
  },

  ShowroomClipboardPaste: function () {
    var state = ShowroomClipboardState;
    state.status = 1;
    state.text = "";
    if (!navigator.clipboard || !navigator.clipboard.readText) {
      state.status = 3;
      state.text = "this browser does not let a page read the clipboard";
      return;
    }
    navigator.clipboard.readText().then(
      function (text) {
        state.status = 2;
        state.text = text;
      },
      function (error) {
        state.status = 3;
        state.text = String(error && error.message ? error.message : error);
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
};

autoAddDeps(ShowroomClipboard, "$ShowroomClipboardState");
mergeInto(LibraryManager.library, ShowroomClipboard);

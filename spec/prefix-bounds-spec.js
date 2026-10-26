describe("snapshot snippet prefix bounds", () => {
  let editor, snippets;
  beforeEach(() => {
    editor = lumine.workspace.buildTextEditor();
    snippets = require("../lib/snippets");
  });
  afterEach(() => editor.destroy());

  it("rejects a long containing word without a legacy word scan or full range read", () => {
    editor.setText("x".repeat(1024 * 1024) + "while");
    editor.setCursorBufferPosition(editor.getEofBufferPosition());
    const scan = spyOn(
      editor.getLastCursor(),
      "getBeginningOfCurrentWordBufferPosition",
    ).and.throwError("unbounded word scan");
    const read = spyOn(editor, "getTextInRange").and.throwError("unbounded prefix read");
    expect(snippets.getPrefixText({ while: {} }, editor)).toBeNull();
    expect(scan).not.toHaveBeenCalled();
    expect(read).not.toHaveBeenCalled();
  });

  it("finds a complete suffix after a long unrelated prefix and preserves custom long keys", () => {
    editor.setText("x".repeat(1024 * 1024) + ".while");
    editor.setCursorBufferPosition(editor.getEofBufferPosition());
    expect(snippets.getPrefixText({ while: {} }, editor)).toEqual({
      snippetPrefix: "while",
      wordPrefix: "while",
    });
    const key = "custom".repeat(2000);
    editor.setText(key);
    editor.setCursorBufferPosition(editor.getEofBufferPosition());
    expect(snippets.getPrefixText({ [key]: {} }, editor)).toEqual({
      snippetPrefix: key,
      wordPrefix: key,
    });
  });

  it("keeps multiline cursor agreement and UTF-16 prefix boundaries", () => {
    editor.setText("😀.while\n😀.while");
    editor.setCursorBufferPosition([0, 8]);
    editor.addCursorAtBufferPosition([1, 8]);
    expect(snippets.getPrefixText({ while: {} }, editor)).toEqual({
      snippetPrefix: "while",
      wordPrefix: "while",
    });
    editor.getLastCursor().setBufferPosition([1, 7]);
    expect(snippets.getPrefixText({ while: {} }, editor)).toBeNull();
  });
});

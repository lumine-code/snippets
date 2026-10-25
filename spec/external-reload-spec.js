const { Readable } = require("stream");
const { Disposable, TextBuffer } = require("lumine");

describe("Active snippets across external reloads", () => {
  // Processing fixtures use a real grammar; None deliberately disables this package.
  beforeEach(async () => {
    await lumine.packages.activatePackage("language-text");
  });

  let editor, main, source, detachedEditors;

  async function activateSnippets() {
    const pack = lumine.packages.loadPackage("snippets");
    pack.requireMainModule();
    const mainModule = pack.mainModule;
    spyOn(mainModule, "loadAll");
    spyOn(mainModule, "getUserSnippetsPath").and.returnValue("");
    spyOn(mainModule, "watchUserSnippets").and.callFake((callback) => callback(new Disposable()));
    await lumine.packages.activatePackage("snippets");
    return lumine.packages.getActivePackage("snippets").mainModule;
  }

  beforeEach(async () => {
    await lumine.packages.deactivatePackage("snippets");
    main = await activateSnippets();
    detachedEditors = [];
    source = {
      text: "abc ABC",
      getPath: () => null,
      existsSync: () => true,
      createReadStream() {
        return Readable.from([this.text]);
      },
      onDidChange() {
        return { dispose() {} };
      },
    };
    const buffer = await TextBuffer.load(source);
    editor = lumine.workspace.buildTextEditor({ buffer });
    lumine.workspace.getActivePane().addItem(editor);
    editor.selectAll();
    await main.provideSnippets().insertSnippet("${1:abc} ${1/(.*)/${1:/upcase}/}$0", editor, null, {
      adjustIndentation: false,
    });
    expect(editor.getText()).toBe(source.text);
    expect(editor.getFileState()).toBe("unmodified");
    expect(main.getExpansions(editor).length).toBe(1);
  });

  afterEach(async () => {
    for (const detached of detachedEditors) detached.destroy();
    editor?.destroy();
    await lumine.packages.deactivatePackage("snippets");
    editor = main = source = null;
  });

  it("ends transforms before reloaded text moves their markers", async () => {
    source.text = "abcd ABC";
    await editor.getBuffer().load({ internal: true });

    expect(editor.getText()).toBe(source.text);
    expect(editor.getFileState()).toBe("unmodified");
    expect(main.getExpansions(editor).length).toBe(0);
    expect(main.findOrCreateMarkerLayer(editor).getMarkers().length).toBe(0);
  });

  it("keeps the expansion when an unchanged source is read again", async () => {
    await editor.getBuffer().load({ internal: true });

    expect(main.getExpansions(editor).length).toBe(1);
    editor.insertText("def");
    expect(editor.getText()).toBe("def DEF");
  });

  it("keeps ordinary placeholder edits and tab stops working", () => {
    editor.insertText("def");

    expect(editor.getText()).toBe("def DEF");
    expect(main.getExpansions(editor).length).toBe(1);
    expect(main.goToNextTabStop(editor)).toBe(true);
    expect(editor.getCursorBufferPosition().isEqual([0, 7])).toBe(true);
  });

  it("ends old expansion hooks and restores history before another generation uses the editor", async () => {
    const snippet = main.getExpansions(editor)[0].snippet;
    main.clearExpansions(editor);
    const historyProvider = editor.getBuffer().historyProvider;
    editor.selectAll();
    main.expandSnippet(editor, snippet);
    const oldExpansion = main.getExpansions(editor)[0];
    const oldLayer = main.findOrCreateMarkerLayer(editor);
    const oldDestroy = spyOn(oldExpansion, "destroy").and.callThrough();
    expect(editor.getBuffer().historyProvider).not.toBe(historyProvider);

    await lumine.packages.deactivatePackage("snippets");

    expect(oldDestroy).toHaveBeenCalledTimes(1);
    expect(oldExpansion.subscriptions.disposed).toBe(true);
    expect(oldLayer.getMarkers().length).toBe(0);
    expect(editor.getBuffer().historyProvider).toBe(historyProvider);
    oldDestroy.calls.reset();
    main = await activateSnippets();
    editor.selectAll();
    await main.provideSnippets().insertSnippet("${1:abc} ${1/(.*)/${1:/upcase}/}$0", editor, null, {
      adjustIndentation: false,
    });

    source.text = "abcd ABC";
    await editor.getBuffer().load({ internal: true });

    expect(oldDestroy).not.toHaveBeenCalled();
    expect(editor.getText()).toBe(source.text);
    expect(main.getExpansions(editor).length).toBe(0);
    expect(main.findOrCreateMarkerLayer(editor).getMarkers().length).toBe(0);
  });

  it("cleans detached editor expansions and forgets completed expansions while active", async () => {
    const detached = lumine.workspace.buildTextEditor();
    detachedEditors.push(detached);
    await main
      .provideSnippets()
      .insertSnippet("${1:abc} ${1/(.*)/${1:/upcase}/}$0", detached, null, {
        adjustIndentation: false,
      });
    const expansion = main.getExpansions(detached)[0];
    const layer = main.findOrCreateMarkerLayer(detached);
    expect(main.activeSnippetExpansions.size).toBe(2);

    main.clearExpansions(detached);

    expect(expansion.subscriptions.disposed).toBe(true);
    expect(main.activeSnippetExpansions.size).toBe(1);
    detached.selectAll();
    await main.provideSnippets().insertSnippet("${1:abc} $0", detached, null, {
      adjustIndentation: false,
    });
    const activeExpansion = main.getExpansions(detached)[0];

    await lumine.packages.deactivatePackage("snippets");

    expect(activeExpansion.subscriptions.disposed).toBe(true);
    expect(layer.getMarkers().length).toBe(0);
    expect(main.getExpansions(detached).length).toBe(0);
    expect(main.activeSnippetExpansions).toBeNull();
    detached.insertText("def");
    expect(detached.getText()).toBe("def ");
  });

  for (const method of ["insert", "expandSnippet", "expandSnippetsUnderCursors"]) {
    it(`abandons a delayed clipboard ${method} after deactivation and reactivation`, async () => {
      const snippet = main.getExpansions(editor)[0].snippet;
      main.clearExpansions(editor);
      const historyProvider = editor.getBuffer().historyProvider;
      const text = editor.getText();
      let resolveClipboard;
      spyOn(main, "clipboardTextForSnippet").and.returnValue(
        new Promise((resolve) => {
          resolveClipboard = resolve;
        }),
      );
      let pending;
      if (method === "insert") {
        pending = main.insert("${1:changed} $CLIPBOARD", editor);
      } else if (method === "expandSnippet") {
        pending = main.expandSnippet(editor, snippet);
      } else {
        spyOn(main, "snippetToExpandUnderCursor").and.returnValue(snippet);
        pending = main.expandSnippetsUnderCursors(editor);
      }

      await lumine.packages.deactivatePackage("snippets");
      main = await activateSnippets();
      resolveClipboard("clipboard");
      await pending;

      expect(editor.getText()).toBe(text);
      expect(editor.getBuffer().historyProvider).toBe(historyProvider);
      expect(main.getExpansions(editor).length).toBe(0);
      expect(main.activeSnippetExpansions.size).toBe(0);
    });
  }
});

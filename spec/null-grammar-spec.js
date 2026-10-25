const path = require("node:path");

describe("snippets with no grammar", () => {
  let editor, main;
  beforeEach(async () => {
    await lumine.packages.activatePackage("language-text");
    jasmine.attachToDOM(lumine.workspace.getElement());
    main = (await lumine.packages.activatePackage(path.join(__dirname, ".."))).mainModule;
    editor = await lumine.workspace.open();
    await main.waitForSnippetsLoaded();
  });
  afterEach(() => editor?.destroy());

  it("declines expansion and suggestions, retires tab stops and resumes for a grammar", async () => {
    const grammar = lumine.grammars.grammarForScopeName("text.plain");
    editor.setGrammar(grammar);
    await main.insert("${1:word} $0", editor);
    expect(main.getExpansions(editor).length).toBeGreaterThan(0);
    editor.setGrammar(lumine.grammars.nullGrammar);
    expect(main.getExpansions(editor)).toEqual([]);
    const text = editor.getText();
    expect(main.prepareSnippet("${1:word}", editor)).toBeNull();
    const provider = main.provideAutocomplete();
    spyOn(main, "waitForSnippetsLoaded").and.callThrough();
    expect(
      await provider.getSuggestions({
        editor,
        prefix: "x",
        scopeDescriptor: editor.getRootScopeDescriptor(),
      }),
    ).toEqual([]);
    expect(main.waitForSnippetsLoaded).not.toHaveBeenCalled();
    expect(editor.getText()).toBe(text);
    editor.setGrammar(grammar);
    await main.insert("${1:again} $0", editor);
    expect(main.getExpansions(editor).length).toBeGreaterThan(0);
  });

  it("lets Tab fall through to ordinary indentation while None is selected", async () => {
    editor.setGrammar(lumine.grammars.nullGrammar);
    editor.setText("");
    editor.setSoftTabs(true);
    editor.setTabLength(2);
    spyOn(main, "getStore").and.callThrough();
    const event = lumine.keymaps.constructor.buildKeydownEvent("tab", {
      target: editor.getElement(),
    });
    lumine.keymaps.handleKeyboardEvent(event);
    await flushMicrotasks();
    expect(editor.getText()).toBe("  ");
    expect(main.getStore).not.toHaveBeenCalled();
    expect(main.getExpansions(editor)).toEqual([]);
  });
});

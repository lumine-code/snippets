describe("available snippets in editor windows", () => {
  // Processing fixtures use a real grammar; None deliberately disables this package.
  beforeEach(async () => {
    await lumine.packages.activatePackage("language-text");
  });

  beforeEach(async () => {
    jasmine.useRealClock();
    jasmine.attachToDOM(lumine.workspace.getElement());
    await lumine.packages.activatePackage("snippets");
  });
  afterEach(async () => {
    await lumine.packages.deactivatePackage("snippets");
    await lumine.workspace.discardEditorWindows();
  });
  it("offers insertion only in a writable non-mini editor", async () => {
    const editor = await lumine.workspace.open();
    const command = "snippets:available";
    expect(lumine.commands.canDispatch(lumine.workspace.getElement(), command)).toBe(false);
    expect(lumine.commands.canDispatch(editor.element, command)).toBe(true);
    editor.setReadOnly(true);
    expect(lumine.commands.canDispatch(editor.element, command)).toBe(false);
    const mini = lumine.workspace.buildTextEditor({ mini: true });
    try {
      expect(lumine.commands.canDispatch(mini.element, command)).toBe(false);
    } finally {
      mini.destroy();
    }
  });
  it("inserts into the captured local editor while another snippets list remains open", async () => {
    const workspace = lumine.workspace;
    const first = await workspace.open();
    const extra = await workspace.openEditorWindow({ show: false });
    const second = workspace.buildTextEditor();
    extra.getEditorContainer().getActivePane().activateItem(second, { activatePane: true });
    const main = lumine.packages.getActivePackage("snippets").mainModule;
    const item = { id: "native-snippet", prefix: "example", name: "Example", bodyText: "inserted" };
    spyOn(main, "getSnippets").and.returnValue({ example: item });
    const insert = spyOn(main, "insert").and.callThrough();
    await lumine.commands.dispatch(first.getElement(), "snippets:available");
    await lumine.commands.dispatch(second.getElement(), "snippets:available");
    const local = main.availableSnippetViews.get(workspace.getMainWindow()).view;
    const remote = main.availableSnippetViews.get(extra).view;
    expect(local.selectListHost.isVisible()).toBe(true);
    expect(remote.element.ownerDocument).toBe(extra.getDocument());
    await local.selectList.setQuery("local");
    await remote.selectList.selectItem(item);
    await remote.selectList.runAction("snippets:insert-selected-snippet");
    expect(insert.calls.mostRecent().args[1]).toBe(second);
    expect(second.getText()).toBe("inserted");
    expect(first.getText()).toBe("");
    expect(local.selectList.getQuery()).toBe("local");
  });
});

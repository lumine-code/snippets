describe("Snippet command availability", () => {
  let main, editor;
  beforeEach(async () => {
    jasmine.attachToDOM(lumine.workspace.getElement());
    main = (await lumine.packages.activatePackage("snippets")).mainModule;
    editor = await lumine.workspace.open();
    main.add(
      "review-availability",
      {
        ".text.plain": { Plain: { prefix: "plain", body: "plain", command: "in-plain" } },
        ".source.js": { JavaScript: { prefix: "js", body: "js", command: "in-js" } },
      },
      "review",
    );
  });
  afterEach(async () => {
    editor.destroy();
    await lumine.packages.deactivatePackage("snippets");
  });
  it("uses loaded raw scope metadata without loading or parsing snippets", () => {
    spyOn(main, "ensureStores").and.callThrough();
    spyOn(main, "getParsedSnippet").and.callThrough();
    expect(lumine.commands.canDispatch(editor.element, "review:in-plain")).toBe(true);
    expect(lumine.commands.canDispatch(editor.element, "review:in-js")).toBe(false);
    expect(main.ensureStores).not.toHaveBeenCalled();
    expect(main.getParsedSnippet).not.toHaveBeenCalled();
  });
  it("does not advertise expansion or named insertion in readonly editors", () => {
    editor.setReadOnly(true);
    expect(lumine.commands.canDispatch(editor.element, "snippets:expand")).toBe(false);
    expect(
      lumine.keymaps.findKeyBindings({ target: editor.element, command: "snippets:expand" }),
    ).toEqual([]);
    expect(lumine.commands.canDispatch(editor.element, "review:in-plain")).toBe(false);
    expect(lumine.commands.canDispatch(editor.element, "snippets:next-tab-stop")).toBe(true);
  });
  it("keeps a captured editor unchanged when it becomes readonly in the snippets list", async () => {
    const List = require("../lib/snippets-available");
    const list = new List(main);
    try {
      await list.toggle(editor);
      editor.setReadOnly(true);
      expect((await list.selectList.confirmSelection()).status).toBe("disabled");
      expect(list.selectListHost.isVisible()).toBe(true);
      expect(editor.getText()).toBe("");
    } finally {
      list.destroy();
    }
  });
  it("dismisses its own list when the captured editor is destroyed", async () => {
    const List = require("../lib/snippets-available");
    const list = new List(main);
    try {
      await list.toggle(editor);
      editor.destroy();
      expect(list.selectListHost.isVisible()).toBe(false);
    } finally {
      list.destroy();
    }
  });
});

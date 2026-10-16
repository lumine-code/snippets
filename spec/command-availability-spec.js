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
  it("builds a large named-command catalogue without enumerating each effective snippet set", () => {
    const count = 300;
    const declarations = Object.fromEntries(
      Array.from({ length: count }, (_, index) => [
        `Named ${index}`,
        { prefix: `named-${index}`, body: `value ${index}`, command: `named-${index}` },
      ]),
    );
    main.add("review-large-catalogue", { ".text.plain": declarations }, "review-large");
    const store = main.selectorStore;
    const getValue = store.getPropertyValue;
    const proxies = new WeakMap();
    let enumerations = 0;
    spyOn(store, "getPropertyValue").and.callFake(function (...args) {
      const raw = getValue.apply(this, args);
      if (!raw || args[1] !== "snippets") return raw;
      if (!proxies.has(raw))
        proxies.set(
          raw,
          new Proxy(raw, {
            ownKeys(target) {
              enumerations++;
              return Reflect.ownKeys(target);
            },
          }),
        );
      return proxies.get(raw);
    });
    const scope = main.getScopeChain(editor.getLastCursor().getScopeDescriptor());
    store.getPropertyValue(scope, "snippets");
    const parseScope = spyOn(store, "parseScopeChain").and.callThrough();
    const commands = lumine.commands
      .getCommandPresentations({ target: editor.element })
      .filter(({ name }) => name.startsWith("review-large:"));
    expect(commands.length).toBe(count);
    expect(commands.every(({ enabled }) => enabled)).toBeTrue();
    expect(enumerations).toBe(0);
    expect(parseScope).not.toHaveBeenCalled();
  });
  it("checks prefixless command identity and follows scope overrides and source removal", () => {
    main.add(
      "review-prefixless",
      {
        ".text.plain": { Named: { command: "prefixless", body: "text" } },
      },
      "review",
    );
    expect(lumine.commands.canDispatch(editor.element, "review:prefixless")).toBeTrue();
    expect(lumine.commands.canDispatch(editor.element, "review:in-plain")).toBeTrue();
    main.add(
      "review-override",
      {
        ".text.plain": { Disabled: { prefix: "plain", body: null } },
      },
      "review",
    );
    expect(lumine.commands.canDispatch(editor.element, "review:in-plain")).toBeFalse();
    main.clearSnippetsForPath("review-override");
    expect(lumine.commands.canDispatch(editor.element, "review:in-plain")).toBeTrue();
    main.clearSnippetsForPath("review-prefixless");
    expect(lumine.commands.canDispatch(editor.element, "review:prefixless")).toBeFalse();
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

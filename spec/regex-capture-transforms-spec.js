describe("Snippet regex capture transforms", () => {
  let main, service, editor;

  beforeEach(async () => {
    for (const method of ["openExternal", "openPath", "showItemInFolder", "openApplication"])
      spyOn(lumine.shell, method).and.returnValue(Promise.resolve());
    spyOn(lumine.application, "openWindow").and.returnValue(Promise.resolve());
    spyOn(lumine.clipboard, "read").and.returnValue(Promise.resolve(""));
    main = (await lumine.packages.activatePackage("snippets")).mainModule;
    await main.waitForSnippetsLoaded();
    service = main.provideSnippets();
    editor = await lumine.workspace.open();
  });

  afterEach(async () => {
    editor?.destroy();
    if (lumine.packages.isPackageActive("snippets"))
      await lumine.packages.deactivatePackage("snippets");
    if (lumine.packages.isPackageLoaded("snippets"))
      await lumine.packages.unloadPackage("snippets");
    await lumine.fileWatchClient.settlePendingTeardown();
    main = service = editor = null;
  });

  it("uses regex capture zero as the entire matched text", async () => {
    await service.insertSnippet("${1:hello}-${1/(.*)/$0/}", editor);
    expect(editor.getText()).toBe("hello-hello");
  });

  for (const transform of ["camelcase", "pascalcase", "snakecase", "kebabcase"]) {
    it(`treats an unmatched capture as empty for ${transform}`, async () => {
      await service.insertSnippet(`\${1:foo}-\${1/foo|(bar)/\${1:/${transform}}/}`, editor);
      expect(editor.getText()).toBe("foo-");
    });
  }

  it("preserves an ordinary matched capture", async () => {
    await service.insertSnippet("${1:hello world}-${1/(.*)/$1/}", editor);
    expect(editor.getText()).toBe("hello world-hello world");
  });
});

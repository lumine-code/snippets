const { Disposable } = require("lumine");

describe("Snippet transform boundaries in a current editor", () => {
  let editor, main, service;
  beforeEach(async () => {
    await lumine.packages.deactivatePackage("snippets");
    const pack = lumine.packages.loadPackage("snippets");
    pack.requireMainModule();
    main = pack.mainModule;
    spyOn(main, "loadAll");
    spyOn(main, "getUserSnippetsPath").and.returnValue("");
    spyOn(main, "watchUserSnippets").and.callFake((callback) => callback(new Disposable()));
    await lumine.packages.activatePackage("snippets");
    main = lumine.packages.getActivePackage("snippets").mainModule;
    service = main.provideSnippets();
    editor = await lumine.workspace.open();
  });
  afterEach(async () => {
    editor?.destroy();
    await lumine.packages.deactivatePackage("snippets");
  });
  it("applies supported snakecase and kebabcase capture transforms", async () => {
    await service.insertSnippet(
      "${1:foo bar} | ${1/(.*)/${1:/snakecase}/} | ${1/(.*)/${1:/kebabcase}/}",
      editor,
    );
    expect(editor.getText()).toBe("foo bar | foo_bar | foo-bar");
  });
  it("treats an unmatched capture as empty inside a case region", async () => {
    await service.insertSnippet("${1:b} | ${1/(a)?(b)/\\U$1$2\\E-end/}", editor);
    expect(editor.getText()).toBe("b | B-end");
  });
  it("keeps uppercase-next pending across an unmatched empty capture", async () => {
    await service.insertSnippet("${1:b} | ${1/(a)?(b)/\\u$1$2/}", editor);
    expect(editor.getText()).toBe("b | B");
  });
  it("keeps lowercase-next pending across an unmatched empty capture", async () => {
    await service.insertSnippet("${1:B} | ${1/(a)?(B)/\\l$1$2/}", editor);
    expect(editor.getText()).toBe("B | b");
  });
  it("keeps the alternate one-arm conditional replacement literal", async () => {
    await service.insertSnippet("${1:a} | ${1/(a)/(?1:yes)/}", editor);
    expect(editor.getText()).toBe("a | yes");
  });
  it("applies the same supported case transforms to an actual editor variable", async () => {
    editor.setText("foo bar");
    editor.selectAll();
    await service.insertSnippet(
      "${TM_SELECTED_TEXT:/snakecase} | ${TM_SELECTED_TEXT:/kebabcase}",
      editor,
    );
    expect(editor.getText()).toBe("foo_bar | foo-bar");
  });
  it("preserves two-arm conditions and a literal fallback for an absent capture", async () => {
    await service.insertSnippet("${1:b} | ${1/(a)?(b)/(?1:yes:no)-(?1:yes)-$2/}", editor);
    expect(editor.getText()).toBe("b | no--b");
  });
});

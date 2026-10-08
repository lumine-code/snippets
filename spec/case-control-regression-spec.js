const { Disposable } = require("lumine");

describe("Snippet one-character case controls", () => {
  let editor, service, main;

  beforeEach(async () => {
    await lumine.packages.deactivatePackage("snippets");
    const snippets = require("../lib/snippets");
    spyOn(snippets, "loadAll");
    spyOn(snippets, "getUserSnippetsPath").and.returnValue("");
    spyOn(snippets, "watchUserSnippets").and.callFake((callback) => callback(new Disposable()));
    await lumine.packages.activatePackage("snippets");
    main = lumine.packages.getActivePackage("snippets").mainModule;
    service = main.provideSnippets();
    editor = await lumine.workspace.open();
  });

  afterEach(async () => {
    editor?.destroy();
    await lumine.packages.deactivatePackage("snippets");
  });

  it("lowers only the first capture character and leaves the next capture and literal untouched", async () => {
    await service.insertSnippet("${1:FOOBAR} | ${1/(...)(...)/\\l$1$2-END/}", editor);
    expect(editor.getText()).toBe("FOOBAR | fOOBAR-END");
  });

  it("consumes lowercase-next on a literal before later captures", async () => {
    await service.insertSnippet("${1:FOOBAR} | ${1/(...)(...)/\\lPREFIX$1$2/}", editor);
    expect(editor.getText()).toBe("FOOBAR | pREFIXFOOBAR");
  });

  it("keeps the matching one-shot uppercase control", async () => {
    await service.insertSnippet("${1:foobar} | ${1/(...)(...)/\\u$1$2-end/}", editor);
    expect(editor.getText()).toBe("foobar | Foobar-end");
  });

  it("applies lowercase-next independently to each global match", async () => {
    await service.insertSnippet("${1:FOOBARBAZQUX} | ${1/(...)(...)/\\l$1$2-Tail/g}", editor);
    expect(editor.getText()).toBe("FOOBARBAZQUX | fOOBAR-TailbAZQUX-Tail");
  });

  it("preserves full-case regions and the end escape", async () => {
    await service.insertSnippet(
      "${1:FooBar} | ${1/(...)(...)/\\L$1$2\\E-END/} | ${1/(...)(...)/\\U$1$2\\E-end/}",
      editor,
    );
    expect(editor.getText()).toBe("FooBar | foobar-END | FOOBAR-end");
  });

  it("keeps transformed mirrors in the same edit history entry", async () => {
    main.add(
      "case-control-spec",
      {
        ".text.plain": {
          "Case control": {
            prefix: "caseone",
            body: "${1:FOOBAR} | ${1/(...)(...)/\\l$1$2-END/} | $1",
          },
        },
      },
      "case-control-spec",
    );
    editor.setText("caseone");
    editor.setCursorBufferPosition([0, 7]);
    await lumine.commands.dispatch(editor.getElement(), "snippets:expand");
    expect(editor.getCursors().length).toBe(2);
    editor.insertText("BAZQUX");
    expect(editor.getText()).toBe("BAZQUX | bAZQUX-END | BAZQUX");
    editor.insertText("END");
    expect(editor.getText()).toBe("BAZQUXEND | bAZQUX-ENDEND | BAZQUXEND");
    editor.undo();
    expect(editor.getText()).toBe("BAZQUX | bAZQUX-END | BAZQUX");
    editor.redo();
    expect(editor.getText()).toBe("BAZQUXEND | bAZQUX-ENDEND | BAZQUXEND");
  });

  it("uses the same one-shot control for parsed variable replacements", async () => {
    spyOn(lumine.clipboard, "read").and.returnValue("FOOBAR");
    await service.insertSnippet("${CLIPBOARD/(...)(...)/\\l$1$2-END/}", editor);
    expect(editor.getText()).toBe("fOOBAR-END");
  });
});

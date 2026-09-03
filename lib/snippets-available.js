const _ = require("@lumine-code/underscore-plus");
const { CompositeDisposable } = require("lumine");

module.exports = class SnippetsAvailable {
  constructor(snippets) {
    this.snippets = snippets;
    this.disposables = new CompositeDisposable();
    this.selectListHost = lumine.workspace.addSelectList(
      {
        items: [],
        getItemId: (snippet) => snippet.id,
        search: { getFilterText: (snippet) => snippet.searchText },
        renderItem: (snippet) => ({
          primary: snippet.prefix,
          secondary: snippet.name,
        }),
        commands: {
          "snippets:insert-selected-snippet": {
            description: "Insert the selected snippet at every cursor.",
            didDispatch: (event) => this.insertSnippet(event.detail.item),
          },
          "snippets:close-empty-list": {
            description: "Close the list when no snippet matches.",
            didDispatch: () => {
              this.editor = null;
            },
          },
        },
        actions: [
          {
            command: "snippets:insert-selected-snippet",
            context: "item",
            primary: true,
            disposition: "close",
          },
          {
            command: "snippets:close-empty-list",
            context: "dialog",
            when: ({ item }) => item == null,
            primary: true,
            disposition: "close",
          },
        ],
      },
      { item: this, className: "available-snippets", crumb: "Snippets" },
    );
    this.selectList = this.selectListHost.getModel();
    this.disposables.add(
      this.selectListHost.onDidCancel(() => {
        this.editor = null;
      }),
    );
    this.element = this.selectList.getElement();
  }

  async toggle(editor) {
    this.editor = editor;
    if (this.selectListHost.isVisible()) {
      this.cancel();
    } else {
      await this.populate();
      this.selectListHost.show();
    }
  }

  cancel() {
    this.selectListHost.cancel();
  }

  destroy() {
    this.disposables.dispose();
    return this.selectListHost.destroy();
  }

  insertSnippet(snippet) {
    for (const cursor of this.editor.getCursors()) {
      this.snippets.insert(snippet.bodyText, this.editor, cursor);
    }
    this.editor = null;
  }

  populate() {
    const snippets = Object.values(this.snippets.getSnippets(this.editor));
    for (let snippet of snippets) {
      snippet.searchText = _.compact([snippet.prefix, snippet.name]).join(" ");
    }
    return this.selectList.setItems(snippets);
  }
};

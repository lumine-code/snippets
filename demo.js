// Authentic package usage. Run with lumine/script/demo.js; fixtures stay in demo/.
module.exports = {
  version: 1,
  dependencies: ["language-javascript"],
  viewport: { width: 1100, height: 720 },
  async before() {},
  async prepare(context) {
    const { state, open } = context;
    state.editor = await open("signal.js");
  },
  scenes: [
    {
      id: "scene-1",
      file: "demo.png",
      caption: "Browse snippets for the current language.",
      timeout: 60000,
      async run(context) {
        const { lumine, state, waitFor } = context;
        {
          await lumine.commands.dispatch(lumine.views.getView(state.editor), "snippets:available");
          await waitFor(
            () =>
              lumine.packages
                .getActivePackage("snippets")
                .mainModule.availableSnippetsView?.selectListHost.isVisible(),
            "action picker",
          );
          const view =
            lumine.packages.getActivePackage("snippets").mainModule.availableSnippetsView;
          await view.selectList.setQuery("for");
          view.selectList.getQueryEditor().getElement().focus();
        }
      },
      ready(context) {
        const { lumine } = context;
        const view = lumine.packages.getActivePackage("snippets").mainModule.availableSnippetsView;
        return (
          view?.selectListHost.isVisible() &&
          view.element.getBoundingClientRect().height > 0 &&
          view.element.textContent.includes("for")
        );
      },
    },
  ],
  async cleanup() {},
};

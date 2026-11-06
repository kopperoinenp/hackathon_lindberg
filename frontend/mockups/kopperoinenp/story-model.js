/* Presentation choices only; calculations remain in the shared fixture model. */
(function (root) {
  "use strict";
  function defaultPriority(customer) {
    return (
      { "Food & Beverage": "water", Manufacturing: "efficiency", Healthcare: "circularity" }[
        customer.industry
      ] || "water"
    );
  }
  function storyContext(data, selection) {
    return root.WorkspaceModel.buildContext(data, selection);
  }
  root.StoryModel = { defaultPriority, storyContext };
})(globalThis);

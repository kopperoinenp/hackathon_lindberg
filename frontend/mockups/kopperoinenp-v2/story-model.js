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
    const customer = data.customers.find((row) => row.customer_id === selection.customer);
    const baseline = data.baselines.find((row) => row.baseline_id === selection.baseline);
    const metrics = root.ReviewModel.aggregate(data, selection.customer, selection.site);
    const sites = root.ReviewModel.rankedSites(data, selection.customer);
    const focus =
      selection.site === "all" ? sites[0] : sites.find((row) => row.site_id === selection.site);
    const compare = root.ReviewModel.comparison(metrics, baseline);
    const priority = selection.priority || defaultPriority(customer);
    const order =
      priority === "emissions"
        ? ["emissions", "water", "repairs"]
        : priority === "circularity" || priority === "efficiency"
          ? ["repairs", "water", "emissions"]
          : ["water", "repairs", "emissions"];
    return { customer, baseline, metrics, compare, sites, focus, priority, order };
  }
  root.StoryModel = { defaultPriority, storyContext };
})(globalThis);

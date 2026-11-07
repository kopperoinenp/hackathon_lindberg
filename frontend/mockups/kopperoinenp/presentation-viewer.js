(function () {
  "use strict";
  const language = new URLSearchParams(location.search).get("lang") === "fi" ? "fi" : "en";
  const t = globalThis.ReviewLanguage.translator(language);
  globalThis.ReviewLanguage.page()(language);
  const $ = (query) => document.querySelector(query);
  let deck,
    index = 0;
  function render() {
    const item = deck.slides[index];
    $("#slide-stage").innerHTML = globalThis.SlideRender.html(item, deck.footer, t);
    $("#page-number").textContent = `${index + 1} / ${deck.slides.length}`;
    $("#previous").disabled = index === 0;
    $("#next").disabled = index === deck.slides.length - 1;
  }
  function move(delta) {
    if (!deck) return;
    index = Math.max(0, Math.min(deck.slides.length - 1, index + delta));
    render();
  }
  function fail(message) {
    $("#loading").textContent = message;
  }
  $("#previous").addEventListener("click", () => move(-1));
  $("#next").addEventListener("click", () => move(1));
  document.addEventListener("keydown", (event) => {
    if (["ArrowLeft", "ArrowRight"].includes(event.key)) {
      event.preventDefault();
      move(event.key === "ArrowRight" ? 1 : -1);
    }
  });
  window.addEventListener("message", (event) => {
    if (event.origin === location.origin && event.data?.type === "presentation-error")
      fail(event.data.message);
  });
  const query = new URLSearchParams(location.search);
  if (query.get("error")) {
    fail(query.get("error"));
    return;
  }
  const id = query.get("id");
  if (!id) return;
  if (!/^[a-f0-9-]{36}$/.test(id)) {
    fail(t("Reopen the presentation from the customer review."));
    return;
  }
  (async () => {
    try {
      const response = await fetch(`/api/presentations/${id}?lang=${language}`);
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || t("Reopen the presentation from the customer review."));
      deck = result;
      document.title = t`${deck.customer.name} · Customer presentation`;
      $("#customer-name").textContent = deck.customer.name;
      $("#save-presentation").href = deck.downloadUrl;
      $("#save-presentation").hidden = false;
      $("#loading").hidden = true;
      $("#slide-stage").hidden = false;
      $("#slide-navigation").hidden = false;
      render();
    } catch (error) {
      fail(error.message);
    }
  })();
})();

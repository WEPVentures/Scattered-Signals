document.addEventListener("DOMContentLoaded", function () {
  var pills = document.querySelectorAll(".filter-pill");
  var rows = document.querySelectorAll(".signal-index > li");
  var emptyState = document.querySelector(".empty-state");

  function applyFilter(category) {
    var visibleCount = 0;
    var lastVisibleRow = null;

    rows.forEach(function (row) {
      var show;
      if (category === "all") {
        show = true;
      } else if (category === "top") {
        show = row.getAttribute("data-top") === "true";
      } else {
        show = row.getAttribute("data-category") === category;
      }
      row.hidden = !show;
      row.classList.remove("is-last-visible");
      if (show) {
        visibleCount++;
        lastVisibleRow = row;
      }
    });

    // The last visible row shouldn't carry a trailing divider line under it
    // — without this, whichever row happens to be last in the DOM keeps
    // its border even when a filter hides it and a different row becomes
    // the one the reader actually sees last.
    if (lastVisibleRow) lastVisibleRow.classList.add("is-last-visible");

    if (emptyState) {
      emptyState.hidden = visibleCount > 0;
    }
  }

  pills.forEach(function (pill) {
    pill.addEventListener("click", function () {
      var category = pill.getAttribute("data-category");

      pills.forEach(function (p) {
        var isActive = p === pill;
        p.classList.toggle("active", isActive);
        p.setAttribute("aria-selected", isActive ? "true" : "false");
      });

      applyFilter(category);
    });
  });

  applyFilter("all");
});

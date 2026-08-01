document.addEventListener("DOMContentLoaded", function () {
  var pills = document.querySelectorAll(".filter-pill");
  var rows = document.querySelectorAll(".signal-index > li");
  var emptyState = document.querySelector(".empty-state");

  pills.forEach(function (pill) {
    pill.addEventListener("click", function () {
      var category = pill.getAttribute("data-category");

      pills.forEach(function (p) {
        var isActive = p === pill;
        p.classList.toggle("active", isActive);
        p.setAttribute("aria-selected", isActive ? "true" : "false");
      });

      var visibleCount = 0;
      rows.forEach(function (row) {
        var show = category === "all" || row.getAttribute("data-category") === category;
        row.hidden = !show;
        if (show) visibleCount++;
      });

      if (emptyState) {
        emptyState.hidden = visibleCount > 0;
      }
    });
  });
});

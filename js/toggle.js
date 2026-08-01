document.addEventListener("DOMContentLoaded", function () {
  var buttons = document.querySelectorAll(".segmented-btn[data-state]");

  buttons.forEach(function (button) {
    button.addEventListener("click", function () {
      var state = button.getAttribute("data-state");

      document.querySelectorAll(".segmented-btn[data-state]").forEach(function (b) {
        b.classList.toggle("active", b.getAttribute("data-state") === state);
      });

      document.querySelectorAll(".toggle-panel[data-state]").forEach(function (panel) {
        panel.classList.toggle("active", panel.getAttribute("data-state") === state);
      });
    });
  });
});

/**
 * Concept B — step progression (prototype only).
 */

const steps = Array.from(document.querySelectorAll(".jn-step"));
const labels = Array.from(document.querySelectorAll(".jn-flow-labels span"));
let current = 0;

function render() {
  steps.forEach((step, i) => {
    step.classList.toggle("is-current", i === current);
    step.classList.toggle("is-done", i < current);
  });
  labels.forEach((label, i) => {
    label.classList.toggle("is-active", i <= current);
  });
}

document.querySelector("[data-jn-next]")?.addEventListener("click", () => {
  if (current < steps.length - 1) {
    current += 1;
    render();
    steps[current]?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }
});

document.querySelector("[data-jn-prev]")?.addEventListener("click", () => {
  if (current > 0) {
    current -= 1;
    render();
  }
});

render();

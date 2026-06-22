/**
 * FORGENIQ Logo Lab — placement controls only.
 */
(function () {
  const root = document.documentElement;
  const width = document.getElementById("bllWidth");
  const navH = document.getElementById("bllNavH");
  const padL = document.getElementById("bllPadL");
  const padT = document.getElementById("bllPadT");
  const targets = document.querySelectorAll(".bll-logo-target:not(.bll-logo-target--symbol)");
  const symbolTargets = document.querySelectorAll(".bll-logo-target--symbol");

  function px(n) {
    return `${n}px`;
  }

  function apply() {
    const w = Number(width.value);
    const nh = Number(navH.value);
    const pl = Number(padL.value);
    const pt = Number(padT.value);

    root.style.setProperty("--bll-logo-w", px(w));
    root.style.setProperty("--bll-nav-h", px(nh));
    root.style.setProperty("--bll-pad-l", px(pl));
    root.style.setProperty("--bll-pad-t", px(pt));

    document.getElementById("bllValWidth").textContent = px(w);
    document.getElementById("bllValNavH").textContent = px(nh);
    document.getElementById("bllValPadL").textContent = px(pl);
    document.getElementById("bllValPadT").textContent = px(pt);

    document.getElementById("bllInfoW").textContent = px(w);
    const h = Math.round(w * (512 / 1024));
    document.getElementById("bllInfoH").textContent = px(h);
    document.getElementById("bllInfoNavH").textContent = px(nh);
    document.getElementById("bllInfoPadL").textContent = px(pl);
    document.getElementById("bllInfoPadT").textContent = px(pt);

    symbolTargets.forEach((img) => {
      img.style.width = px(Math.round(w * 0.34));
    });
  }

  [width, navH, padL, padT].forEach((el) => {
    el?.addEventListener("input", apply);
  });

  apply();

  if (targets.length) {
    const probe = targets[0];
    const ro = new ResizeObserver(() => {
      const rect = probe.getBoundingClientRect();
      if (rect.width > 0) {
        document.getElementById("bllInfoW").textContent = `${Math.round(rect.width)}px`;
        document.getElementById("bllInfoH").textContent = `${Math.round(rect.height)}px`;
      }
    });
    ro.observe(probe);
  }
})();

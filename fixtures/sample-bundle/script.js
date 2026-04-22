// Demonstrates the ClaudeTube player-bridge contract.
// Bundles that opt in can publish cd:ready / cd:play / cd:pause / cd:seek
// and receive cd:video:timeupdate from the parent.
(function () {
  var clock = document.getElementById("clock");
  var start = performance.now();
  var playing = true;

  function format(t) {
    var m = Math.floor(t / 60);
    var s = Math.floor(t % 60);
    return String(m).padStart(2, "0") + ":" + String(s).padStart(2, "0");
  }

  function tick(now) {
    if (!playing) {
      requestAnimationFrame(tick);
      return;
    }
    clock.textContent = format((now - start) / 1000);
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);

  // Tell the parent we're ready.
  if (window.parent && window.parent !== window) {
    window.parent.postMessage({ type: "cd:ready" }, "*");
  }

  // React to parent video clock.
  window.addEventListener("message", function (ev) {
    var m = ev.data;
    if (!m || typeof m !== "object") return;
    if (m.type === "cd:video:timeupdate" && typeof m.t === "number") {
      // Re-anchor our clock to follow the video.
      start = performance.now() - m.t * 1000;
    } else if (m.type === "cd:video:pause") {
      playing = false;
    } else if (m.type === "cd:video:play") {
      playing = true;
    }
  });
})();

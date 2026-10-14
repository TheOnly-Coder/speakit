// Speakit landing page — tiny enhancements, no dependencies.
(function () {
  // Mobile nav
  var burger = document.getElementById("burger");
  var links = document.getElementById("navLinks");
  if (burger && links) {
    burger.addEventListener("click", function () {
      links.classList.toggle("open");
    });
    links.addEventListener("click", function (e) {
      if (e.target.tagName === "A") links.classList.remove("open");
    });
  }

  // Footer year
  var year = document.getElementById("year");
  if (year) year.textContent = "© " + new Date().getFullYear();

  // Copy sample invite code
  var copy = document.getElementById("copyInvite");
  var sample = document.getElementById("inviteSample");
  if (copy && sample) {
    copy.addEventListener("click", function () {
      var done = function () {
        copy.textContent = "Copied!";
        setTimeout(function () { copy.textContent = "Copy sample"; }, 2000);
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(sample.textContent.trim()).then(done, done);
      } else {
        done();
      }
    });
  }

  // TODO: point these at your live app, e.g. https://your-server:PORT
  // document.getElementById("openAppTop").href = "https://YOUR-APP-URL";
  // document.getElementById("openAppHero").href = "https://YOUR-APP-URL";
})();

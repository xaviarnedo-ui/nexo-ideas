/* NEXO Ideas — pantalla de contraseña.
   Puerta de interfaz, no cifrado real (ver nota de seguridad en la spec):
   compara el hash SHA-256 de lo escrito contra PASSWORD_HASH de abajo. */
(function () {
  "use strict";
  var PASSWORD_HASH = "c5ffba48378c429918ef653cf955a55a145d46092804482a9e2a3bb42215dc2e";
  var STORAGE_KEY = "nexo-ideas-unlocked";

  function sha256Hex(text) {
    var enc = new TextEncoder().encode(text);
    return crypto.subtle.digest("SHA-256", enc).then(function (buf) {
      return Array.prototype.map.call(new Uint8Array(buf), function (b) {
        return b.toString(16).padStart(2, "0");
      }).join("");
    });
  }

  function unlock() {
    document.getElementById("gate").hidden = true;
    document.getElementById("app").hidden = false;
    document.dispatchEvent(new CustomEvent("nexo:unlocked"));
  }

  if (localStorage.getItem(STORAGE_KEY) === "1") {
    unlock();
    return;
  }

  document.getElementById("gate-form").addEventListener("submit", function (e) {
    e.preventDefault();
    var input = document.getElementById("gate-input");
    sha256Hex(input.value).then(function (hash) {
      if (hash === PASSWORD_HASH) {
        localStorage.setItem(STORAGE_KEY, "1");
        unlock();
      } else {
        document.getElementById("gate-error").hidden = false;
        input.value = "";
      }
    });
  });
})();

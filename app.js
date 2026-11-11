// Вишлист: данные лежат в wishes.json, страница их только показывает.
(function () {
  "use strict";

  // Цифры почтового индекса: 9 отрезков в прямоугольнике 10×20.
  var SEG = {
    t: [1, 1, 9, 1], m: [1, 10, 9, 10], b: [1, 19, 9, 19],
    ul: [1, 1, 1, 10], ll: [1, 10, 1, 19], ur: [9, 1, 9, 10], lr: [9, 10, 9, 19],
    du: [9, 1, 1, 10], dl: [9, 10, 1, 19]
  };
  var DIGITS = {
    0: ["t", "ul", "ur", "ll", "lr", "b"],
    1: ["du", "ur", "lr"],
    2: ["t", "ur", "dl", "b"],
    3: ["t", "du", "m", "lr", "b"],
    4: ["ul", "m", "ur", "lr"],
    5: ["t", "ul", "m", "lr", "b"],
    6: ["du", "ll", "b", "lr", "m"],
    7: ["t", "du", "ll"],
    8: ["t", "ul", "ur", "m", "ll", "lr", "b"],
    9: ["t", "ul", "ur", "m", "dl"]
  };
  var NS = "http://www.w3.org/2000/svg";

  function line(cls, s, i) {
    var l = document.createElementNS(NS, "line");
    l.setAttribute("x1", s[0]); l.setAttribute("y1", s[1]);
    l.setAttribute("x2", s[2]); l.setAttribute("y2", s[3]);
    l.setAttribute("class", cls);
    if (i !== undefined) l.style.setProperty("--i", i);
    return l;
  }

  // withTemplate — показать бледную «сетку» всех отрезков, как на конверте.
  function postalDigit(d, withTemplate, startIndex) {
    var svg = document.createElementNS(NS, "svg");
    svg.setAttribute("viewBox", "0 0 10 20");
    svg.setAttribute("class", "pd");
    if (withTemplate) Object.keys(SEG).forEach(function (k) { svg.appendChild(line("tpl", SEG[k])); });
    (DIGITS[d] || []).forEach(function (k, n) {
      svg.appendChild(line("on", SEG[k], startIndex === undefined ? undefined : startIndex + n));
    });
    return svg;
  }

  function plural(n, one, few, many) {
    var m10 = n % 10, m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return one;
    if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
    return many;
  }

  function renderIndex(count) {
    var box = document.getElementById("index-digits");
    var text = String(Math.min(count, 99));
    if (text.length < 2) text = "0" + text;
    box.textContent = "";
    var i = 0;
    text.split("").forEach(function (ch) {
      box.appendChild(postalDigit(+ch, true, i));
      i += DIGITS[ch].length;
    });
    document.getElementById("index-caption").textContent =
      plural(count, "желание", "желания", "желаний") + " в списке";
  }

  function renderPrice(el, price, currency) {
    var digits = String(Math.round(price));
    el.textContent = "";
    for (var i = 0; i < digits.length; i++) {
      var fromEnd = digits.length - i;
      if (i > 0 && fromEnd % 3 === 0) {
        var gap = document.createElement("span");
        gap.className = "gap";
        el.appendChild(gap);
      }
      el.appendChild(postalDigit(+digits[i], false));
    }
    var cur = document.createElement("span");
    cur.className = "cur";
    cur.textContent = currency;
    el.appendChild(cur);
  }

  function safeUrl(u) {
    if (typeof u !== "string" || !u.trim()) return null;
    try {
      var url = new URL(u, location.href);
      return /^https?:$/.test(url.protocol) ? url.href : null;
    } catch (e) { return null; }
  }

  var STATUS = { reserved: "Уже дарят", gifted: "Подарено" };
  var wishes = [];
  var currency = "₽";

  function sorted(mode) {
    var rank = function (w) { return w.status === "gifted" ? 2 : (w.status === "reserved" ? 1 : 0); };
    var price = function (w) { return typeof w.price === "number" ? w.price : Infinity; };
    return wishes.slice().sort(function (a, b) {
      var r = rank(a) - rank(b);
      if (r) return r;
      if (mode === "cheap") return price(a) - price(b);
      if (mode === "expensive") return price(b) - price(a);
      return (b.priority || 2) - (a.priority || 2) || a._order - b._order;
    });
  }

  function render(mode) {
    var list = document.getElementById("list");
    var tpl = document.getElementById("wish-tpl");
    list.textContent = "";
    document.getElementById("empty").hidden = wishes.length > 0;

    sorted(mode).forEach(function (w) {
      var node = tpl.content.firstElementChild.cloneNode(true);
      node.querySelector(".wish__title").textContent = w.title || "Без названия";
      node.querySelector(".wish__note").textContent = w.note || "";

      var img = safeUrl(w.image);
      if (img) {
        var im = node.querySelector("img");
        im.src = img;
        im.alt = w.title || "";
      } else {
        node.classList.add("wish--noimg");
      }

      var link = safeUrl(w.link);
      var a = node.querySelector(".wish__link");
      if (link) {
        a.href = link;
        try { a.textContent = "Где купить: " + new URL(link).hostname.replace(/^www\./, ""); } catch (e) { }
      } else {
        a.remove();
      }

      var priceBox = node.querySelector(".wish__price");
      if (typeof w.price === "number" && w.price > 0) {
        renderPrice(node.querySelector(".wish__digits"), w.price, w.currency || currency);
        var t = node.querySelector(".wish__price-text");
        t.className = "visually-hidden";
        t.textContent = "Цена: " + w.price.toLocaleString("ru-RU") + " " + (w.currency || currency);
      } else {
        priceBox.remove();
      }

      var stamp = node.querySelector(".wish__stamp");
      if (STATUS[w.status]) {
        node.classList.add("wish--" + w.status);
        stamp.textContent = STATUS[w.status];
        stamp.hidden = false;
      } else if (w.priority === 3) {
        node.classList.add("wish--top");
        stamp.textContent = "Очень хочу";
        stamp.hidden = false;
      }
      list.appendChild(node);
    });
  }

  function setupSort() {
    var buttons = document.querySelectorAll(".sort__btn");
    Array.prototype.forEach.call(buttons, function (btn) {
      btn.addEventListener("click", function () {
        Array.prototype.forEach.call(buttons, function (b) { b.setAttribute("aria-pressed", String(b === btn)); });
        render(btn.dataset.sort);
      });
    });
  }

  document.getElementById("postmark-year").textContent = new Date().getFullYear();
  setupSort();

  fetch("wishes.json", { cache: "no-cache" })
    .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(function (data) {
      if (data && data.currency) currency = data.currency;
      wishes = ((data && data.wishes) || []).map(function (w, i) { w._order = i; return w; });
    })
    .catch(function () { wishes = []; })
    .then(function () {
      var active = wishes.filter(function (w) { return w.status !== "gifted"; }).length;
      renderIndex(active);
      render("priority");
    });
})();

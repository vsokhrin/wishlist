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


  // Поисковые ссылки, которые добавляются сами по полю "search".
  var SEARCH = {
    market: { where: "на Яндекс Маркете", url: "https://market.yandex.ru/search?text=" },
    ozon:   { where: "на Ozon",           url: "https://www.ozon.ru/search/?text=" },
    avito:  { where: "на Авито",          url: "https://www.avito.ru/rossiya?q=" },
    ali:    { where: "на AliExpress",     url: "https://aliexpress.ru/wholesale?SearchText=" }
  };
  var DEFAULT_SEARCH = ["market", "ozon", "avito"];
  var OTHER = "Другое";

  var STATUS = { reserved: "Уже дарят", gifted: "Подарено" };
  var wishes = [];
  var categories = [];
  var currency = "₽";
  var state = { sort: "priority", cat: "all" };

  function money(n, cur) {
    return Math.round(n).toLocaleString("ru-RU") + " " + (cur || currency);
  }

  function hostOf(u) {
    try { return new URL(u).hostname.replace(/^www\./, ""); } catch (e) { return u; }
  }

  function categoryOf(w) { return w.category || OTHER; }

  function sorted(list) {
    var rank = function (w) { return w.status === "gifted" ? 2 : (w.status === "reserved" ? 1 : 0); };
    var price = function (w) { return typeof w.price === "number" ? w.price : Infinity; };
    var mode = state.sort;
    return list.slice().sort(function (a, b) {
      var r = rank(a) - rank(b);
      if (r) return r;
      if (mode === "cheap") return price(a) - price(b) || a._order - b._order;
      if (mode === "expensive") return price(b) - price(a) || a._order - b._order;
      return (b.priority || 1) - (a.priority || 1) || a._order - b._order;
    });
  }

  // Ссылки магазинов: сначала конкретные товары, потом поиск.
  function shopsOf(w) {
    var out = [];
    var links = Array.isArray(w.links) ? w.links.slice() : [];
    if (w.link) links.unshift({ url: w.link }); // старый формат: одна ссылка
    links.forEach(function (l) {
      var u = safeUrl(l && l.url);
      if (!u) return;
      out.push({ url: u, label: l.shop || hostOf(u), price: l.price, note: l.note, search: false });
    });
    if (typeof w.search === "string" && w.search.trim()) {
      (Array.isArray(w.searchIn) ? w.searchIn : DEFAULT_SEARCH).forEach(function (k) {
        var s = SEARCH[k];
        if (!s) return;
        out.push({ url: s.url + encodeURIComponent(w.search.trim()), label: "Искать " + s.where, search: true });
      });
    }
    return out;
  }

  function renderShops(ul, w) {
    shopsOf(w).forEach(function (s) {
      var li = document.createElement("li");
      var a = document.createElement("a");
      a.className = "shop" + (s.search ? " shop--search" : "");
      a.href = s.url;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.textContent = s.label;
      li.appendChild(a);
      if (typeof s.price === "number" && s.price > 0) {
        var p = document.createElement("span");
        p.className = "shop__price";
        p.textContent = money(s.price, w.currency);
        li.appendChild(p);
      }
      if (s.note) {
        var n = document.createElement("span");
        n.className = "shop__note";
        n.textContent = s.note;
        li.appendChild(n);
      }
      ul.appendChild(li);
    });
    if (!ul.children.length) ul.remove();
  }

  function wishNode(w) {
    var tpl = document.getElementById("wish-tpl");
    var node = tpl.content.firstElementChild.cloneNode(true);
    node.querySelector(".wish__title").textContent = w.title || "Без названия";
    node.querySelector(".wish__note").textContent = w.note || "";
    if (w.gone) node.querySelector(".wish__gone").hidden = false;

    var img = safeUrl(w.image);
    var im = node.querySelector("img");
    if (img) {
      im.addEventListener("error", function () { node.classList.add("wish--noimg"); });
      im.src = img;
      im.alt = w.title || "";
    } else {
      node.classList.add("wish--noimg");
    }

    renderShops(node.querySelector(".shops"), w);

    var priceBox = node.querySelector(".wish__price");
    if (typeof w.price === "number" && w.price > 0) {
      renderPrice(node.querySelector(".wish__digits"), w.price, w.currency || currency);
      var t = node.querySelector(".wish__price-text");
      t.className = "visually-hidden";
      t.textContent = "Цена от " + money(w.price, w.currency);
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
    return node;
  }

  function render() {
    var box = document.getElementById("groups");
    box.textContent = "";
    document.getElementById("empty").hidden = wishes.length > 0;

    var show = state.cat === "all" ? categories : [state.cat];
    show.forEach(function (cat) {
      var items = sorted(wishes.filter(function (w) { return categoryOf(w) === cat; }));
      if (!items.length) return;

      var sec = document.createElement("section");
      sec.className = "group";
      var h = document.createElement("h3");
      h.className = "group__title";
      h.textContent = cat;
      var n = document.createElement("span");
      n.className = "group__count";
      n.textContent = items.length;
      h.appendChild(n);
      sec.appendChild(h);

      var ol = document.createElement("ol");
      ol.className = "list";
      items.forEach(function (w) { ol.appendChild(wishNode(w)); });
      sec.appendChild(ol);
      box.appendChild(sec);
    });
  }

  function pressOnly(buttons, active) {
    Array.prototype.forEach.call(buttons, function (b) { b.setAttribute("aria-pressed", String(b === active)); });
  }

  function setupCats() {
    var box = document.getElementById("cats");
    box.textContent = "";
    if (categories.length < 2) { box.hidden = true; return; }

    var counts = {};
    wishes.forEach(function (w) { var c = categoryOf(w); counts[c] = (counts[c] || 0) + 1; });

    [{ id: "all", name: "Все", n: wishes.length }].concat(categories.map(function (c) {
      return { id: c, name: c, n: counts[c] || 0 };
    })).forEach(function (c) {
      if (!c.n) return;
      var b = document.createElement("button");
      b.type = "button";
      b.className = "cat";
      b.dataset.cat = c.id;
      b.setAttribute("aria-pressed", String(c.id === state.cat));
      b.textContent = c.name;
      var n = document.createElement("span");
      n.className = "cat__n";
      n.textContent = c.n;
      b.appendChild(n);
      b.addEventListener("click", function () {
        state.cat = c.id;
        pressOnly(box.querySelectorAll(".cat"), b);
        render();
      });
      box.appendChild(b);
    });
    box.hidden = false;
  }

  function setupSort() {
    var buttons = document.querySelectorAll(".sort__btn");
    Array.prototype.forEach.call(buttons, function (btn) {
      btn.addEventListener("click", function () {
        pressOnly(buttons, btn);
        state.sort = btn.dataset.sort;
        render();
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
      categories = Array.isArray(data && data.categories) ? data.categories.slice() : [];
    })
    .catch(function () { wishes = []; })
    .then(function () {
      // Категории, которых нет в общем списке, идут в конец в порядке появления.
      wishes.forEach(function (w) {
        var c = categoryOf(w);
        if (categories.indexOf(c) < 0) categories.push(c);
      });
      var active = wishes.filter(function (w) { return w.status !== "gifted"; }).length;
      renderIndex(active);
      setupCats();
      render();
    });
})();

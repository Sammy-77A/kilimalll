/**
 * Kilimall Frontend UI Bridge (Phase 9)
 * Connects static HTML pages to the Express REST API (/api/*)
 * - Region locking: Kenya (KES) fixed
 * - HTTP-only cookie auth integration
 * - CMS & Catalog data binding
 * - Search Bar submission & search results rendering
 * - Cart & Checkout state management
 *
 * FIX: DOM inspection confirmed real structure:
 *   #pc__search-input > .van-cell > .van-field__value > .van-field__body > input.van-field__control
 *   #pc__search-input > .van-cell > .van-field__value > div.search-button  (sibling of van-field__body)
 * Using capture-phase listeners + MutationObserver for Vue hydration delay.
 */

(function () {
  'use strict';

  function enforceKenyaRegion() {
    document.querySelectorAll('.region-select, .country-selector, .site-region').forEach(function (el) {
      el.textContent = 'Kenya (KES)';
    });
    var modal = document.querySelector('.region-modal-container, #region-modal');
    if (modal) modal.style.display = 'none';
  }

  function fetchUserProfile() {
    fetch('/api/auth/me', { credentials: 'same-origin' })
      .then(function (res) { if (res.ok) return res.json(); })
      .then(function (data) {
        if (data && data.user) { updateUserHeader(data.user); fetchUserCart(); }
      })
      .catch(function (err) { console.warn('Auth check skipped:', err); });
  }

  function updateUserHeader(user) {
    if (!user) return;
    document.querySelectorAll('.user-name, .account-title, .user-info-name').forEach(function (n) {
      n.textContent = user.name || user.email.split('@')[0];
    });
  }

  function fetchUserCart() {
    fetch('/api/cart', { credentials: 'same-origin' })
      .then(function (res) { if (res.ok) return res.json(); })
      .then(function (data) {
        if (!data) return;
        var count = data.item_count || 0;
        document.querySelectorAll('.cart-count, .cart-num, #cart-badge').forEach(function (b) { b.textContent = count; });
      })
      .catch(function (err) { console.warn('Cart update skipped:', err); });
  }

  function triggerSearch(query) {
    var q = (query || '').trim();
    if (q) window.location.href = '/search.010616.html?q=' + encodeURIComponent(q);
  }

  function getSearchInput() {
    return document.querySelector('#pc__search-input input') ||
           document.querySelector('#pc__search-input .van-field__control') ||
           document.querySelector('.van-field__control') ||
           document.querySelector('input[placeholder*="looking"]');
  }

  var _searchBound = false;

  function bindSearchBar() {
    if (_searchBound) return;

    var btn = document.querySelector('#pc__search-input .search-button') ||
              document.querySelector('.search-input-box .search-button') ||
              document.querySelector('.search-bar .search-button') ||
              document.querySelector('.search-button');

    var input = getSearchInput();

    if (!btn && !input) return; // Vue not hydrated yet

    if (btn) {
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        var q = getSearchInput();
        triggerSearch(q ? q.value : '');
      }, true); // capture phase
    }

    if (input) {
      input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
          e.preventDefault();
          e.stopPropagation();
          triggerSearch(input.value);
        }
      }, true);
    }

    _searchBound = true;
    console.log('[kilimall-ui] Search bound', { btn: btn, input: input });
  }

  function watchForSearchBar() {
    bindSearchBar();
    if (_searchBound) return;

    var observer = new MutationObserver(function () {
      if (!_searchBound) bindSearchBar();
      if (_searchBound) observer.disconnect();
    });
    observer.observe(document.body, { childList: true, subtree: true });

    setTimeout(function () {
      observer.disconnect();
      if (_searchBound) return;
      console.warn('[kilimall-ui] Falling back to document-level capture.');

      document.addEventListener('click', function (e) {
        var t = e.target;
        var btn = t.closest ? t.closest('.search-button') : (t.classList && t.classList.contains('search-button') ? t : null);
        if (btn) {
          e.preventDefault(); e.stopPropagation();
          var inp = getSearchInput();
          triggerSearch(inp ? inp.value : '');
        }
      }, true);

      document.addEventListener('keydown', function (e) {
        if (e.key !== 'Enter') return;
        var t = e.target;
        var ok = t && ((t.classList && t.classList.contains('van-field__control')) ||
                       (t.placeholder && t.placeholder.indexOf('looking') !== -1));
        if (ok) { e.preventDefault(); triggerSearch(t.value); }
      }, true);
    }, 10000);
  }

  function loadSearchPageResults() {
    if (window.location.pathname.indexOf('/search') === -1) return;
    var params = new URLSearchParams(window.location.search);
    var query = params.get('q');

    if (query) {
      document.querySelectorAll('#pc__search-input input, .van-field__control, input[placeholder*="looking"]').forEach(function (i) {
        i.value = query;
      });
    }

    var loader = document.querySelector('.router-jump-animation');
    if (loader) loader.style.display = 'none';
    if (!query) return;

    var bc = document.querySelector('.last-b-name, .breadcrumb-current');
    if (bc) bc.textContent = query;

    fetch('/api/search?q=' + encodeURIComponent(query))
      .then(function (res) { if (res.ok) return res.json(); })
      .then(function (data) {
        // API returns { products: [...], pagination: {...} }
        var products = (data && data.products) ? data.products : (Array.isArray(data) ? data : []);
        renderSearchResults(products, query);
      })
      .catch(function (err) { console.warn('Search fetch error:', err); });
  }

  function renderSearchResults(products, query) {
    // The search page already has a styled .listings grid — populate it directly.
    var listingsGrid = document.querySelector('.listings');
    if (!listingsGrid) {
      // Fallback: create our own container inside result-listings-wrapper
      var wrapper = document.querySelector('.result-listings-wrapper, .result-wrapper, .wap-div');
      if (!wrapper) return;
      listingsGrid = document.createElement('div');
      listingsGrid.className = 'listings';
      listingsGrid.style.cssText = 'display:flex;flex-wrap:wrap;';
      wrapper.insertBefore(listingsGrid, wrapper.firstChild);
    }

    // The page's own flex rule for .listings is scoped to a different component, so apply the layout here:
    // cards keep the page's width:20% and flow five per row.
    listingsGrid.style.display = 'flex';
    listingsGrid.style.flexWrap = 'wrap';
    listingsGrid.style.alignItems = 'flex-start';

    // Reuse one of the page's own saved product cards as the prototype, so the page's scoped
    // (data-v-*) card styles apply and results look native. Captured before the grid is cleared.
    var proto = listingsGrid.querySelector('.listing-item');
    proto = proto ? proto.cloneNode(true) : null;
    var protoUsable = !!(proto && proto.querySelector('a') && proto.querySelector('.product-image img') &&
      proto.querySelector('.product-title') && proto.querySelector('.product-price'));

    if (!products || !products.length) {
      listingsGrid.innerHTML = '<div class="no-data" style="padding:40px;text-align:center;width:100%;font-size:16px;color:#666;">No products found for "<strong>' + esc(query) + '</strong>".</div>';
      return;
    }

    if (protoUsable) {
      listingsGrid.innerHTML = '';
      products.forEach(function (p) {
        var card = proto.cloneNode(true);
        card.querySelector('a').setAttribute('href', '/product/' + p.id);
        var img = card.querySelector('.product-image img');
        img.setAttribute('src', p.main_image_url || p.thumbnail || p.image_url || '/images/loading_default.33a46.png');
        img.setAttribute('alt', p.name || '');
        img.setAttribute('lazy', 'loaded');
        card.querySelector('.product-title').textContent = p.name || '';
        card.querySelector('.product-price').textContent = 'KSh ' + Number(p.price || 0).toLocaleString('en-US');
        // The saved card's static star rating and "Brand Official" / "Fulfilled" badges are not facts about this product.
        qsa('.rate, .mark-box', card).forEach(removeNode);
        listingsGrid.appendChild(card);
      });
      return;
    }

    // Fallback (no saved card to copy): build cards matching the page's native structure.
    listingsGrid.innerHTML = products.map(function (p) {
      var title = esc(p.name || p.title || '');
      var price = 'KSh ' + Number(p.price || p.min_price || 0).toLocaleString();
      var img = p.main_image_url || p.thumbnail || p.image_url || '/images/loading_default.33a46.png';
      var href = '/product/' + p.id;
      return (
        '<div class="listing-item">' +
          '<div class="inner-listing">' +
            '<div class="product-item">' +
              '<a href="' + href + '" target="_blank">' +
                '<div class="product-image">' +
                  '<img src="' + img + '" alt="' + title + '" style="width:100%;height:180px;object-fit:contain;">' +
                '</div>' +
                '<div class="info-box">' +
                  '<p class="product-title">' + title + '</p>' +
                  '<div class="product-price" style="text-align:left;">' + price + '</div>' +
                '</div>' +
              '</a>' +
            '</div>' +
          '</div>' +
        '</div>'
      );
    }).join('');
  }

  function esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function loadHomepageCMS() {
    if (window.location.pathname !== '/' && window.location.pathname.indexOf('index.html') === -1) return;
    fetch('/api/search-keywords/hot')
      .then(function (res) { if (res.ok) return res.json(); })
      .then(function (data) {
        // API returns { keywords: [...] }
        var kws = (data && data.keywords) ? data.keywords : (Array.isArray(data) ? data : []);
        if (!kws.length) return;
        var c = document.querySelector('.hot-words, .search-keywords, .hot-keys');
        if (c) c.innerHTML = kws.map(function (k) {
          return '<a href="/search.010616.html?q=' + encodeURIComponent(k.keyword) + '" style="margin-right:12px;color:#666;font-size:13px;">' + esc(k.keyword) + '</a>';
        }).join('');
      })
      .catch(function () {});
  }

  // ── Product detail page (/product/<id>) ──────────────────────────────────────
  // The server sends a saved listing page as a template plus window.__KM_PRODUCT__.
  // The original app cannot run here, so this fills the existing markup (no new UI) and
  // supplies the few interactions the page needs: thumbnails, variant buttons, quantity.
  function qs(sel, root) { return (root || document).querySelector(sel); }
  function qsa(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function setText(sel, value) { var el = qs(sel); if (el) el.textContent = value; }
  function removeNode(n) { if (n && n.parentNode) n.parentNode.removeChild(n); }
  function ksh(n) { return 'KSh ' + Number(n).toLocaleString('en-US'); }

  var productState = { slide: 0, images: [], selected: {}, showSlide: function () {} };

  function fillBreadcrumbs(data) {
    var wrap = qs('.breadcrumbs');
    if (!wrap) return;
    var items = qsa('.breadcrumbs-item', wrap);
    if (items.length < 3) return;
    var proto = items[1].cloneNode(true);
    var last = items[items.length - 1];
    items.slice(1, -1).forEach(removeNode);
    (data.breadcrumbs || []).concat([data.product.name]).forEach(function (name) {
      var node = proto.cloneNode(true);
      var label = qs('.name', node);
      if (label) label.textContent = name;
      wrap.insertBefore(node, last);
    });
    var lastName = qs('.name', last);
    // Imported listings have slug kl-<original listing id>; show that id like the original page did.
    var listingId = /^kl-(\d+)$/.exec(data.product.slug || '');
    if (lastName) lastName.textContent = 'SKU ID: ' + (listingId ? listingId[1] : data.product.sku);
  }

  function fillRating(p) {
    var score = Number(p.rating_score) || 0;
    setText('.score-and-reviews .rate', score.toFixed(1));
    setText('.score-and-reviews .reviews', p.review_count + ' Customer review' + (p.review_count === 1 ? '' : 's'));
    qsa('.score-and-reviews .van-rate__icon').forEach(function (star, i) {
      if (i < Math.round(score)) return;
      star.className = star.className.replace('van-icon-star', 'van-icon-star-o').replace('van-rate__icon--full', 'van-rate__icon--void');
      star.style.color = '#c8c9cc';
    });
    var storeScore = qs('.store-info-list .info-val');
    if (storeScore) storeScore.textContent = score.toFixed(1);
  }

  function fillPrice(p) {
    setText('.sale-price', ksh(p.price));
    var del = qs('.del-price');
    var rate = qs('.discount-rate');
    if (p.original_price && p.original_price > p.price) {
      if (del) { del.textContent = ksh(p.original_price); del.style.display = ''; }
      if (rate) {
        var pct = qs('span', rate);
        if (pct) pct.textContent = Math.round((1 - p.price / p.original_price) * 100) + '% off';
        rate.style.display = '';
      }
    } else {
      if (del) del.style.display = 'none';
      if (rate) rate.style.display = 'none';
    }
    // The template's "Limited Offer" banner belongs to a flash sale; flash prices are not applied at checkout yet.
    var banner = qs('.activate-card .countdown-header');
    if (banner) banner.style.display = 'none';
  }

  function fillGallery(p) {
    var images = (p.images && p.images.length) ? p.images : (p.main_image_url ? [p.main_image_url] : []);
    var swipe = qs('.van-swipe');
    var track = qs('.van-swipe__track');
    var thumbs = qs('.thumbnails');
    var slides = qsa('.van-swipe-item', track);
    var thumbItems = qsa('.img-item', thumbs);
    if (!swipe || !track || !thumbs || !slides.length || !thumbItems.length || !images.length) return;

    var slideProto = slides[0].cloneNode(true);
    var thumbProto = thumbItems[0].cloneNode(true);
    slides.forEach(removeNode);
    thumbItems.forEach(removeNode);
    productState.images = images;

    function showSlide(index) {
      productState.slide = index;
      track.style.transitionDuration = '300ms';
      track.style.transform = 'translateX(' + (-index * swipe.offsetWidth) + 'px)';
      qsa('.img-item img', thumbs).forEach(function (img, i) {
        img.setAttribute('data-state', i === index ? 'act' : 'default');
      });
    }
    productState.showSlide = showSlide;

    images.forEach(function (src, i) {
      var slide = slideProto.cloneNode(true);
      var big = qs('img', slide);
      if (big) { big.src = src; big.alt = p.name; }
      track.appendChild(slide);

      var thumb = thumbProto.cloneNode(true);
      var small = qs('img', thumb);
      if (small) { small.src = src; small.alt = p.name; }
      thumb.style.cursor = 'pointer';
      thumb.addEventListener('click', function () { showSlide(i); });
      thumbs.appendChild(thumb);
    });
    showSlide(0);
    window.addEventListener('resize', function () { showSlide(productState.slide); });
  }

  // Variant names are stored as "Color: Ink Black / Storage: 128GB" — rebuild the option groups from them.
  function parseSpec(specName) {
    return String(specName || '').split(' / ').map(function (part) {
      var k = part.indexOf(': ');
      return k === -1 ? { label: 'Option', value: part } : { label: part.slice(0, k), value: part.slice(k + 2) };
    });
  }

  function fillVariants(p) {
    var groupNodes = qsa('.buyer-infos .info-item').filter(function (el) { return qs('.label.info-item-spec', el); });
    if (!groupNodes.length) return;
    var parent = groupNodes[0].parentNode;
    var insertBefore = groupNodes[groupNodes.length - 1].nextSibling;
    var groupProto = groupNodes[0].cloneNode(true);
    groupNodes.forEach(removeNode);

    var skus = p.skus || [];
    if (!skus.length) return;
    var parsed = skus.map(function (s) { return parseSpec(s.spec_name); });

    var groups = parsed[0].map(function (first, gi) {
      var seen = {};
      var options = [];
      parsed.forEach(function (parts, si) {
        var part = parts[gi];
        if (!part || seen[part.value]) return;
        seen[part.value] = true;
        // Only the first group (colour) shows option photos; other groups (storage, size) are text only.
        options.push({ value: part.value, image: gi === 0 ? skus[si].image_url : null });
      });
      return { label: first.label, options: options };
    });

    function matchSku() {
      for (var si = 0; si < parsed.length; si++) {
        var ok = true;
        for (var gi = 0; gi < groups.length; gi++) {
          if (productState.selected[gi] === undefined || !parsed[si][gi] || parsed[si][gi].value !== productState.selected[gi]) { ok = false; break; }
        }
        if (ok) return skus[si];
      }
      return null;
    }

    groups.forEach(function (group, gi) {
      var node = groupProto.cloneNode(true);
      var label = qs('.label.info-item-spec', node);
      var valueEl = qs('.value', node);
      var boxProto = qs('.spec-btn-box', node).cloneNode(true);
      if (label) label.textContent = group.label + ': ';
      valueEl.innerHTML = '';

      group.options.forEach(function (option) {
        var box = boxProto.cloneNode(true);
        var btn = qs('.sku-btn', box);
        var imgBox = qs('.sku-img-box', btn);
        var img = qs('img', btn);
        if (img && option.image) { img.src = option.image; img.alt = option.value; }
        else if (img) { removeNode(img); }
        // The button's text is the text node after the image box.
        var textNode = null;
        for (var c = 0; c < btn.childNodes.length; c++) { if (btn.childNodes[c].nodeType === 3) textNode = btn.childNodes[c]; }
        if (!textNode) { textNode = document.createTextNode(''); btn.appendChild(textNode); }
        textNode.nodeValue = ' ' + option.value;
        if (!imgBox) { /* keep markup as-is */ }
        btn.setAttribute('select', '0');
        btn.style.cursor = 'pointer';
        btn.addEventListener('click', function () {
          qsa('.sku-btn', valueEl).forEach(function (b) { b.setAttribute('select', '0'); });
          btn.setAttribute('select', '1');
          productState.selected[gi] = option.value;
          var sku = matchSku();
          window.__kmSelectedSku = sku;
          var wanted = option.image || (sku && sku.image_url);
          var at = wanted ? productState.images.indexOf(wanted) : -1;
          if (at !== -1) productState.showSlide(at);
        });
        valueEl.appendChild(box);
      });
      parent.insertBefore(node, insertBefore);
    });
  }

  function fillDescription(p) {
    var card = qs('.specification-card');
    if (!card) return;
    card.innerHTML = '';
    var body = document.createElement('div');
    body.className = 'km-description';
    body.style.cssText = 'white-space:pre-line;padding:16px;line-height:1.6;font-size:14px;color:#333;';
    body.textContent = p.description || '';
    card.appendChild(body);
  }

  function bindQuantity() {
    var input = qs('.van-stepper__input');
    var plus = qs('.van-stepper__plus');
    var minus = qs('.van-stepper__minus');
    if (!input || !plus || !minus) return;
    function setQty(n) {
      n = Math.max(1, Math.min(99, parseInt(n, 10) || 1));
      input.value = n;
      if (n <= 1) minus.classList.add('van-stepper__minus--disabled'); else minus.classList.remove('van-stepper__minus--disabled');
      window.__kmQuantity = n;
    }
    plus.addEventListener('click', function () { setQty((parseInt(input.value, 10) || 1) + 1); });
    minus.addEventListener('click', function () { setQty((parseInt(input.value, 10) || 1) - 1); });
    input.addEventListener('change', function () { setQty(input.value); });
    setQty(1);
  }

  function fillProductPage() {
    var data = window.__KM_PRODUCT__;
    if (!data || !data.product) return;
    var p = data.product;
    try {
      fillBreadcrumbs(data);
      setText('.product-title', p.name);
      fillRating(p);
      fillPrice(p);
      fillGallery(p);
      fillVariants(p);
      fillDescription(p);
      setText('.store-title', p.seller_name || '');
      bindQuantity();
    } catch (err) {
      console.warn('[kilimall-ui] product page fill error:', err);
    }
    removeNode(document.getElementById('km-hide')); // reveal the page
  }

  document.addEventListener('DOMContentLoaded', function () {
    enforceKenyaRegion();
    fetchUserProfile();
    watchForSearchBar();
    loadSearchPageResults();
    loadHomepageCMS();
    fillProductPage();
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(function () {});
  });

})();




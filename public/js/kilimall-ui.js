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
    if (q) window.location.href = '/search/010616.html?q=' + encodeURIComponent(q);
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
      .then(function (products) { if (products) renderSearchResults(products, query); })
      .catch(function (err) { console.warn('Search fetch error:', err); });
  }

  function renderSearchResults(products, query) {
    var container = document.querySelector('.result-wrapper, .result-listings-wrapper, .product-list-wrapper, .wap-div');
    if (!container) return;
    var grid = container.querySelector('.result-listings, .product-list, .goods-list');
    if (!grid) {
      var wrap = container.querySelector('.result-listings-wrapper') || container;
      if (!container.querySelector('.result-listings-wrapper')) {
        wrap = document.createElement('div');
        wrap.className = 'result-listings-wrapper';
        container.appendChild(wrap);
      }
      grid = document.createElement('div');
      grid.className = 'result-listings';
      grid.style.cssText = 'display:flex;flex-wrap:wrap;gap:16px;padding:16px;background:#fff;border-radius:8px;margin-top:16px;';
      wrap.appendChild(grid);
    }
    if (!products || !products.length) {
      grid.innerHTML = '<div style="padding:40px;text-align:center;width:100%;font-size:16px;color:#666;">No products found for "<strong>' + esc(query) + '</strong>".</div>';
      return;
    }
    grid.innerHTML = products.map(function (p) {
      return '<div style="background:#fff;border:1px solid #eee;border-radius:8px;padding:12px;width:220px;box-shadow:0 2px 4px rgba(0,0,0,.05);">' +
        '<a href="/listing/' + p.id + '.html" style="text-decoration:none;color:inherit;">' +
        '<img src="' + (p.thumbnail || p.image_url || 'images/loading_default.33a46.png') + '" alt="' + esc(p.title || p.name) + '" style="width:100%;height:180px;object-fit:contain;">' +
        '<h4 style="font-size:14px;margin:8px 0;overflow:hidden;line-height:1.4;">' + esc(p.title || p.name) + '</h4>' +
        '<div style="color:#dd3131;font-weight:bold;">KSh ' + Number(p.price || p.min_price || 0).toLocaleString() + '</div>' +
        '</a></div>';
    }).join('');
  }

  function esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function loadHomepageCMS() {
    if (window.location.pathname !== '/' && window.location.pathname.indexOf('index.html') === -1) return;
    fetch('/api/search-keywords/hot')
      .then(function (res) { if (res.ok) return res.json(); })
      .then(function (kws) {
        if (!kws || !kws.length) return;
        var c = document.querySelector('.hot-words, .search-keywords, .hot-keys');
        if (c) c.innerHTML = kws.map(function (k) {
          return '<a href="/search/010616.html?q=' + encodeURIComponent(k.keyword) + '" style="margin-right:12px;color:#666;font-size:13px;">' + esc(k.keyword) + '</a>';
        }).join('');
      })
      .catch(function () {});
  }

  document.addEventListener('DOMContentLoaded', function () {
    enforceKenyaRegion();
    fetchUserProfile();
    watchForSearchBar();
    loadSearchPageResults();
    loadHomepageCMS();
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(function () {});
  });

})();

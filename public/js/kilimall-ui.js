/**
 * Kilimall Frontend UI Bridge (Phase 9)
 * Connects static HTML pages to the Express REST API (/api/*)
 * - Region locking: Kenya (KES) fixed
 * - HTTP-only cookie auth integration
 * - CMS & Catalog data binding
 * - Search Bar submission & search results rendering
 * - Cart & Checkout state management
 */

(function () {
  'use strict';

  // 1. Region Lock Enforcement (Rule A8 & Q3 decision)
  function enforceKenyaRegion() {
    document.querySelectorAll('.region-select, .country-selector, .site-region').forEach(el => {
      el.textContent = 'Kenya (KES)';
    });
    // Hide any region modal if triggered
    const regionModal = document.querySelector('.region-modal-container, #region-modal');
    if (regionModal) {
      regionModal.style.display = 'none';
    }
  }

  // 2. Fetch User Profile (Cookie-based auth)
  async function fetchUserProfile() {
    try {
      const res = await fetch('/api/auth/me', { credentials: 'same-origin' });
      if (res.ok) {
        const data = await res.json();
        updateUserHeader(data.user);
        fetchUserCart();
      }
    } catch (err) {
      console.warn('Auth check skipped:', err);
    }
  }

  // 3. Update User Header UI
  function updateUserHeader(user) {
    if (!user) return;
    const userNodes = document.querySelectorAll('.user-name, .account-title, .user-info-name');
    userNodes.forEach(node => {
      node.textContent = user.name || user.email.split('@')[0];
    });
  }

  // 4. Fetch Cart
  async function fetchUserCart() {
    try {
      const res = await fetch('/api/cart', { credentials: 'same-origin' });
      if (res.ok) {
        const data = await res.json();
        const count = data.item_count || 0;
        document.querySelectorAll('.cart-count, .cart-num, #cart-badge').forEach(badge => {
          badge.textContent = count;
        });
      }
    } catch (err) {
      console.warn('Cart update skipped:', err);
    }
  }

  // 5. Connect Search Bar
  function triggerSearch(query) {
    const trimmed = (query || '').trim();
    if (trimmed) {
      window.location.href = `/search/010616.html?q=${encodeURIComponent(trimmed)}`;
    }
  }

  function bindSearchBar() {
    // Target inputs matching Nuxt/Vue field controls or standard search inputs
    const searchInputs = document.querySelectorAll(
      '.van-field__control, .search-input, #pc__search-input input, input[type="search"], input[placeholder*="looking"], input[placeholder*="Search"]'
    );

    searchInputs.forEach(input => {
      input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
          e.preventDefault();
          triggerSearch(input.value);
        }
      });

      const form = input.closest('form');
      if (form) {
        form.addEventListener('submit', function (e) {
          e.preventDefault();
          triggerSearch(input.value);
        });
      }
    });

    // Target search buttons (e.g. div.search-button)
    const searchButtons = document.querySelectorAll(
      '.search-button, .search-btn, #pc__search-input .search-button, .search-input-box .search-button'
    );

    searchButtons.forEach(btn => {
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        const container = btn.closest('.input, .search-input-box, .search-bar') || document;
        const input = container.querySelector('input');
        const query = input ? input.value : '';
        triggerSearch(query);
      });
    });
  }

  // 6. Render Search Results Page
  async function loadSearchPageResults() {
    if (!window.location.pathname.includes('/search')) {
      return;
    }

    const urlParams = new URLSearchParams(window.location.search);
    const query = urlParams.get('q');

    // Pre-fill search input field with query parameter
    const searchInputs = document.querySelectorAll(
      '.van-field__control, .search-input, #pc__search-input input, input[placeholder*="looking"]'
    );
    if (query) {
      searchInputs.forEach(input => {
        input.value = query;
      });
    }

    // Hide Nuxt router loading spinner if visible
    const loader = document.querySelector('.router-jump-animation');
    if (loader) {
      loader.style.display = 'none';
    }

    if (!query) return;

    // Update breadcrumbs / page title
    const lastBreadcrumb = document.querySelector('.last-b-name, .breadcrumb-current');
    if (lastBreadcrumb) {
      lastBreadcrumb.textContent = query;
    }

    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
      if (res.ok) {
        const products = await res.json();
        renderSearchResults(products, query);
      }
    } catch (err) {
      console.warn('Search fetch error:', err);
    }
  }

  function renderSearchResults(products, query) {
    const container = document.querySelector('.result-wrapper, .result-listings-wrapper, .product-list-wrapper, .wap-div');
    if (!container) return;

    let listingGrid = container.querySelector('.result-listings, .product-list, .goods-list');

    if (!listingGrid) {
      let listingsWrapper = container.querySelector('.result-listings-wrapper');
      if (!listingsWrapper) {
        listingsWrapper = document.createElement('div');
        listingsWrapper.className = 'result-listings-wrapper';
        container.appendChild(listingsWrapper);
      }
      listingGrid = document.createElement('div');
      listingGrid.className = 'result-listings';
      listingGrid.style.cssText = 'display: flex; flex-wrap: wrap; gap: 16px; padding: 16px; background: #fff; border-radius: 8px; margin-top: 16px;';
      listingsWrapper.appendChild(listingGrid);
    }

    if (!products || products.length === 0) {
      listingGrid.innerHTML = `
        <div style="padding: 40px; text-align: center; width: 100%; font-size: 16px; color: #666;">
          No products found for "<strong>${escapeHtml(query)}</strong>".
        </div>`;
      return;
    }

    listingGrid.innerHTML = products.map(p => `
      <div class="product-card-item" style="background: #fff; border: 1px solid #eee; border-radius: 8px; padding: 12px; width: 220px; box-shadow: 0 2px 4px rgba(0,0,0,0.05); text-align: left;">
        <a href="/listing/${p.id}.html" style="text-decoration: none; color: inherit;">
          <img src="${p.thumbnail || p.image_url || 'images/loading_default.33a46.png'}" alt="${escapeHtml(p.title || p.name)}" style="width: 100%; height: 180px; object-fit: contain; border-radius: 4px;">
          <h4 style="font-size: 14px; margin: 8px 0; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; line-height: 1.4;">${escapeHtml(p.title || p.name)}</h4>
          <div style="color: #dd3131; font-weight: bold; font-size: 16px; margin-top: 4px;">KSh ${Number(p.price || p.min_price || 0).toLocaleString()}</div>
        </a>
      </div>
    `).join('');
  }

  function escapeHtml(str) {
    return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // 7. Connect CMS Content (Homepage)
  async function loadHomepageCMS() {
    if (window.location.pathname !== '/' && !window.location.pathname.endsWith('index.html')) {
      return;
    }

    try {
      const kwRes = await fetch('/api/search-keywords/hot');
      if (kwRes.ok) {
        const keywords = await kwRes.json();
        const kwContainer = document.querySelector('.hot-words, .search-keywords, .hot-keys');
        if (kwContainer && keywords.length > 0) {
          kwContainer.innerHTML = keywords.map(k => `<a href="/search/010616.html?q=${encodeURIComponent(k.keyword)}" style="margin-right: 12px; color: #666; font-size: 13px;">${escapeHtml(k.keyword)}</a>`).join('');
        }
      }
    } catch (err) {
      console.warn('CMS loading skipped:', err);
    }
  }

  // DOM Content Loaded Handler
  document.addEventListener('DOMContentLoaded', function () {
    enforceKenyaRegion();
    fetchUserProfile();
    bindSearchBar();
    loadSearchPageResults();
    loadHomepageCMS();

    // Register Service Worker (Subphase 9.9)
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
  });
})();

/**
 * Kilimall Frontend UI Bridge (Phase 9)
 * Connects static HTML pages to the Express REST API (/api/*)
 * - Region locking: Kenya (KES) fixed
 * - HTTP-only cookie auth integration
 * - CMS & Catalog data binding
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
  function bindSearchBar() {
    const searchInputs = document.querySelectorAll('input[type="search"], input.search-input, #search-keyword');
    searchInputs.forEach(input => {
      const form = input.closest('form');
      if (form) {
        form.addEventListener('submit', function (e) {
          e.preventDefault();
          const query = input.value.trim();
          if (query) {
            window.location.href = `/search/010616.html?q=${encodeURIComponent(query)}`;
          }
        });
      }
    });
  }

  // 6. Connect CMS Content (Homepage)
  async function loadHomepageCMS() {
    if (window.location.pathname !== '/' && !window.location.pathname.endsWith('index.html')) {
      return;
    }

    try {
      // Hot keywords
      const kwRes = await fetch('/api/search-keywords/hot');
      if (kwRes.ok) {
        const keywords = await kwRes.json();
        const kwContainer = document.querySelector('.hot-words, .search-keywords');
        if (kwContainer && keywords.length > 0) {
          kwContainer.innerHTML = keywords.map(k => `<a href="/search/010616.html?q=${encodeURIComponent(k.keyword)}">${k.keyword}</a>`).join(' ');
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
    loadHomepageCMS();

    // Register Service Worker (Subphase 9.9)
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
  });
})();

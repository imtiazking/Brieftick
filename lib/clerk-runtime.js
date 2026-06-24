/**
 * Clerk runtime bootstrap for static pages.
 * Fetches /api/public-config and injects Clerk JS with the publishable key.
 */
(function (global) {
  'use strict';

  function isProductionForgeniqHost() {
    var host = global.location && global.location.hostname;
    return host && host.indexOf('forgeniq.com') !== -1;
  }

  function guardClerkKey(key) {
    if (!key || typeof key !== 'string') {
      throw new Error('Missing clerkPublishableKey from /api/public-config');
    }
    if (isProductionForgeniqHost() && key.indexOf('pk_test_') === 0) {
      console.error(
        '[Clerk] FORGENIQ production cannot load Clerk with a pk_test key. ' +
          'Set NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY to pk_live_ in Vercel.'
      );
      global.__btClerkBlocked = true;
      throw new Error('Clerk production key guard');
    }
    return key;
  }

  function fetchPublicConfig() {
    if (!global.__btPublicConfigPromise) {
      global.__btPublicConfigPromise = fetch('/api/public-config', { credentials: 'same-origin' })
        .then(function (res) {
          if (!res.ok) throw new Error('public-config HTTP ' + res.status);
          return res.json();
        })
        .then(function (cfg) {
          var key = guardClerkKey(cfg && cfg.clerkPublishableKey);
          global.__btClerkPublishableKey = key;
          global.__FORGENIQ_CONFIG__ = Object.assign({}, global.__FORGENIQ_CONFIG__ || {}, cfg);
          return cfg;
        });
    }
    return global.__btPublicConfigPromise;
  }

  function injectClerkScript(publishableKey) {
    return new Promise(function (resolve, reject) {
      if (global.Clerk) {
        resolve(global.Clerk);
        return;
      }
      var existing = document.querySelector('script[data-clerk-publishable-key]');
      if (existing) {
        if (global.Clerk) {
          resolve(global.Clerk);
          return;
        }
        existing.addEventListener('load', function () { resolve(global.Clerk); });
        existing.addEventListener('error', function () { reject(new Error('Clerk script failed')); });
        return;
      }
      var s = document.createElement('script');
      s.async = true;
      s.crossOrigin = 'anonymous';
      s.setAttribute('data-clerk-publishable-key', publishableKey);
      s.src = 'https://cdn.jsdelivr.net/npm/@clerk/clerk-js@5/dist/clerk.browser.js';
      s.onerror = function () { reject(new Error('Clerk script failed to load')); };
      s.onload = function () { resolve(global.Clerk); };
      document.head.appendChild(s);
    });
  }

  function ensureClerkScriptLoaded(cb) {
    if (global.__btClerkBlocked) {
      return Promise.reject(new Error('Clerk blocked on production'));
    }
    if (global.__btClerkInitialized && global.Clerk) {
      var done = cb && cb();
      return Promise.resolve(done).then(function () { return global.Clerk; });
    }
    if (!global.__btClerkLoading) {
      global.__btClerkLoading = fetchPublicConfig()
        .then(function () { return injectClerkScript(global.__btClerkPublishableKey); })
        .then(function (clerk) {
          var boot = typeof global.initClerk === 'function' ? global.initClerk() : Promise.resolve();
          return Promise.resolve(boot).then(function () {
            if (cb) cb();
            return clerk;
          });
        })
        .catch(function (err) {
          global.__btClerkLoading = null;
          throw err;
        });
    }
    return global.__btClerkLoading.then(function (c) {
      if (!global.__btClerkInitialized && typeof global.initClerk === 'function') {
        return global.initClerk().then(function () {
          if (cb) cb();
          return c;
        });
      }
      if (cb) cb();
      return c;
    });
  }

  global.__btFetchPublicConfig = fetchPublicConfig;
  global.__btInjectClerkScript = injectClerkScript;
  global.__btEnsureClerk = ensureClerkScriptLoaded;
  global.__btLoadClerkFromConfig = function () {
    return ensureClerkScriptLoaded();
  };
})(typeof window !== 'undefined' ? window : globalThis);

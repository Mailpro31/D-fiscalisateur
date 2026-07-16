/* Utilitaires numériques partagés par le moteur. */
(function (g) {
  'use strict';
  const DFISC = (g.DFISC = g.DFISC || {});

  DFISC.util = {
    n(v) {
      const x = typeof v === 'string' ? parseFloat(String(v).replace(',', '.')) : v;
      return Number.isFinite(x) ? x : 0;
    },
    clamp(v, min, max) {
      return Math.min(Math.max(v, min), max);
    },
    round2(v) {
      return Math.round(v * 100) / 100;
    },
    euro(v) {
      return Math.round(v);
    },
    pct(v) {
      return v / 100;
    },
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);

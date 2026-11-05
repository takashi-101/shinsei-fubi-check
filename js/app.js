/*
 * 画面の切り替えと、閉じる前の確認。
 */
(function () {
  'use strict';
  var App = window.App = window.App || {};

  function $(id) { return document.getElementById(id); }

  function showTab(name) {
    var tabs = document.querySelectorAll('.tabs [role="tab"]');
    var current = document.querySelector('.tabs [aria-selected="true"]');
    if (current && current.dataset.tab === 'settings' && name !== 'settings' && App.settingsUI && !App.settingsUI.confirmLeave()) return;
    Array.prototype.forEach.call(tabs, function (b) {
      var on = b.dataset.tab === name;
      b.setAttribute('aria-selected', on ? 'true' : 'false');
      b.tabIndex = on ? 0 : -1;
      $('panel-' + b.dataset.tab).hidden = !on;
    });
    if (App.onTabShown) App.onTabShown(name);
  }
  App.showTab = showTab;

  /** 閉じる前の確認が要るか。 */
  App.hasUnsaved = function () {
    if (App.settingsUI && App.settingsUI.isDirty()) return true;
    if (App.checkUI && App.checkUI.hasUnsaved()) return true;
    return false;
  };

  document.addEventListener('DOMContentLoaded', function () {
    Array.prototype.forEach.call(document.querySelectorAll('.tabs [role="tab"]'), function (b) {
      b.addEventListener('click', function () { showTab(b.dataset.tab); });
    });
    App.settingsUI.init();
    if (App.checkUI) App.checkUI.init();
    if (App.aiUI) App.aiUI.init();
    showTab(document.querySelector('.tabs [role="tab"]').dataset.tab);
    window.addEventListener('beforeunload', function (e) {
      if (App.hasUnsaved()) { e.preventDefault(); e.returnValue = ''; return ''; }
    });
  });
})();

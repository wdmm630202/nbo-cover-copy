import { bindMakeoverFrame, notifyMakeoverFrame, resolveCreationMode, creationModeURL } from './makeover-host.mjs?v=20261114-complete-mobile-export';

const tabs = [...document.querySelectorAll('[data-creation-mode]')];
const coverPanel = document.getElementById('coverPanel');
const makeoverPanel = document.getElementById('makeoverPanel');
const coverPage = document.getElementById('coverPage');
let iframe;
let cleanup;

function showMode(mode, updateURL = false) {
  const makeover = mode === 'makeover';
  const returningToCover = !makeover && coverPanel.hidden;
  coverPanel.hidden = makeover;
  makeoverPanel.hidden = !makeover;
  document.body.classList.add('creation-modes-ready');
  document.body.classList.toggle('creation-makeover-active', makeover);
  for (const tab of tabs) {
    const selected = tab.dataset.creationMode === mode;
    tab.setAttribute('aria-selected', String(selected));
    tab.tabIndex = selected ? 0 : -1;
  }
  if (makeover && !iframe && !coverPage.classList.contains('is-hidden')) {
    iframe = document.createElement('iframe');
    iframe.id = 'makeoverFrame';
    iframe.title = '素人改造对比图编辑器';
    iframe.className = 'creation-makeover-frame';
    iframe.style.height = '1200px';
    cleanup = bindMakeoverFrame(iframe, (height) => { iframe.style.height = `${height}px`; });
    iframe.src = './makeover/index.html?embed=1&v=20261114-complete-mobile-export';
    makeoverPanel.append(iframe);
  }
  if (makeover && iframe) requestAnimationFrame(() => notifyMakeoverFrame(iframe));
  if (returningToCover) requestAnimationFrame(() => {
    if (!coverPanel.hidden) window.dispatchEvent(new Event('resize'));
  });
  if (updateURL) history.replaceState(history.state, '', creationModeURL(location.href, mode));
}

for (const tab of tabs) {
  tab.addEventListener('click', () => showMode(tab.dataset.creationMode, true));
  tab.addEventListener('keydown', (event) => {
    let index = tabs.indexOf(tab);
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') index = (index + 1) % tabs.length;
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') index = (index + tabs.length - 1) % tabs.length;
    else if (event.key === 'Home') index = 0;
    else if (event.key === 'End') index = tabs.length - 1;
    else return;
    event.preventDefault();
    showMode(tabs[index].dataset.creationMode, true);
    tabs[index].focus();
  });
}
window.addEventListener('popstate', () => showMode(resolveCreationMode(location.search)));
const gateObserver = new MutationObserver(() => {
  if (!coverPage.classList.contains('is-hidden') && !makeoverPanel.hidden) showMode('makeover');
});
gateObserver.observe(coverPage, { attributes: true, attributeFilter: ['class'] });
window.addEventListener('pagehide', (event) => {
  if (!event.persisted) { cleanup?.(); gateObserver.disconnect(); }
});
showMode(resolveCreationMode(location.search));

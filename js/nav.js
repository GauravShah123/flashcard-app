(function () {
  const mEdit = document.getElementById('mnuEdit');
  const mReview = document.getElementById('mnuReview');
  const cardEl = document.getElementById('card');
  
  // Bottom nav actions
  if (mEdit)   mEdit.addEventListener('click', () => { if (typeof showEdit === 'function') showEdit(); });
  if (mReview) mReview.addEventListener('click', () => { if (typeof startReview === 'function') startReview(); });
  
  function updateBottomNavActive() {
if (!mEdit || !mReview || typeof view === 'undefined') return;
mEdit.classList.toggle('primary', view === 'edit');
mReview.classList.toggle('primary', view === 'review');
  }
  
  // Patch renderView to refresh bottom nav highlight
  if (typeof renderView === 'function') {
const _renderView = renderView;
window.renderView = function () { _renderView(); updateBottomNavActive(); };
// run once on load
updateBottomNavActive();
  }
  
  // Flip animation: trigger, then flip content mid-way
  function animateFlip() {
if (!cardEl) return;
cardEl.classList.remove('quickflip'); // reset
void cardEl.offsetWidth;              // reflow to restart animation
cardEl.classList.add('quickflip');
  }
  
  if (typeof flipCard === 'function') {
const _flipCard = flipCard;
window.flipCard = function () {
  animateFlip();
  // Change content halfway through the animation
  setTimeout(_flipCard, 80);
};
  }
  
  // Render icons in new nav
  if (window.lucide && lucide.createIcons) { try { lucide.createIcons(); } catch(_) {} }
})();
  